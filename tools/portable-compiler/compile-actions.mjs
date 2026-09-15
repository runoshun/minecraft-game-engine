import { fail } from "./utils.mjs";
import { interactionTag, stateHolder } from "./compile-context.mjs";
import { compileAabbIf, compileCircleIf, compileCircleCapsuleIf, compileTriggerIf } from "./compile-collisions.mjs";
import { compileGridAction } from "./compile-grid.mjs";
import { compilePersistentGridAction } from "./compile-persistent.mjs";
import { compileSelectionAction } from "./compile-selection.mjs";
import { compileFormAction } from "./compile-form.mjs";
import { playerSetSelector } from "./compile-player.mjs";

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

export function condition(test, positive, ctx) {
  const left = score(test.left, ctx), right = score(test.right, ctx);
  const comparator = ({ eq: "=", ne: "=", lt: "<", lte: "<=", gt: ">", gte: ">=" })[test.op];
  const naturallyPositive = test.op !== "ne";
  return `${positive === naturallyPositive ? "if" : "unless"} score ${left.holder} ${left.objective} ${comparator} ${right.holder} ${right.objective}`;
}

function branchFunction(actions, ctx) {
  const name = ctx.nextBranchFunctionName(), body = [];
  compileActions(actions, body, ctx);
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
      case "player_negate":
        ctx.usesNegate = true;
        lines.push(`scoreboard players operation @s ${ctx.playerStateObjective(action.target)} *= #neg1 ${ctx.objective}`);
        break;
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
      case "interaction_controller_claim": {
        const generation = ctx.interactionControllerGenerationHolder(action.interaction);
        const objective = ctx.interactionControllerObjective(action.interaction);
        lines.push(`execute if score ${generation} ${ctx.objective} matches 2147483647 run scoreboard objectives remove ${objective}`);
        lines.push(`execute if score ${generation} ${ctx.objective} matches 2147483647 run scoreboard objectives add ${objective} dummy`);
        lines.push(`execute if score ${generation} ${ctx.objective} matches 2147483647 run scoreboard players set ${generation} ${ctx.objective} 0`);
        lines.push(`scoreboard players add ${generation} ${ctx.objective} 1`);
        lines.push(`scoreboard players operation @s ${objective} = ${generation} ${ctx.objective}`);
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
          lines.push(`execute as ${selector} ${condition(action.condition, true, ctx)} run scoreboard players set ${target} ${ctx.objective} ${trueRaw}`);
          break;
        }
        if (action.kind === "all") {
          lines.push(`scoreboard players set ${target} ${ctx.objective} ${trueRaw}`);
          lines.push(`execute as ${selector} ${condition(action.condition, false, ctx)} run scoreboard players set ${target} ${ctx.objective} 0`);
          break;
        }
        fail(`unsupported player reduction: ${action.kind}`);
        break;
      }
      case "if": {
        if (action.then.length) {
          const fn = branchFunction(action.then, ctx);
          lines.push(`execute ${condition(action.condition, true, ctx)} run function ${ctx.namespace}:portable/${fn}`);
        }
        if (action.else.length) {
          const fn = branchFunction(action.else, ctx);
          lines.push(`execute ${condition(action.condition, false, ctx)} run function ${ctx.namespace}:portable/${fn}`);
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
