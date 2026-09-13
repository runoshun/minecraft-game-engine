import { fail } from "./utils.mjs";
import { stateHolder } from "./compile-context.mjs";
import { compileAabbIf, compileCircleIf, compileCircleCapsuleIf, compileTriggerIf } from "./compile-collisions.mjs";

function score(value, ctx) { return ctx.score(value); }
function operation(targetHolder, targetObjective, operator, value, ctx) {
  const source = score(value, ctx);
  return `scoreboard players operation ${targetHolder} ${targetObjective} ${operator} ${source.holder} ${source.objective}`;
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
    switch (action.op) {
      case "set": {
        const target = stateHolder(action.target);
        if (action.value.kind === "constant") lines.push(`scoreboard players set ${target} ${ctx.objective} ${action.value.raw}`);
        else lines.push(operation(target, ctx.objective, "=", action.value, ctx));
        break;
      }
      case "add": lines.push(operation(stateHolder(action.target), ctx.objective, "+=", action.value, ctx)); break;
      case "sub": lines.push(operation(stateHolder(action.target), ctx.objective, "-=", action.value, ctx)); break;
      case "negate":
        ctx.usesNegate = true;
        lines.push(`scoreboard players operation ${stateHolder(action.target)} ${ctx.objective} *= #neg1 ${ctx.objective}`);
        break;
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
      case "for_each_player": {
        const fn = ctx.nextPlayerFunctionName(), body = [];
        compileActions(action.actions, body, ctx);
        ctx.functions.set(fn, body);
        lines.push(`execute as @a run function ${ctx.namespace}:portable/${fn}`);
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
