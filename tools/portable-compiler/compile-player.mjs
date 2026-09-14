import { PLAYER_INPUT_NAMES } from "./utils.mjs";
import { fullPlayerObjectiveBank, playerInitObjective } from "./compile-context.mjs";
import { playerSetKey } from "./player-set.mjs";

export function playerInputField(name) {
  if (name === "hotbarSlot") return null;
  return name;
}

export function playerSetSelector(set, extra = []) {
  const filters = [];
  if (set !== "all_online") filters.push(`team=${set.team}`);
  filters.push(...extra);
  return filters.length ? `@a[${filters.join(",")}]` : "@a";
}

export function participantSelector() {
  return "@a";
}

function collectActionPlayerSets(actions, out) {
  for (const action of actions) {
    if (action.op === "for_each_player" || action.op === "for_single_player" || action.op === "player_reduce") out.set(playerSetKey(action.players), action.players);
    if (Array.isArray(action.actions)) collectActionPlayerSets(action.actions, out);
    if (Array.isArray(action.then)) collectActionPlayerSets(action.then, out);
    if (Array.isArray(action.else)) collectActionPlayerSets(action.else, out);
  }
}

export function participantPlayerSets(program) {
  if (program.version < 14) return ["all_online"];
  const found = new Map();
  collectActionPlayerSets(program.tickActions, found);
  for (const camera of program.cameras) if (camera.audience) found.set(playerSetKey(camera.audience), camera.audience);
  for (const hud of program.playerHuds) found.set(playerSetKey(hud.audience), hud.audience);
  if (found.has("all_online")) return ["all_online"];
  return [...found.values()].sort((a, b) => playerSetKey(a).localeCompare(playerSetKey(b)));
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
  const sets = participantPlayerSets(program);
  for (const set of sets) {
    const selector = playerSetSelector(set);
    lines.push(`execute as ${selector} unless score @s ${initObjective} matches 1 run function ${ctx.namespace}:portable/player_init`);
  }

  for (const name of PLAYER_INPUT_NAMES) {
    if (!program.playerInputs.has(name)) continue;
    const objective = ctx.playerInputObjective(name);
    for (const set of sets) {
      const selector = playerSetSelector(set);
      if (name === "hotbarSlot") {
        lines.push(`execute as ${selector} store result score @s ${objective} run data get entity @s SelectedItemSlot ${program.fixedPoint}`);
        continue;
      }
      lines.push(`scoreboard players set ${selector} ${objective} 0`);
      lines.push(`execute as ${selector} if predicate ${ctx.namespace}:portable/input/${playerInputField(name)} run scoreboard players set @s ${objective} ${program.fixedPoint}`);
    }
  }
}

export function compilePlayerHuds(program, lines, ctx) {
  if (!program.playerHuds.length) return;

  let tempIndex = 0;
  for (const hud of program.playerHuds) {
    const selector = program.version >= 14 ? playerSetSelector(hud.audience) : participantSelector();
    const component = [];
    for (const token of hud.tokens) {
      if (token.kind === "literal") {
        component.push({ text: token.text });
        continue;
      }

      const tempObjective = ctx.playerHudTempObjective(tempIndex++);
      const source = ctx.score(token.value);
      lines.push(`execute as ${selector} run scoreboard players operation @s ${tempObjective} = ${source.holder} ${source.objective}`);
      if (program.fixedPoint !== 1) {
        lines.push(`execute as ${selector} run scoreboard players operation @s ${tempObjective} /= ${ctx.constantHolder(program.fixedPoint)} ${ctx.objective}`);
      }
      component.push({ score: { name: "@s", objective: tempObjective } });
    }
    lines.push(`execute as ${selector} run title @s actionbar ${JSON.stringify(component)}`);
  }
}

export function playerCleanupLines(program, ctx) {
  if (program.version < 12) return [];
  const lines = [];
  if (program.playerHuds.length) {
    let sets = ["all_online"];
    if (program.version >= 14) {
      const found = new Map();
      for (const hud of program.playerHuds) found.set(playerSetKey(hud.audience), hud.audience);
      sets = found.has("all_online")
        ? ["all_online"]
        : [...found.values()].sort((a, b) => playerSetKey(a).localeCompare(playerSetKey(b)));
    }
    for (const set of sets) lines.push(`title ${playerSetSelector(set)} actionbar {"text":""}`);
  }
  for (const objective of fullPlayerObjectiveBank(ctx.namespace)) {
    lines.push(`scoreboard objectives remove ${objective}`);
  }
  return lines;
}
