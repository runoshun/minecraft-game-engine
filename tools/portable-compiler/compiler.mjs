import fs from "node:fs";
import path from "node:path";
import { compileActions } from "./compile-actions.mjs";
import { CompileContext, inputHolder, ownerTag, playerInitObjective } from "./compile-context.mjs";
import {
  cleanupLines, compileVanillaActorLoad, compileVanillaActorUpdates, compileVanillaCameraLoad,
  compileVanillaCameraLock, compileVanillaCameraUpdates, compileVanillaHuds, compileVanillaInputs,
  compileVanillaParticleLoad, compileVanillaParticles, compileVanillaProjectionLoad,
  compileVanillaProjections, compileVanillaSidebarLoad, compileVanillaSidebars,
  compileVanillaSoundLoad, compileVanillaSounds, compileVanillaTextLoad,
  compileVanillaTextUpdates, compileVanillaWorldBatchLoadCalls, inputField,
  ownershipForceloadCommand, prepareVanillaWorldBatches, validateOwnershipCoverage,
} from "./compile-vanilla.mjs";
import { NAMESPACE } from "./utils.mjs";
import { compilePlayerHuds, compilePlayerLoad, compilePlayerTickPrelude, playerInputField } from "./compile-player.mjs";

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function prettyJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function functionTag(value) { return prettyJson({ values: [value] }); }

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
  compileActions(program.tickActions, tick, ctx);
  compileVanillaProjections(program, tick, ctx);
  compileVanillaTextUpdates(program, tick, ctx);
  compileVanillaActorUpdates(program, tick, ctx);
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
  for (const [name, raw] of Object.entries(program.initialState)) load.push(`scoreboard players set #${name} ${ctx.objective} ${raw}`);
  for (const [name, raw] of Object.entries(program.initialInputs)) load.push(`scoreboard players set ${inputHolder(name)} ${ctx.objective} ${raw}`);
  compilePlayerLoad(program, load, ctx);
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
    compileVanillaCameraLoad(program, load, ctx);
    compileVanillaParticleLoad(program, load, ctx);
    compileVanillaSoundLoad(program, load, ctx);
  }
  compileVanillaSidebarLoad(program, load, ctx);

  const pack = { pack: { description: `Generated Minecraft Game Engine portable program: ${namespace}`, min_format: [101, 1], max_format: [101, 1] } };
  write(path.join(outputRoot, "pack.mcmeta"), prettyJson(pack));
  write(path.join(outputRoot, "data", "minecraft", "tags", "function", "load.json"), functionTag(`${namespace}:portable/load`));
  write(path.join(outputRoot, "data", "minecraft", "tags", "function", "tick.json"), functionTag(`${namespace}:portable/tick`));
  writeInputPredicates(program, outputRoot, namespace);

  const functionRoot = path.join(outputRoot, "data", namespace, "function", "portable");
  write(path.join(functionRoot, "load.mcfunction"), `${load.join("\n")}\n`);
  write(path.join(functionRoot, "tick.mcfunction"), `${tick.join("\n")}\n`);
  write(path.join(functionRoot, "cleanup.mcfunction"), `${cleanupLines(program, ctx).join("\n")}\n`);
  for (const [name, body] of ctx.functions.entries()) write(path.join(functionRoot, `${name}.mcfunction`), `${body.join("\n")}\n`);

  let marker = `namespace=${namespace}\nobjective=${ctx.objective}\nportable_version=${program.version}\nfixed_point=${program.fixedPoint}\n`;
  for (const name of Object.keys(program.initialInputs)) marker += `input.${name}=${inputHolder(name)}\n`;
  if (program.version >= 12) {
    marker += `player.init=${playerInitObjective(namespace)}\n`;
    for (const name of Object.keys(program.initialPlayerState).sort()) marker += `player.state.${name}=${ctx.playerStateObjective(name)}\n`;
    for (const name of [...program.playerInputs].sort()) marker += `player.input.${name}=${ctx.playerInputObjective(name)}\n`;
  }
  write(path.join(outputRoot, ".mcgame-portable-generated"), marker);

  return {
    namespace, objective: ctx.objective,
    stateCount: Object.keys(program.initialState).length,
    inputCount: Object.keys(program.initialInputs).length,
    playerStateCount: Object.keys(program.initialPlayerState || {}).length,
    playerInputCount: program.playerInputs?.size ?? 0,
    projectionCount: program.projections.length,
    textCount: program.texts.length,
    actorCount: program.actors.length,
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
