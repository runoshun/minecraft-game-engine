import { fullInteractionControllerObjectiveBank } from "./compile-context.mjs";

function collect(actions, out) {
  for (const action of actions) {
    if (action.op === "interaction_controller_claim" || action.op === "interaction_controller_player") out.add(action.interaction);
    if (Array.isArray(action.actions)) collect(action.actions, out);
    if (Array.isArray(action.then)) collect(action.then, out);
    if (Array.isArray(action.else)) collect(action.else, out);
  }
}

export function interactionControllerIds(program) {
  const ids = new Set();
  collect(program.tickActions, ids);
  return [...ids].sort();
}

export function compileControllerAdvance(interaction, lines, ctx, assignCurrentPlayer = false) {
  const generation = ctx.interactionControllerGenerationHolder(interaction);
  const objective = ctx.interactionControllerObjective(interaction);
  lines.push(`execute if score ${generation} ${ctx.objective} matches 2147483647 run scoreboard objectives remove ${objective}`);
  lines.push(`execute if score ${generation} ${ctx.objective} matches 2147483647 run scoreboard objectives add ${objective} dummy`);
  lines.push(`execute if score ${generation} ${ctx.objective} matches 2147483647 run scoreboard players set ${generation} ${ctx.objective} 0`);
  lines.push(`scoreboard players add ${generation} ${ctx.objective} 1`);
  if (assignCurrentPlayer) lines.push(`scoreboard players operation @s ${objective} = ${generation} ${ctx.objective}`);
}

export function compileInteractionControllerLoad(program, lines, ctx) {
  if (program.version < 24) return;
  const ids = interactionControllerIds(program);
  for (const objective of fullInteractionControllerObjectiveBank(ctx.namespace)) lines.push(`scoreboard objectives remove ${objective}`);
  for (const id of ids) {
    lines.push(`scoreboard objectives add ${ctx.interactionControllerObjective(id)} dummy`);
    lines.push(`scoreboard players set ${ctx.interactionControllerGenerationHolder(id)} ${ctx.objective} 0`);
  }
}

export function interactionControllerCleanupLines(program, ctx) {
  if (program.version < 24) return [];
  return fullInteractionControllerObjectiveBank(ctx.namespace).map(objective => `scoreboard objectives remove ${objective}`);
}
