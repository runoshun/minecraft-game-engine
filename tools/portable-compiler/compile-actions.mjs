import { fail } from "./utils.mjs";
import { interactionTag, stateHolder } from "./compile-context.mjs";
import { compileAabbIf, compileCircleIf, compileCircleCapsuleIf, compileTriggerIf } from "./compile-collisions.mjs";
import { compileGridAction } from "./compile-grid.mjs";
import { compilePersistentGridAction } from "./compile-persistent.mjs";
import { compileSelectionAction } from "./compile-selection.mjs";
import { compileFormAction } from "./compile-form.mjs";
import { playerSetSelector } from "./compile-player.mjs";
import { compileControllerAdvance } from "./compile-interaction-controller.mjs";
import { compileItemGive, compilePlaceableRemove } from "./compile-placeable.mjs";

function score(value, ctx) { return ctx.score(value); }
function operation(targetHolder, targetObjective, operator, value, ctx) {
  const source = score(value, ctx);
  return `scoreboard players operation ${targetHolder} ${targetObjective} ${operator} ${source.holder} ${source.objective}`;
}
function actionStateHolder(action, ctx) {
  return action.session ? ctx.sessionStateHolder(action.session, action.target) : stateHolder(action.target);
}
function persistentTarget(action, ctx) {
  return { holder: ctx.persistentStateHolder(action.target, action.session ?? null), objective: ctx.persistentObjective };
}

function gcd(a, b) {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function compileConstantFactor(targetHolder, targetObjective, kind, factorRaw, lines, ctx) {
  if (kind === "mul" && factorRaw === 0) {
    lines.push(`scoreboard players set ${targetHolder} ${targetObjective} 0`);
    return;
  }
  if (kind === "div" && factorRaw === 0) fail("portable fixed-point division factor may not resolve to zero");

  const magnitude = Math.abs(factorRaw);
  if (factorRaw < 0) {
    ctx.usesNegate = true;
    lines.push(`scoreboard players operation ${targetHolder} ${targetObjective} *= #neg1 ${ctx.objective}`);
  }

  const left = kind === "mul" ? magnitude : ctx.program.fixedPoint;
  const right = kind === "mul" ? ctx.program.fixedPoint : magnitude;
  const common = gcd(left, right);
  const numerator = left / common, denominator = right / common;
  if (numerator > 2147483647 || denominator > 2147483647) fail("portable fixed-point factor cannot be represented by signed scoreboard constants after reduction");
  if (numerator !== 1) lines.push(`scoreboard players operation ${targetHolder} ${targetObjective} *= ${ctx.constantHolder(numerator)} ${ctx.objective}`);
  if (denominator !== 1) lines.push(`scoreboard players operation ${targetHolder} ${targetObjective} /= ${ctx.constantHolder(denominator)} ${ctx.objective}`);
}

function isComparison(test) {
  return ["eq", "ne", "lt", "lte", "gt", "gte"].includes(test.op);
}

function comparisonCondition(test, positive, ctx) {
  const left = score(test.left, ctx), right = score(test.right, ctx);
  const comparator = ({ eq: "=", ne: "=", lt: "<", lte: "<=", gt: ">", gte: ">=" })[test.op];
  const naturallyPositive = test.op !== "ne";
  return `${positive === naturallyPositive ? "if" : "unless"} score ${left.holder} ${left.objective} ${comparator} ${right.holder} ${right.objective}`;
}

function conditionEvaluator(test, ctx) {
  const name = ctx.nextConditionFunctionName(), body = [];
  compileConditionReturn(test, body, ctx);
  ctx.functions.set(name, body);
  return name;
}

function compoundChildScore(test, lines, ctx) {
  const fn = conditionEvaluator(test, ctx), temp = ctx.nextConditionTemp();
  lines.push(`execute store result score ${temp} ${ctx.objective} run function ${ctx.namespace}:portable/${fn}`);
  return temp;
}

function compileConditionReturn(test, lines, ctx) {
  if (isComparison(test)) {
    lines.push(`execute ${comparisonCondition(test, true, ctx)} run return 1`);
    lines.push("return 0");
    return;
  }
  if (test.op === "all") {
    for (const child of test.conditions) {
      if (isComparison(child)) lines.push(`execute ${comparisonCondition(child, false, ctx)} run return 0`);
      else {
        const temp = compoundChildScore(child, lines, ctx);
        lines.push(`execute unless score ${temp} ${ctx.objective} matches 1 run return 0`);
      }
    }
    lines.push("return 1");
    return;
  }
  if (test.op === "any") {
    for (const child of test.conditions) {
      if (isComparison(child)) lines.push(`execute ${comparisonCondition(child, true, ctx)} run return 1`);
      else {
        const temp = compoundChildScore(child, lines, ctx);
        lines.push(`execute if score ${temp} ${ctx.objective} matches 1 run return 1`);
      }
    }
    lines.push("return 0");
    return;
  }
  if (test.op === "not") {
    if (isComparison(test.condition)) {
      lines.push(`execute ${comparisonCondition(test.condition, true, ctx)} run return 0`);
      lines.push("return 1");
    } else {
      const temp = compoundChildScore(test.condition, lines, ctx);
      lines.push(`execute if score ${temp} ${ctx.objective} matches 1 run return 0`);
      lines.push("return 1");
    }
    return;
  }
  fail(`unsupported portable condition: ${test.op}`);
}

export function condition(test, positive, ctx, lines) {
  if (isComparison(test)) return comparisonCondition(test, positive, ctx);
  if (!lines) fail("compound condition lowering requires an output command list");
  const fn = conditionEvaluator(test, ctx), temp = ctx.nextConditionTemp();
  lines.push(`execute store result score ${temp} ${ctx.objective} run function ${ctx.namespace}:portable/${fn}`);
  return `${positive ? "if" : "unless"} score ${temp} ${ctx.objective} matches 1`;
}

function playerCondition(test, selector, positive, lines, ctx) {
  if (isComparison(test)) return comparisonCondition(test, positive, ctx);
  const fn = conditionEvaluator(test, ctx);
  lines.push(`execute as ${selector} store result score @s ${ctx.objective} run function ${ctx.namespace}:portable/${fn}`);
  return `${positive ? "if" : "unless"} score @s ${ctx.objective} matches 1`;
}

function branchFunction(actions, ctx) {
  const name = ctx.nextBranchFunctionName(), body = [];
  compileActions(actions, body, ctx);
  ctx.functions.set(name, body);
  return name;
}

function exclusiveIfFunction(test, thenActions, elseActions, ctx) {
  const thenFn = branchFunction(thenActions, ctx);
  const elseFn = branchFunction(elseActions, ctx);
  const name = ctx.nextBranchFunctionName(), body = [];
  const positive = condition(test, true, ctx, body);
  body.push(`execute ${positive} run return run function ${ctx.namespace}:portable/${thenFn}`);
  body.push(`return run function ${ctx.namespace}:portable/${elseFn}`);
  ctx.functions.set(name, body);
  return name;
}

export function compileActions(actions, lines, ctx) {
  for (const action of actions) {
    if (compileSelectionAction(action, lines, ctx)) continue;
    if (compileFormAction(action, lines, ctx)) continue;
    if (compilePersistentGridAction(action, lines, ctx)) continue;
    if (compileGridAction(action, lines, ctx)) continue;
    switch (action.op) {
      case "set": {
        const target = actionStateHolder(action, ctx);
        if (action.value.kind === "constant") lines.push(`scoreboard players set ${target} ${ctx.objective} ${action.value.raw}`);
        else lines.push(operation(target, ctx.objective, "=", action.value, ctx));
        break;
      }
      case "add": lines.push(operation(actionStateHolder(action, ctx), ctx.objective, "+=", action.value, ctx)); break;
      case "sub": lines.push(operation(actionStateHolder(action, ctx), ctx.objective, "-=", action.value, ctx)); break;
      case "mul": compileConstantFactor(actionStateHolder(action, ctx), ctx.objective, "mul", action.factorRaw, lines, ctx); break;
      case "div": compileConstantFactor(actionStateHolder(action, ctx), ctx.objective, "div", action.factorRaw, lines, ctx); break;
      case "negate":
        ctx.usesNegate = true;
        lines.push(`scoreboard players operation ${actionStateHolder(action, ctx)} ${ctx.objective} *= #neg1 ${ctx.objective}`);
        break;
      case "persistent_set": {
        const target = persistentTarget(action, ctx);
        if (action.value.kind === "constant") lines.push(`scoreboard players set ${target.holder} ${target.objective} ${action.value.raw}`);
        else lines.push(operation(target.holder, target.objective, "=", action.value, ctx));
        break;
      }
      case "persistent_add": { const target = persistentTarget(action, ctx); lines.push(operation(target.holder, target.objective, "+=", action.value, ctx)); break; }
      case "persistent_sub": { const target = persistentTarget(action, ctx); lines.push(operation(target.holder, target.objective, "-=", action.value, ctx)); break; }
      case "persistent_mul": { const target = persistentTarget(action, ctx); compileConstantFactor(target.holder, target.objective, "mul", action.factorRaw, lines, ctx); break; }
      case "persistent_div": { const target = persistentTarget(action, ctx); compileConstantFactor(target.holder, target.objective, "div", action.factorRaw, lines, ctx); break; }
      case "persistent_negate": {
        ctx.usesNegate = true;
        const target = persistentTarget(action, ctx);
        lines.push(`scoreboard players operation ${target.holder} ${target.objective} *= #neg1 ${ctx.objective}`);
        break;
      }
      case "player_set": {
        const objective = ctx.playerStateObjective(action.target);
        if (action.value.kind === "constant") lines.push(`scoreboard players set @s ${objective} ${action.value.raw}`);
        else lines.push(operation("@s", objective, "=", action.value, ctx));
        break;
      }
      case "player_add": lines.push(operation("@s", ctx.playerStateObjective(action.target), "+=", action.value, ctx)); break;
      case "player_sub": lines.push(operation("@s", ctx.playerStateObjective(action.target), "-=", action.value, ctx)); break;
      case "player_mul": compileConstantFactor("@s", ctx.playerStateObjective(action.target), "mul", action.factorRaw, lines, ctx); break;
      case "player_div": compileConstantFactor("@s", ctx.playerStateObjective(action.target), "div", action.factorRaw, lines, ctx); break;
      case "player_negate":
        ctx.usesNegate = true;
        lines.push(`scoreboard players operation @s ${ctx.playerStateObjective(action.target)} *= #neg1 ${ctx.objective}`);
        break;
      case "placeable_tick": {
        const fn = ctx.nextBranchFunctionName(), body = [];
        compileActions(action.actions, body, ctx);
        ctx.functions.set(fn, body);
        lines.push(`execute if score ${ctx.placeableActiveHolder(action.placeable, action.slot)} ${ctx.objective} matches ${ctx.program.fixedPoint} run function ${ctx.namespace}:portable/${fn}`);
        break;
      }
      case "placeable_set": {
        const target = ctx.placeableStateHolder(action.placeable, action.slot, action.target);
        if (action.value.kind === "constant") lines.push(`scoreboard players set ${target} ${ctx.objective} ${action.value.raw}`);
        else lines.push(operation(target, ctx.objective, "=", action.value, ctx));
        break;
      }
      case "placeable_add": lines.push(operation(ctx.placeableStateHolder(action.placeable, action.slot, action.target), ctx.objective, "+=", action.value, ctx)); break;
      case "placeable_sub": lines.push(operation(ctx.placeableStateHolder(action.placeable, action.slot, action.target), ctx.objective, "-=", action.value, ctx)); break;
      case "placeable_mul": compileConstantFactor(ctx.placeableStateHolder(action.placeable, action.slot, action.target), ctx.objective, "mul", action.factorRaw, lines, ctx); break;
      case "placeable_div": compileConstantFactor(ctx.placeableStateHolder(action.placeable, action.slot, action.target), ctx.objective, "div", action.factorRaw, lines, ctx); break;
      case "placeable_negate":
        ctx.usesNegate = true;
        lines.push(`scoreboard players operation ${ctx.placeableStateHolder(action.placeable, action.slot, action.target)} ${ctx.objective} *= #neg1 ${ctx.objective}`);
        break;
      case "placeable_remove": compilePlaceableRemove(action, lines, ctx); break;
      case "item_give": compileItemGive(action, lines, ctx); break;
      case "interaction_use": {
        const interaction = ctx.program.interactions.find(value => value.id === action.interaction);
        if (!interaction) fail(`unknown interaction use target: ${action.interaction}`);
        const fn = ctx.nextPlayerFunctionName(), body = [];
        compileActions(action.actions, body, ctx);
        ctx.functions.set(fn, body);
        const selector = `@e[type=minecraft:interaction,tag=${interactionTag(ctx.namespace, interaction.id)},limit=1]`;
        lines.push(`execute in ${interaction.dimension} as ${selector} on target run function ${ctx.namespace}:portable/${fn}`);
        lines.push(`execute in ${interaction.dimension} as ${selector} run data remove entity @s interaction`);
        break;
      }
      case "interaction_controller_claim":
        compileControllerAdvance(action.interaction, lines, ctx, true);
        break;
      case "interaction_controller_return": {
        const interaction = ctx.program.interactions.find(value => value.id === action.interaction);
        if (!interaction) fail(`unknown interaction controller return target: ${action.interaction}`);
        const selector = `@e[type=minecraft:interaction,tag=${interactionTag(ctx.namespace, interaction.id)},limit=1]`;
        lines.push(`execute in ${interaction.dimension} if entity ${selector} run teleport @s ${selector}`);
        compileControllerAdvance(action.interaction, lines, ctx, false);
        break;
      }
      case "interaction_controller_player": {
        const fn = ctx.nextPlayerFunctionName(), body = [];
        compileActions(action.actions, body, ctx);
        ctx.functions.set(fn, body);
        const generation = ctx.interactionControllerGenerationHolder(action.interaction);
        const objective = ctx.interactionControllerObjective(action.interaction);
        lines.push(`execute as @a if score @s ${objective} = ${generation} ${ctx.objective} run function ${ctx.namespace}:portable/${fn}`);
        break;
      }
      case "for_session":
        compileActions(action.actions, lines, ctx);
        break;
      case "for_each_player": {
        const fn = ctx.nextPlayerFunctionName(), body = [];
        compileActions(action.actions, body, ctx);
        ctx.functions.set(fn, body);
        lines.push(`execute as ${playerSetSelector(action.players)} run function ${ctx.namespace}:portable/${fn}`);
        break;
      }
      case "for_single_player": {
        const fn = ctx.nextPlayerFunctionName(), body = [];
        compileActions(action.actions, body, ctx);
        ctx.functions.set(fn, body);
        lines.push(`execute store result score #pc ${ctx.objective} if entity ${playerSetSelector(action.players)}`);
        lines.push(`execute if score #pc ${ctx.objective} matches 1 as ${playerSetSelector(action.players, ["limit=1", "sort=arbitrary"])} run function ${ctx.namespace}:portable/${fn}`);
        break;
      }
      case "player_reduce": {
        const target = actionStateHolder(action, ctx);
        const selector = playerSetSelector(action.players);
        if (action.kind === "count") {
          lines.push(`execute store result score ${target} ${ctx.objective} if entity ${selector}`);
          if (ctx.program.fixedPoint !== 1) lines.push(`scoreboard players operation ${target} ${ctx.objective} *= ${ctx.constantHolder(ctx.program.fixedPoint)} ${ctx.objective}`);
          break;
        }
        if (action.kind === "sum") {
          const source = score(action.value, ctx);
          lines.push(`scoreboard players set ${target} ${ctx.objective} 0`);
          lines.push(`execute as ${selector} run scoreboard players operation ${target} ${ctx.objective} += ${source.holder} ${source.objective}`);
          break;
        }
        if (action.kind === "min" || action.kind === "max") {
          const source = score(action.value, ctx);
          lines.push(`scoreboard players set ${target} ${ctx.objective} ${action.emptyRaw}`);
          lines.push(`execute as ${playerSetSelector(action.players, ["limit=1", "sort=arbitrary"])} run scoreboard players operation ${target} ${ctx.objective} = ${source.holder} ${source.objective}`);
          lines.push(`execute as ${selector} run scoreboard players operation ${target} ${ctx.objective} ${action.kind === "min" ? "<" : ">"} ${source.holder} ${source.objective}`);
          break;
        }
        const trueRaw = ctx.program.fixedPoint;
        if (action.kind === "any") {
          lines.push(`scoreboard players set ${target} ${ctx.objective} 0`);
          lines.push(`execute as ${selector} ${playerCondition(action.condition, selector, true, lines, ctx)} run scoreboard players set ${target} ${ctx.objective} ${trueRaw}`);
          break;
        }
        if (action.kind === "all") {
          lines.push(`scoreboard players set ${target} ${ctx.objective} ${trueRaw}`);
          lines.push(`execute as ${selector} ${playerCondition(action.condition, selector, false, lines, ctx)} run scoreboard players set ${target} ${ctx.objective} 0`);
          break;
        }
        fail(`unsupported player reduction: ${action.kind}`);
        break;
      }
      case "if": {
        if (action.then.length && action.else.length) {
          const fn = exclusiveIfFunction(action.condition, action.then, action.else, ctx);
          lines.push(`function ${ctx.namespace}:portable/${fn}`);
          break;
        }
        if (action.then.length) {
          const fn = branchFunction(action.then, ctx);
          lines.push(`execute ${condition(action.condition, true, ctx, lines)} run function ${ctx.namespace}:portable/${fn}`);
        }
        if (action.else.length) {
          const fn = branchFunction(action.else, ctx);
          lines.push(`execute ${condition(action.condition, false, ctx, lines)} run function ${ctx.namespace}:portable/${fn}`);
        }
        break;
      }
      case "if_aabb": compileAabbIf(action, lines, ctx, compileActions); break;
      case "if_circle": compileCircleIf(action, lines, ctx, compileActions); break;
      case "if_circle_capsule": compileCircleCapsuleIf(action, lines, ctx, compileActions); break;
      case "if_trigger": compileTriggerIf(action, lines, ctx, compileActions); break;
      default: fail(`unsupported portable action: ${action.op}`);
    }
  }
}
