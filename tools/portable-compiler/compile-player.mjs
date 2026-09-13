import { PLAYER_INPUT_NAMES } from "./utils.mjs";
import { fullPlayerObjectiveBank, playerInitObjective } from "./compile-context.mjs";

export function playerInputField(name) {
  if (name === "hotbarSlot") return null;
  return name;
}

export function participantSelector() {
  return "@a";
}

function playerHudValueCount(program) {
  let count = 0;
  for (const hud of program.playerHuds) {
    for (const token of hud.tokens) if (token.kind === "value") count++;
  }
  return count;
}

export function compilePlayerLoad(program, lines, ctx) {
  if (program.version < 12) return;

  for (const objective of fullPlayerObjectiveBank(ctx.namespace)) {
    lines.push(`scoreboard objectives remove ${objective}`);
  }

  const initObjective = playerInitObjective(ctx.namespace);
  lines.push(`scoreboard objectives add ${initObjective} dummy`);

  for (const name of Object.keys(program.initialPlayerState).sort()) {
    lines.push(`scoreboard objectives add ${ctx.playerStateObjective(name)} dummy`);
  }
  for (const name of PLAYER_INPUT_NAMES) {
    if (program.playerInputs.has(name)) lines.push(`scoreboard objectives add ${ctx.playerInputObjective(name)} dummy`);
  }
  for (let i = 0; i < playerHudValueCount(program); i++) {
    lines.push(`scoreboard objectives add ${ctx.playerHudTempObjective(i)} dummy`);
  }

  const init = [];
  for (const name of Object.keys(program.initialPlayerState).sort()) {
    init.push(`scoreboard players set @s ${ctx.playerStateObjective(name)} ${program.initialPlayerState[name]}`);
  }
  init.push(`scoreboard players set @s ${initObjective} 1`);
  ctx.functions.set("player_init", init);
}

export function compilePlayerTickPrelude(program, lines, ctx) {
  if (program.version < 12) return;

  const initObjective = playerInitObjective(ctx.namespace);
  lines.push(`execute as ${participantSelector()} unless score @s ${initObjective} matches 1 run function ${ctx.namespace}:portable/player_init`);

  for (const name of PLAYER_INPUT_NAMES) {
    if (!program.playerInputs.has(name)) continue;
    const objective = ctx.playerInputObjective(name);
    if (name === "hotbarSlot") {
      lines.push(`execute as ${participantSelector()} store result score @s ${objective} run data get entity @s SelectedItemSlot ${program.fixedPoint}`);
      continue;
    }
    lines.push(`scoreboard players set ${participantSelector()} ${objective} 0`);
    lines.push(`execute as ${participantSelector()} if predicate ${ctx.namespace}:portable/input/${playerInputField(name)} run scoreboard players set @s ${objective} ${program.fixedPoint}`);
  }
}

export function compilePlayerHuds(program, lines, ctx) {
  if (!program.playerHuds.length) return;

  let tempIndex = 0;
  for (const hud of program.playerHuds) {
    const component = [];
    for (const token of hud.tokens) {
      if (token.kind === "literal") {
        component.push({ text: token.text });
        continue;
      }

      const tempObjective = ctx.playerHudTempObjective(tempIndex++);
      const source = ctx.score(token.value);
      lines.push(`execute as ${participantSelector()} run scoreboard players operation @s ${tempObjective} = ${source.holder} ${source.objective}`);
      if (program.fixedPoint !== 1) {
        lines.push(`execute as ${participantSelector()} run scoreboard players operation @s ${tempObjective} /= ${ctx.constantHolder(program.fixedPoint)} ${ctx.objective}`);
      }
      component.push({ score: { name: "@s", objective: tempObjective } });
    }
    lines.push(`execute as ${participantSelector()} run title @s actionbar ${JSON.stringify(component)}`);
  }
}

export function playerCleanupLines(program, ctx) {
  if (program.version < 12) return [];
  const lines = [];
  if (program.playerHuds.length) lines.push(`title ${participantSelector()} actionbar {"text":""}`);
  for (const objective of fullPlayerObjectiveBank(ctx.namespace)) {
    lines.push(`scoreboard objectives remove ${objective}`);
  }
  return lines;
}
