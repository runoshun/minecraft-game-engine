import fs from "node:fs";
import path from "node:path";
import { compileActions } from "./compile-actions.mjs";
import { CompileContext, inputHolder, ownerTag, playerInitObjective } from "./compile-context.mjs";
import {
  cleanupLines, compileVanillaActorLoad, compileVanillaActorUpdates, compileVanillaCameraLoad,
  compileVanillaInteractionLoad, compileVanillaInteractionUpdates,
  compileVanillaCameraLock, compileVanillaCameraUpdates, compileVanillaHuds, compileVanillaInputs,
  compileVanillaParticleLoad, compileVanillaParticles, compileVanillaProjectionLoad,
  compileVanillaProjections, compileVanillaSidebarLoad, compileVanillaSidebars,
  compileVanillaSoundLoad, compileVanillaSounds, compileVanillaTextLoad,
  compileVanillaTextUpdates, compileVanillaWorldBatchLoadCalls, inputField,
  ownershipForceloadCommand, prepareVanillaWorldBatches, validateOwnershipCoverage,
} from "./compile-vanilla.mjs";
import { NAMESPACE } from "./utils.mjs";
import { compilePlayerHuds, compilePlayerLoad, compilePlayerTickPrelude, playerInputField } from "./compile-player.mjs";
import { compileGridLoad, compileGridWorldServices, gridCleanupLines } from "./compile-grid.mjs";
import { compilePersistentLoad, hasPersistentData, persistentPurgeLines, persistentResetLines } from "./compile-persistent.mjs";
import { compileSelectionLoad, selectionCleanupLines, selectionDialogJson } from "./compile-selection.mjs";
import { compileFormLoad, compileFormTickPrelude, formCleanupLines, formDialogJson } from "./compile-form.mjs";

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function prettyJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function functionTag(value) { return prettyJson({ values: [value] }); }

function writeSelectionDialogs(program, outputRoot, namespace, ctx) {
  if (program.version < 20) return;
  for (const selection of program.selections) {
    write(path.join(outputRoot, "data", namespace, "dialog", "portable", "selection", `${selection.id}.json`), prettyJson(selectionDialogJson(selection, ctx)));
  }
}

function writeFormDialogs(program, outputRoot, namespace, ctx) {
  if (program.version < 21) return;
  for (const form of program.forms) {
    write(path.join(outputRoot, "data", namespace, "dialog", "portable", "form", `${form.id}.json`), prettyJson(formDialogJson(form, ctx)));
  }
}

function writeInputPredicates(program, outputRoot, namespace) {
  const fields = [];
  for (const source of Object.values(program.vanillaInputs)) {
    const field = inputField(source);
    if (field && !fields.includes(field)) fields.push(field);
  }
  for (const name of program.playerInputs ?? []) {
    const field = playerInputField(name);
    if (field && !fields.includes(field)) fields.push(field);
  }
  for (const field of fields) {
    const json = {
      condition: "minecraft:entity_properties",
      entity: "this",
      predicate: { type_specific: { type: "minecraft:player", input: { [field]: true } } },
    };
    write(path.join(outputRoot, "data", namespace, "predicate", "portable", "input", `${field}.json`), prettyJson(json));
  }
}

export function compileDatapack(program, namespace, outputRoot) {
  if (!NAMESPACE.test(namespace)) throw new Error(`portable namespace must match ${NAMESPACE.source}`);
  validateOwnershipCoverage(program);
  const ctx = new CompileContext(namespace, program), tick = [];

  compileVanillaInputs(program, tick, ctx);
  compilePlayerTickPrelude(program, tick, ctx);
  compileFormTickPrelude(program, tick, ctx);
  compileActions(program.tickActions, tick, ctx);
  compileGridWorldServices(program, tick, ctx);
  compileVanillaProjections(program, tick, ctx);
  compileVanillaTextUpdates(program, tick, ctx);
  compileVanillaActorUpdates(program, tick, ctx);
  compileVanillaInteractionUpdates(program, tick, ctx);
  prepareVanillaWorldBatches(program, tick, ctx);
  compileVanillaCameraUpdates(program, tick, ctx);
  compileVanillaCameraLock(program, tick, ctx);
  compileVanillaParticles(program, tick, ctx);
  compileVanillaSounds(program, tick, ctx);
  compileVanillaHuds(program, tick, ctx);
  compilePlayerHuds(program, tick, ctx);
  compileVanillaSidebars(program, tick, ctx);
  if (!tick.length) tick.push("# no portable tick actions");
  if (program.ownership) tick.unshift(`execute unless score #ready ${ctx.objective} matches 1 run return 0`);

  const load = [`scoreboard objectives add ${ctx.objective} dummy`];
  compilePersistentLoad(program, load, ctx);
  for (const [name, raw] of Object.entries(program.initialState)) load.push(`scoreboard players set #${name} ${ctx.objective} ${raw}`);
  if (program.version >= 15) {
    for (const session of [...program.sessions].sort((a, b) => a.id.localeCompare(b.id))) {
      for (const [name, raw] of Object.entries(session.initialState).sort(([a], [b]) => a.localeCompare(b))) {
        load.push(`scoreboard players set ${ctx.sessionStateHolder(session.id, name)} ${ctx.objective} ${raw}`);
      }
    }
  }
  for (const [name, raw] of Object.entries(program.initialInputs)) load.push(`scoreboard players set ${inputHolder(name)} ${ctx.objective} ${raw}`);
  compileSelectionLoad(program, load, ctx);
  compileFormLoad(program, load, ctx);
  compilePlayerLoad(program, load, ctx);
  compileGridLoad(program, load, ctx);
  if (ctx.usesNegate) load.push(`scoreboard players set #neg1 ${ctx.objective} -1`);
  for (const [raw, holder] of ctx.constants.entries()) load.push(`scoreboard players set ${holder} ${ctx.objective} ${raw}`);
  compileVanillaWorldBatchLoadCalls(program, load, ctx);

  if (program.ownership) {
    load.push(`scoreboard players set #ready ${ctx.objective} 0`);
    load.push(ownershipForceloadCommand(program.ownership, true));
    const ownedInit = [`execute in ${program.ownership.dimension} run kill @e[tag=${ownerTag(namespace)}]`];
    compileVanillaProjectionLoad(program, ownedInit, ctx);
    compileVanillaTextLoad(program, ownedInit, ctx);
    compileVanillaActorLoad(program, ownedInit, ctx);
    compileVanillaInteractionLoad(program, ownedInit, ctx);
    compileVanillaCameraLoad(program, ownedInit, ctx);
    compileVanillaParticleLoad(program, ownedInit, ctx);
    compileVanillaSoundLoad(program, ownedInit, ctx);
    ownedInit.push(`scoreboard players set #ready ${ctx.objective} 1`);
    ctx.functions.set("owned_init", ownedInit);
    load.push(`schedule function ${namespace}:portable/owned_init 2t replace`);
  } else {
    compileVanillaProjectionLoad(program, load, ctx);
    compileVanillaTextLoad(program, load, ctx);
    compileVanillaActorLoad(program, load, ctx);
    compileVanillaInteractionLoad(program, load, ctx);
    compileVanillaCameraLoad(program, load, ctx);
    compileVanillaParticleLoad(program, load, ctx);
    compileVanillaSoundLoad(program, load, ctx);
  }
  compileVanillaSidebarLoad(program, load, ctx);
  if (hasPersistentData(program)) {
    ctx.functions.set("reset_persistent", persistentResetLines(program, ctx));
    ctx.functions.set("purge_persistent", persistentPurgeLines(program, ctx));
  }

  const pack = { pack: { description: `Generated Minecraft Game Engine portable program: ${namespace}`, min_format: [101, 1], max_format: [101, 1] } };
  write(path.join(outputRoot, "pack.mcmeta"), prettyJson(pack));
  write(path.join(outputRoot, "data", "minecraft", "tags", "function", "load.json"), functionTag(`${namespace}:portable/load`));
  write(path.join(outputRoot, "data", "minecraft", "tags", "function", "tick.json"), functionTag(`${namespace}:portable/tick`));
  writeInputPredicates(program, outputRoot, namespace);
  writeSelectionDialogs(program, outputRoot, namespace, ctx);
  writeFormDialogs(program, outputRoot, namespace, ctx);

  const functionRoot = path.join(outputRoot, "data", namespace, "function", "portable");
  write(path.join(functionRoot, "load.mcfunction"), `${load.join("\n")}\n`);
  write(path.join(functionRoot, "tick.mcfunction"), `${tick.join("\n")}\n`);
  write(path.join(functionRoot, "cleanup.mcfunction"), `${[...gridCleanupLines(program, ctx), ...selectionCleanupLines(program, ctx), ...formCleanupLines(program, ctx), ...cleanupLines(program, ctx)].join("\n")}\n`);
  for (const [name, body] of ctx.functions.entries()) write(path.join(functionRoot, `${name}.mcfunction`), `${body.join("\n")}\n`);

  let marker = `namespace=${namespace}\nobjective=${ctx.objective}\nportable_version=${program.version}\nfixed_point=${program.fixedPoint}\n`;
  if (program.version >= 18 && (Object.keys(program.persistentState || {}).length || (program.sessions || []).some(session => Object.keys(session.persistentState || {}).length))) {
    marker += `persistent.objective=${ctx.persistentObjective}\n`;
    for (const [name, spec] of Object.entries(program.persistentState || {}).sort(([a], [b]) => a.localeCompare(b))) marker += `persistent.state.${name}=${ctx.persistentStateHolder(name)};schema=${spec.schema};on_mismatch=${spec.onSchemaMismatch}\n`;
  }
  if (program.version >= 19) {
    for (const grid of [...(program.persistentGrids || [])].sort((a, b) => a.id.localeCompare(b.id))) marker += `persistent.grid.${grid.id}=grids.${ctx.persistentGridKey(grid.id)};size=${grid.width}x${grid.height};schema=${grid.schema};on_mismatch=${grid.onSchemaMismatch}\n`;
  }
  if (program.version >= 20) {
    for (const selection of [...program.selections].sort((a, b) => a.id.localeCompare(b.id))) marker += `selection.${selection.id}=${ctx.selectionObjective(selection.id)}\n`;
  }
  if (program.version >= 21) {
    for (const form of [...program.forms].sort((a, b) => a.id.localeCompare(b.id))) marker += `form.${form.id}.transport=${ctx.formTransportObjective(form.id)};result=${ctx.formResultObjective(form.id)}\n`;
  }
  for (const name of Object.keys(program.initialInputs)) marker += `input.${name}=${inputHolder(name)}\n`;
  if (program.version >= 12) {
    marker += `player.init=${playerInitObjective(namespace)}\n`;
    for (const name of Object.keys(program.initialPlayerState).sort()) marker += `player.state.${name}=${ctx.playerStateObjective(name)}\n`;
    for (const name of [...program.playerInputs].sort()) marker += `player.input.${name}=${ctx.playerInputObjective(name)}\n`;
  }
  if (program.version >= 13) {
    for (const value of [...program.grids].sort((a, b) => a.id.localeCompare(b.id))) marker += `grid.${value.id}=${ctx.gridObjective(value.id)}\n`;
    for (const value of [...program.rngs].sort((a, b) => a.id.localeCompare(b.id))) marker += `rng.${value.id}=${ctx.rngHolder(value.id)}\n`;
    for (const value of [...program.gridWorlds].sort((a, b) => a.id.localeCompare(b.id))) marker += `gridWorld.${value.id}.ready=${ctx.gridWorldReadyHolder(value.id)}\n`;
  }
  if (program.version >= 15) {
    for (const session of [...program.sessions].sort((a, b) => a.id.localeCompare(b.id))) {
      marker += `session.${session.id}.team=${session.players.team}\n`;
      for (const name of Object.keys(session.initialState).sort()) marker += `session.${session.id}.state.${name}=${ctx.sessionStateHolder(session.id, name)}\n`;
      for (const [name, spec] of Object.entries(session.persistentState || {}).sort(([a], [b]) => a.localeCompare(b))) marker += `session.${session.id}.persistent.${name}=${ctx.persistentStateHolder(name, session.id)};schema=${spec.schema};on_mismatch=${spec.onSchemaMismatch}\n`;
      for (const grid of [...(session.persistentGrids || [])].sort((a, b) => a.id.localeCompare(b.id))) marker += `session.${session.id}.persistentGrid.${grid.id}=grids.${ctx.persistentGridKey(grid.id, session.id)};size=${grid.width}x${grid.height};schema=${grid.schema};on_mismatch=${grid.onSchemaMismatch}\n`;
      for (const value of [...session.grids].sort((a, b) => a.id.localeCompare(b.id))) marker += `session.${session.id}.grid.${value.id}=${ctx.sessionGridObjective(session.id, value.id)}\n`;
      for (const value of [...session.rngs].sort((a, b) => a.id.localeCompare(b.id))) marker += `session.${session.id}.rng.${value.id}=${ctx.sessionRngHolder(session.id, value.id)}\n`;
      for (const value of [...(session.gridWorlds || [])].sort((a, b) => a.id.localeCompare(b.id))) marker += `session.${session.id}.gridWorld.${value.id}.ready=${ctx.gridWorldReadyHolder(value.id, session.id)}\n`;
    }
  }
  write(path.join(outputRoot, ".mcgame-portable-generated"), marker);

  return {
    namespace, objective: ctx.objective,
    stateCount: Object.keys(program.initialState).length,
    persistentStateCount: Object.keys(program.persistentState || {}).length + (program.sessions || []).reduce((sum, session) => sum + Object.keys(session.persistentState || {}).length, 0),
    persistentGridCount: (program.persistentGrids || []).length + (program.sessions || []).reduce((sum, session) => sum + (session.persistentGrids || []).length, 0),
    persistentGridCellCount: (program.persistentGrids || []).reduce((sum, grid) => sum + grid.width * grid.height, 0) + (program.sessions || []).reduce((sum, session) => sum + (session.persistentGrids || []).reduce((inner, grid) => inner + grid.width * grid.height, 0), 0),
    selectionCount: program.selections?.length ?? 0,
    formCount: program.forms?.length ?? 0,
    inputCount: Object.keys(program.initialInputs).length,
    playerStateCount: Object.keys(program.initialPlayerState || {}).length,
    playerInputCount: program.playerInputs?.size ?? 0,
    playerSetCount: program.playerTeams?.size ?? 0,
    sessionCount: program.sessions?.length ?? 0,
    sessionStateCount: (program.sessions || []).reduce((sum, session) => sum + Object.keys(session.initialState).length, 0),
    sessionGridCount: (program.sessions || []).reduce((sum, session) => sum + session.grids.length, 0),
    sessionRngCount: (program.sessions || []).reduce((sum, session) => sum + session.rngs.length, 0),
    sessionGridWorldCount: (program.sessions || []).reduce((sum, session) => sum + (session.gridWorlds?.length ?? 0), 0),
    gridCount: program.grids?.length ?? 0,
    rngCount: program.rngs?.length ?? 0,
    gridWorldCount: program.gridWorlds?.length ?? 0,
    projectionCount: program.projections.length,
    textCount: program.texts.length,
    actorCount: program.actors.length,
    interactionCount: program.interactions.length,
    worldBatchCount: program.worldBatches.length,
    cameraCount: program.cameras.length,
    particleCount: program.particles.length,
    soundCount: program.sounds.length,
    hudCount: program.huds.length,
    playerHudCount: program.playerHuds?.length ?? 0,
    sidebarCount: program.sidebars.length,
    branchFunctionCount: ctx.nextBranch,
  };
}
