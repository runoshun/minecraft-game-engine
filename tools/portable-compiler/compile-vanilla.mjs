import { condition } from "./compile-actions.mjs";
import {
  actorTag, cameraTag, inputHolder, interactionTag, ownerTag, particleTag, projectionTag,
  sidebarObjectiveName, sidebarRowHolder, soundTag, stateHolder, textTag,
} from "./compile-context.mjs";
import { floatLiteral, floorDiv, format3, format6, numberLiteral, scale, snbtQuoted, storeScale } from "./utils.mjs";
import { playerCleanupLines, playerSetSelector } from "./compile-player.mjs";

const MAX_SIDEBAR_SCORE = 15;

export function inputField(source) {
  return ({
    first_player_hotbar_slot: null,
    first_player_forward: "forward",
    first_player_backward: "backward",
    first_player_left: "left",
    first_player_right: "right",
    first_player_jump: "jump",
    first_player_sneak: "sneak",
    first_player_sprint: "sprint",
  })[source];
}

export function controllerSelector(program) {
  if (program.version >= 12) {
    if (program.cameras.length && program.cameras[0].mode === "spectate") return "@a[gamemode=spectator]";
    return "@a[gamemode=!spectator]";
  }
  if (program.cameras.length && program.cameras[0].mode === "spectate") return "@a[gamemode=spectator,limit=1,sort=arbitrary]";
  return "@a[gamemode=!spectator,limit=1,sort=arbitrary]";
}

export function compileVanillaInputs(program, lines, ctx) {
  const selector = controllerSelector(program);
  for (const [name, source] of Object.entries(program.vanillaInputs)) {
    const holder = inputHolder(name);
    if (source === "first_player_hotbar_slot") {
      lines.push(`scoreboard players set ${holder} ${ctx.objective} ${program.initialInputs[name]}`);
      lines.push(`execute as ${selector} store result score ${holder} ${ctx.objective} run data get entity @s SelectedItemSlot ${program.fixedPoint}`);
    } else {
      const field = inputField(source);
      lines.push(`scoreboard players set ${holder} ${ctx.objective} 0`);
      lines.push(`execute as ${selector} if predicate ${ctx.namespace}:portable/input/${field} run scoreboard players set ${holder} ${ctx.objective} ${program.fixedPoint}`);
    }
  }
}

function dynamicCoordinate(c) { return c.state !== null; }
export function dynamic(x, y, z) { return dynamicCoordinate(x) || dynamicCoordinate(y) || dynamicCoordinate(z); }

export function logicalCoordinate(program, coordinate) {
  let raw = coordinate.baseRaw;
  if (dynamicCoordinate(coordinate)) raw += program.initialState[coordinate.state];
  return raw / program.fixedPoint;
}

function entityTagsSnbt(ctx, tag) {
  if (!ctx.program.ownership) return `Tags:["${tag}"]`;
  return `Tags:["${tag}","${ownerTag(ctx.namespace)}"]`;
}

export function ownershipForceloadCommand(ownership, add) {
  return `execute in ${ownership.dimension} run forceload ${add ? "add" : "remove"} ${ownership.minX} ${ownership.minZ} ${ownership.maxX} ${ownership.maxZ}`;
}

function prepareTextValues(program, text, lines, ctx) {
  for (let i = 0; i < text.tokens.length; i++) {
    const token = text.tokens[i];
    if (token.kind !== "value") continue;
    const temp = ctx.textValueHolder(text.id, i), source = ctx.score(token.value);
    lines.push(`scoreboard players operation ${temp} ${ctx.objective} = ${source.holder} ${source.objective}`);
    if (program.fixedPoint !== 1) lines.push(`scoreboard players operation ${temp} ${ctx.objective} /= ${ctx.constantHolder(program.fixedPoint)} ${ctx.objective}`);
  }
}

function textComponentSnbt(text, ctx) {
  if (text.tokens.length === 1 && text.tokens[0].kind === "literal") return `{text:${snbtQuoted(text.tokens[0].text)}}`;
  const extra = text.tokens.map((token, i) => token.kind === "literal"
    ? `{text:${snbtQuoted(token.text)}}`
    : `{score:{name:${snbtQuoted(ctx.textValueHolder(text.id, i))},objective:${snbtQuoted(ctx.objective)}}}`);
  return `{text:"",extra:[${extra.join(",")}]}`;
}

function compileVisibility(dimension, tag, entityScale, visibility, lines, ctx) {
  if (!visibility) return;
  const selector = `@e[tag=${tag},limit=1]`;
  const shown = `[${floatLiteral(entityScale.x)},${floatLiteral(entityScale.y)},${floatLiteral(entityScale.z)}]`;
  lines.push(`execute ${condition(visibility, true, ctx)} in ${dimension} run data modify entity ${selector} transformation.scale set value ${shown}`);
  lines.push(`execute ${condition(visibility, false, ctx)} in ${dimension} run data modify entity ${selector} transformation.scale set value [0f,0f,0f]`);
}

export function compileVanillaProjectionLoad(program, lines, ctx) {
  for (const projection of program.projections) {
    const tag = projectionTag(ctx.namespace, projection.id), x = logicalCoordinate(program, projection.x), y = logicalCoordinate(program, projection.y), z = logicalCoordinate(program, projection.z);
    const bx = Math.floor(x), bz = Math.floor(z);
    if (!program.ownership) lines.push(`execute in ${projection.dimension} run forceload add ${bx} ${bz}`);
    lines.push(`execute in ${projection.dimension} run kill @e[tag=${tag}]`);
    const s = projection.scale, t = projection.translation;
    const snbt = `{${entityTagsSnbt(ctx, tag)},block_state:{Name:"${projection.block}"},transformation:{translation:[${floatLiteral(t.x)},${floatLiteral(t.y)},${floatLiteral(t.z)}],left_rotation:[0f,0f,0f,1f],scale:[${floatLiteral(s.x)},${floatLiteral(s.y)},${floatLiteral(s.z)}],right_rotation:[0f,0f,0f,1f]}}`;
    lines.push(`execute in ${projection.dimension} run summon minecraft:block_display ${format6(x)} ${format6(y)} ${format6(z)} ${snbt}`);
    compileVisibility(projection.dimension, tag, projection.scale, projection.condition, lines, ctx);
    if (!program.ownership) lines.push(`execute in ${projection.dimension} run forceload remove ${bx} ${bz}`);
  }
}

export function compileVanillaTextLoad(program, lines, ctx) {
  for (const text of program.texts) {
    const tag = textTag(ctx.namespace, text.id), x = logicalCoordinate(program, text.x), y = logicalCoordinate(program, text.y), z = logicalCoordinate(program, text.z);
    const bx = Math.floor(x), bz = Math.floor(z), s = text.scale;
    prepareTextValues(program, text, lines, ctx);
    const snbt = `{${entityTagsSnbt(ctx, tag)},text:${textComponentSnbt(text, ctx)},billboard:"${text.billboard}",transformation:{translation:[0f,0f,0f],left_rotation:[0f,0f,0f,1f],scale:[${floatLiteral(s.x)},${floatLiteral(s.y)},${floatLiteral(s.z)}],right_rotation:[0f,0f,0f,1f]}}`;
    if (!program.ownership) lines.push(`execute in ${text.dimension} run forceload add ${bx} ${bz}`);
    lines.push(`execute in ${text.dimension} run kill @e[tag=${tag}]`);
    lines.push(`execute in ${text.dimension} run summon minecraft:text_display ${format6(x)} ${format6(y)} ${format6(z)} ${snbt}`);
    compileVisibility(text.dimension, tag, text.scale, text.condition, lines, ctx);
    if (!program.ownership) lines.push(`execute in ${text.dimension} run forceload remove ${bx} ${bz}`);
  }
}

function ensureActorSpawnFunction(program, actor, ctx) {
  const name = `actor_${actor.id}_spawn`;
  if (ctx.functions.has(name)) return;
  const tag = actorTag(ctx.namespace, actor.id), x = logicalCoordinate(program, actor.x), y = logicalCoordinate(program, actor.y), z = logicalCoordinate(program, actor.z), yaw = logicalCoordinate(program, actor.yaw);
  const bx = Math.floor(x), bz = Math.floor(z), body = [];
  if (!program.ownership) body.push(`execute in ${actor.dimension} run forceload add ${bx} ${bz}`);
  const pitch = actor.pitch ? logicalCoordinate(program, actor.pitch) : 0;
  const extended = actor.pitch !== null || actor.profile !== null || actor.hiddenLayers !== null || actor.pose !== null || actor.mainHand !== null || actor.equipment !== null;
  const fields = [entityTagsSnbt(ctx, tag), "NoGravity:1b", "Invulnerable:1b", "Silent:1b", `Rotation:[${format3(yaw)}f,${extended ? `${format3(pitch)}f` : "0f"}]`];
  if (extended) fields.push("immovable:1b");
  if (actor.profile !== null) {
    const profile = [];
    for (const key of ["texture", "cape", "elytra", "model"]) if (actor.profile[key] !== undefined) profile.push(`${key}:${snbtQuoted(actor.profile[key])}`);
    fields.push(`profile:{${profile.join(",")}}`);
  }
  if (actor.hiddenLayers !== null) fields.push(`hidden_layers:[${actor.hiddenLayers.map(value => snbtQuoted(value)).join(",")}]`);
  if (actor.pose !== null) fields.push(`pose:${snbtQuoted(actor.pose)}`);
  if (actor.mainHand !== null) fields.push(`main_hand:${snbtQuoted(actor.mainHand)}`);
  const fallbackHead = actor.entityType === "minecraft:zombie" ? "minecraft:zombie_head" : actor.entityType === "minecraft:skeleton" ? "minecraft:skeleton_skull" : null;
  if (extended) {
    const equipment = { ...(actor.equipment || {}) };
    if (fallbackHead && equipment.head === undefined) equipment.head = fallbackHead;
    const slots = Object.entries(equipment).map(([slot, item]) => `${slot}:{id:${snbtQuoted(item)}}`);
    if (slots.length) fields.push(`equipment:{${slots.join(",")}}`);
  }
  const snbt = `{${fields.join(",")}}`;
  body.push(`execute in ${actor.dimension} run summon minecraft:mannequin ${format6(x)} ${format6(y)} ${format6(z)} ${snbt}`);
  if (!extended && fallbackHead) body.push(`execute in ${actor.dimension} run item replace entity @e[tag=${tag},limit=1] armor.head with ${fallbackHead}`);
  if (!program.ownership) body.push(`execute in ${actor.dimension} run forceload remove ${bx} ${bz}`);
  ctx.functions.set(name, body);
}

export function compileVanillaActorLoad(program, lines, ctx) {
  for (const actor of program.actors) {
    const tag = actorTag(ctx.namespace, actor.id), x = logicalCoordinate(program, actor.x), z = logicalCoordinate(program, actor.z), bx = Math.floor(x), bz = Math.floor(z);
    ensureActorSpawnFunction(program, actor, ctx);
    if (!program.ownership) lines.push(`execute in ${actor.dimension} run forceload add ${bx} ${bz}`);
    lines.push(`execute in ${actor.dimension} run kill @e[tag=${tag}]`);
    const spawn = `${ctx.namespace}:portable/actor_${actor.id}_spawn`;
    lines.push(actor.condition ? `execute ${condition(actor.condition, true, ctx)} run function ${spawn}` : `function ${spawn}`);
    if (!program.ownership) lines.push(`execute in ${actor.dimension} run forceload remove ${bx} ${bz}`);
  }
}

function ensureInteractionSpawnFunction(program, interaction, ctx) {
  const name = `interaction_${interaction.id}_spawn`;
  if (ctx.functions.has(name)) return;
  const tag = interactionTag(ctx.namespace, interaction.id);
  const x = logicalCoordinate(program, interaction.x), y = logicalCoordinate(program, interaction.y), z = logicalCoordinate(program, interaction.z);
  const bx = Math.floor(x), bz = Math.floor(z), body = [];
  if (!program.ownership) body.push(`execute in ${interaction.dimension} run forceload add ${bx} ${bz}`);
  const snbt = `{${entityTagsSnbt(ctx, tag)},width:${floatLiteral(interaction.width)},height:${floatLiteral(interaction.height)},response:${interaction.response ? "1b" : "0b"}}`;
  body.push(`execute in ${interaction.dimension} run summon minecraft:interaction ${format6(x)} ${format6(y)} ${format6(z)} ${snbt}`);
  if (!program.ownership) body.push(`execute in ${interaction.dimension} run forceload remove ${bx} ${bz}`);
  ctx.functions.set(name, body);
}

export function compileVanillaInteractionLoad(program, lines, ctx) {
  for (const interaction of program.interactions) {
    const tag = interactionTag(ctx.namespace, interaction.id), x = logicalCoordinate(program, interaction.x), z = logicalCoordinate(program, interaction.z), bx = Math.floor(x), bz = Math.floor(z);
    ensureInteractionSpawnFunction(program, interaction, ctx);
    if (!program.ownership) lines.push(`execute in ${interaction.dimension} run forceload add ${bx} ${bz}`);
    lines.push(`execute in ${interaction.dimension} run kill @e[tag=${tag}]`);
    const spawn = `${ctx.namespace}:portable/interaction_${interaction.id}_spawn`;
    lines.push(interaction.condition ? `execute ${condition(interaction.condition, true, ctx)} run function ${spawn}` : `function ${spawn}`);
    if (!program.ownership) lines.push(`execute in ${interaction.dimension} run forceload remove ${bx} ${bz}`);
  }
}

function ensureWorldBatchFunction(batch, ctx) {
  const name = `world_${batch.id}`;
  if (ctx.functions.has(name)) return;
  const byChunk = new Map();
  for (const write of batch.blocks) {
    const key = `${floorDiv(write.x, 16)},${floorDiv(write.z, 16)}`;
    if (!byChunk.has(key)) byChunk.set(key, []);
    byChunk.get(key).push(write);
  }
  const body = [];
  for (const writes of byChunk.values()) {
    const first = writes[0], bx = floorDiv(first.x, 16) * 16, bz = floorDiv(first.z, 16) * 16;
    body.push(`execute in ${batch.dimension} run forceload add ${bx} ${bz}`);
    for (const write of writes) body.push(`execute in ${batch.dimension} run setblock ${write.x} ${write.y} ${write.z} ${write.block}`);
    body.push(`execute in ${batch.dimension} run forceload remove ${bx} ${bz}`);
  }
  ctx.functions.set(name, body);
}

export function prepareVanillaWorldBatches(program, tick, ctx) {
  for (const batch of program.worldBatches) {
    ensureWorldBatchFunction(batch, ctx);
    if (batch.condition) tick.push(`execute ${condition(batch.condition, true, ctx)} run function ${ctx.namespace}:portable/world_${batch.id}`);
  }
}

export function compileVanillaWorldBatchLoadCalls(program, load, ctx) {
  for (const batch of program.worldBatches) if (!batch.condition) load.push(`function ${ctx.namespace}:portable/world_${batch.id}`);
}

export function compileVanillaCameraLoad(program, lines, ctx) {
  for (const camera of program.cameras) {
    const tag = cameraTag(ctx.namespace, camera.id), x = logicalCoordinate(program, camera.x), y = logicalCoordinate(program, camera.y), z = logicalCoordinate(program, camera.z), bx = Math.floor(x), bz = Math.floor(z);
    if (!program.ownership) lines.push(`execute in ${camera.dimension} run forceload add ${bx} ${bz}`);
    lines.push(`execute in ${camera.dimension} run kill @e[tag=${tag}]`);
    const snbt = `{${entityTagsSnbt(ctx, tag)},Invisible:1b,Invulnerable:1b,NoGravity:1b,Marker:1b,Rotation:[${format3(camera.yaw)}f,${format3(camera.pitch)}f]}`;
    lines.push(`execute in ${camera.dimension} run summon minecraft:armor_stand ${format6(x)} ${format6(y)} ${format6(z)} ${snbt}`);
    if (!program.ownership) lines.push(`execute in ${camera.dimension} run forceload remove ${bx} ${bz}`);
  }
}

function compileMarkerLoad(program, lines, ctx, emitters, tagger) {
  for (const emitter of emitters) {
    if (!dynamic(emitter.x, emitter.y, emitter.z)) continue;
    const tag = tagger(ctx.namespace, emitter.id), x = logicalCoordinate(program, emitter.x), y = logicalCoordinate(program, emitter.y), z = logicalCoordinate(program, emitter.z), bx = Math.floor(x), bz = Math.floor(z);
    if (!program.ownership) lines.push(`execute in ${emitter.dimension} run forceload add ${bx} ${bz}`);
    lines.push(`execute in ${emitter.dimension} run kill @e[tag=${tag}]`);
    lines.push(`execute in ${emitter.dimension} run summon minecraft:marker ${format6(x)} ${format6(y)} ${format6(z)} {${entityTagsSnbt(ctx, tag)}}`);
    if (!program.ownership) lines.push(`execute in ${emitter.dimension} run forceload remove ${bx} ${bz}`);
  }
}
export function compileVanillaParticleLoad(program, lines, ctx) { compileMarkerLoad(program, lines, ctx, program.particles, particleTag); }
export function compileVanillaSoundLoad(program, lines, ctx) { compileMarkerLoad(program, lines, ctx, program.sounds, soundTag); }

function compileEntityAxis(dimension, tag, nbtPath, coordinate, scaleText, lines, ctx) {
  if (!dynamicCoordinate(coordinate)) return;
  let source = stateHolder(coordinate.state);
  const ownership = ctx.program.ownership;
  const clamp = ownership && ownership.dimension === dimension && (nbtPath === "Pos[0]" || nbtPath === "Pos[2]");
  if (coordinate.baseRaw !== 0 || clamp) {
    const temp = ctx.nextProjectionTemp();
    lines.push(`scoreboard players operation ${temp} ${ctx.objective} = ${source} ${ctx.objective}`);
    if (coordinate.baseRaw !== 0) lines.push(`scoreboard players operation ${temp} ${ctx.objective} += ${ctx.constantHolder(coordinate.baseRaw)} ${ctx.objective}`);
    if (clamp) {
      const minRaw = scale(nbtPath === "Pos[0]" ? ownership.minX : ownership.minZ, ctx.program.fixedPoint, "ownership clamp");
      const maxRaw = scale(nbtPath === "Pos[0]" ? ownership.maxX : ownership.maxZ, ctx.program.fixedPoint, "ownership clamp");
      const min = ctx.constantHolder(minRaw), max = ctx.constantHolder(maxRaw);
      lines.push(`execute if score ${temp} ${ctx.objective} < ${min} ${ctx.objective} run scoreboard players operation ${temp} ${ctx.objective} = ${min} ${ctx.objective}`);
      lines.push(`execute if score ${temp} ${ctx.objective} > ${max} ${ctx.objective} run scoreboard players operation ${temp} ${ctx.objective} = ${max} ${ctx.objective}`);
    }
    source = temp;
  }
  lines.push(`execute in ${dimension} store result entity @e[tag=${tag},limit=1] ${nbtPath} double ${scaleText} run scoreboard players get ${source} ${ctx.objective}`);
}

function compileEntityFloat(dimension, tag, nbtPath, coordinate, scaleText, lines, ctx) {
  if (!dynamicCoordinate(coordinate)) return;
  let source = stateHolder(coordinate.state);
  if (coordinate.baseRaw !== 0) {
    const temp = ctx.nextProjectionTemp();
    lines.push(`scoreboard players operation ${temp} ${ctx.objective} = ${source} ${ctx.objective}`);
    lines.push(`scoreboard players operation ${temp} ${ctx.objective} += ${ctx.constantHolder(coordinate.baseRaw)} ${ctx.objective}`);
    source = temp;
  }
  lines.push(`execute in ${dimension} store result entity @e[tag=${tag},limit=1] ${nbtPath} float ${scaleText} run scoreboard players get ${source} ${ctx.objective}`);
}

export function compileVanillaProjections(program, lines, ctx) {
  const s = storeScale(program.fixedPoint);
  for (const p of program.projections) {
    const tag = projectionTag(ctx.namespace, p.id);
    compileEntityAxis(p.dimension, tag, "Pos[0]", p.x, s, lines, ctx); compileEntityAxis(p.dimension, tag, "Pos[1]", p.y, s, lines, ctx); compileEntityAxis(p.dimension, tag, "Pos[2]", p.z, s, lines, ctx);
    compileVisibility(p.dimension, tag, p.scale, p.condition, lines, ctx);
  }
}

export function compileVanillaTextUpdates(program, lines, ctx) {
  const s = storeScale(program.fixedPoint);
  for (const text of program.texts) {
    const tag = textTag(ctx.namespace, text.id);
    compileEntityAxis(text.dimension, tag, "Pos[0]", text.x, s, lines, ctx); compileEntityAxis(text.dimension, tag, "Pos[1]", text.y, s, lines, ctx); compileEntityAxis(text.dimension, tag, "Pos[2]", text.z, s, lines, ctx);
    if (text.tokens.some(t => t.kind === "value")) {
      prepareTextValues(program, text, lines, ctx);
      lines.push(`execute in ${text.dimension} if entity @e[tag=${tag},limit=1] run data modify entity @e[tag=${tag},limit=1] text set value ${textComponentSnbt(text, ctx)}`);
    }
    compileVisibility(text.dimension, tag, text.scale, text.condition, lines, ctx);
  }
}

export function compileVanillaActorUpdates(program, lines, ctx) {
  const s = storeScale(program.fixedPoint);
  for (const actor of program.actors) {
    const tag = actorTag(ctx.namespace, actor.id); ensureActorSpawnFunction(program, actor, ctx); const spawn = `${ctx.namespace}:portable/actor_${actor.id}_spawn`;
    if (actor.condition) {
      lines.push(`execute ${condition(actor.condition, true, ctx)} in ${actor.dimension} unless entity @e[tag=${tag},limit=1] run function ${spawn}`);
      lines.push(`execute ${condition(actor.condition, false, ctx)} in ${actor.dimension} if entity @e[tag=${tag},limit=1] run kill @e[tag=${tag}]`);
    }
    compileEntityAxis(actor.dimension, tag, "Pos[0]", actor.x, s, lines, ctx); compileEntityAxis(actor.dimension, tag, "Pos[1]", actor.y, s, lines, ctx); compileEntityAxis(actor.dimension, tag, "Pos[2]", actor.z, s, lines, ctx); compileEntityFloat(actor.dimension, tag, "Rotation[0]", actor.yaw, s, lines, ctx);
    if (actor.pitch) compileEntityFloat(actor.dimension, tag, "Rotation[1]", actor.pitch, s, lines, ctx);
  }
}

export function compileVanillaInteractionUpdates(program, lines, ctx) {
  const s = storeScale(program.fixedPoint);
  for (const interaction of program.interactions) {
    const tag = interactionTag(ctx.namespace, interaction.id);
    ensureInteractionSpawnFunction(program, interaction, ctx);
    const spawn = `${ctx.namespace}:portable/interaction_${interaction.id}_spawn`;
    if (interaction.condition) {
      lines.push(`execute ${condition(interaction.condition, true, ctx)} in ${interaction.dimension} unless entity @e[tag=${tag},limit=1] run function ${spawn}`);
      lines.push(`execute ${condition(interaction.condition, false, ctx)} in ${interaction.dimension} if entity @e[tag=${tag},limit=1] run kill @e[tag=${tag}]`);
    }
    compileEntityAxis(interaction.dimension, tag, "Pos[0]", interaction.x, s, lines, ctx);
    compileEntityAxis(interaction.dimension, tag, "Pos[1]", interaction.y, s, lines, ctx);
    compileEntityAxis(interaction.dimension, tag, "Pos[2]", interaction.z, s, lines, ctx);
  }
}

export function compileVanillaCameraUpdates(program, lines, ctx) {
  const s = storeScale(program.fixedPoint);
  for (const camera of program.cameras) {
    const tag = cameraTag(ctx.namespace, camera.id);
    compileEntityAxis(camera.dimension, tag, "Pos[0]", camera.x, s, lines, ctx); compileEntityAxis(camera.dimension, tag, "Pos[1]", camera.y, s, lines, ctx); compileEntityAxis(camera.dimension, tag, "Pos[2]", camera.z, s, lines, ctx);
  }
}

export function compileVanillaCameraLock(program, lines, ctx) {
  if (!program.cameras.length) return;
  for (const camera of program.cameras) {
    const tag = cameraTag(ctx.namespace, camera.id);
    const selector = program.version >= 12
      ? playerSetSelector(camera.audience ?? "all_online", [camera.mode === "spectate" ? "gamemode=spectator" : "gamemode=!spectator"])
      : controllerSelector(program);
    if (camera.mode === "spectate") lines.push(`execute as ${selector} in ${camera.dimension} if entity @e[type=minecraft:armor_stand,tag=${tag},limit=1] run spectate @e[type=minecraft:armor_stand,tag=${tag},limit=1] @s`);
    else lines.push(`execute as ${selector} in ${camera.dimension} if entity @e[type=minecraft:armor_stand,tag=${tag},limit=1] run teleport @s @e[type=minecraft:armor_stand,tag=${tag},limit=1]`);
  }
}

export function compileVanillaParticles(program, lines, ctx) {
  const s = storeScale(program.fixedPoint);
  for (const e of program.particles) {
    let position, location;
    if (dynamic(e.x, e.y, e.z)) {
      const tag = particleTag(ctx.namespace, e.id); compileEntityAxis(e.dimension, tag, "Pos[0]", e.x, s, lines, ctx); compileEntityAxis(e.dimension, tag, "Pos[1]", e.y, s, lines, ctx); compileEntityAxis(e.dimension, tag, "Pos[2]", e.z, s, lines, ctx);
      position = "~ ~ ~"; location = `in ${e.dimension} at @e[tag=${tag},limit=1]`;
    } else { position = `${format6(logicalCoordinate(program, e.x))} ${format6(logicalCoordinate(program, e.y))} ${format6(logicalCoordinate(program, e.z))}`; location = `in ${e.dimension}`; }
    const command = `particle ${e.particle} ${position} ${numberLiteral(e.delta.x)} ${numberLiteral(e.delta.y)} ${numberLiteral(e.delta.z)} ${numberLiteral(e.speed)} ${e.count}${e.force ? " force" : ""}`;
    lines.push(`execute ${e.condition ? `${condition(e.condition, true, ctx)} ` : ""}${location} run ${command}`);
  }
}

export function compileVanillaSounds(program, lines, ctx) {
  const s = storeScale(program.fixedPoint);
  for (const e of program.sounds) {
    let position, location;
    if (dynamic(e.x, e.y, e.z)) {
      const tag = soundTag(ctx.namespace, e.id); compileEntityAxis(e.dimension, tag, "Pos[0]", e.x, s, lines, ctx); compileEntityAxis(e.dimension, tag, "Pos[1]", e.y, s, lines, ctx); compileEntityAxis(e.dimension, tag, "Pos[2]", e.z, s, lines, ctx);
      position = "~ ~ ~"; location = `in ${e.dimension} at @e[tag=${tag},limit=1]`;
    } else { position = `${format6(logicalCoordinate(program, e.x))} ${format6(logicalCoordinate(program, e.y))} ${format6(logicalCoordinate(program, e.z))}`; location = `in ${e.dimension}`; }
    const command = `playsound ${e.sound} master @a ${position} ${numberLiteral(e.volume)} ${numberLiteral(e.pitch)}`;
    lines.push(`execute ${e.condition ? `${condition(e.condition, true, ctx)} ` : ""}${location} run ${command}`);
  }
}

export function compileVanillaHuds(program, lines, ctx) {
  if (!program.huds.length) return;
  const component = [];
  for (const token of program.huds[0].tokens) {
    if (token.kind === "literal") component.push({ text: token.text });
    else {
      const temp = ctx.nextHudTemp(), source = ctx.score(token.value);
      lines.push(`scoreboard players operation ${temp} ${ctx.objective} = ${source.holder} ${source.objective}`);
      if (program.fixedPoint !== 1) lines.push(`scoreboard players operation ${temp} ${ctx.objective} /= ${ctx.constantHolder(program.fixedPoint)} ${ctx.objective}`);
      component.push({ score: { name: temp, objective: ctx.objective } });
    }
  }
  lines.push(`execute as ${controllerSelector(program)} run title @s actionbar ${JSON.stringify(component)}`);
}

export function compileVanillaSidebarLoad(program, lines, ctx) {
  if (!program.sidebars.length) return;
  const sidebar = program.sidebars[0], objective = sidebarObjectiveName(ctx.namespace);
  lines.push(`scoreboard objectives remove ${objective}`);
  lines.push(`scoreboard objectives add ${objective} dummy ${JSON.stringify({ text: sidebar.title })}`);
  sidebar.rows.forEach((row, i) => {
    const holder = sidebarRowHolder(i);
    lines.push(`scoreboard players set ${holder} ${objective} ${MAX_SIDEBAR_SCORE - i}`);
    lines.push(`scoreboard players display numberformat ${holder} ${objective} blank`);
  });
  lines.push(`scoreboard objectives setdisplay sidebar ${objective}`);
}

export function compileVanillaSidebars(program, lines, ctx) {
  if (!program.sidebars.length) return;
  const sidebar = program.sidebars[0], objective = sidebarObjectiveName(ctx.namespace);
  sidebar.rows.forEach((row, rowIndex) => {
    const extra = row.tokens.map((token, tokenIndex) => {
      if (token.kind === "literal") return { text: token.text };
      const temp = ctx.sidebarValueHolder(sidebar.id, row.id, tokenIndex), source = ctx.score(token.value);
      lines.push(`scoreboard players operation ${temp} ${ctx.objective} = ${source.holder} ${source.objective}`);
      if (program.fixedPoint !== 1) lines.push(`scoreboard players operation ${temp} ${ctx.objective} /= ${ctx.constantHolder(program.fixedPoint)} ${ctx.objective}`);
      return { score: { name: temp, objective: ctx.objective } };
    });
    lines.push(`scoreboard players display name ${sidebarRowHolder(rowIndex)} ${objective} ${JSON.stringify({ text: "", extra })}`);
  });
}

function appendEntityCleanup(lines, program, dimension, tag, xCoord, zCoord) {
  const x = logicalCoordinate(program, xCoord), z = logicalCoordinate(program, zCoord), bx = Math.floor(x), bz = Math.floor(z);
  lines.push(`execute in ${dimension} run forceload add ${bx} ${bz}`);
  lines.push(`execute in ${dimension} run kill @e[tag=${tag}]`);
  lines.push(`execute in ${dimension} run forceload remove ${bx} ${bz}`);
}

export function cleanupLines(program, ctx) {
  const lines = [...playerCleanupLines(program, ctx)];
  if (program.huds.length) lines.push(`execute as ${controllerSelector(program)} run title @s actionbar {"text":""}`);
  if (program.ownership) {
    lines.push(`schedule clear ${ctx.namespace}:portable/owned_init`);
    lines.push(`scoreboard players set #ready ${ctx.objective} 0`);
    lines.push(`execute in ${program.ownership.dimension} run kill @e[tag=${ownerTag(ctx.namespace)}]`);
    if (program.sidebars.length) lines.push(`scoreboard objectives remove ${sidebarObjectiveName(ctx.namespace)}`);
    lines.push(ownershipForceloadCommand(program.ownership, false));
    lines.push(`scoreboard objectives remove ${ctx.objective}`);
    return lines;
  }
  for (const p of program.projections) appendEntityCleanup(lines, program, p.dimension, projectionTag(ctx.namespace, p.id), p.x, p.z);
  for (const t of program.texts) appendEntityCleanup(lines, program, t.dimension, textTag(ctx.namespace, t.id), t.x, t.z);
  for (const a of program.actors) appendEntityCleanup(lines, program, a.dimension, actorTag(ctx.namespace, a.id), a.x, a.z);
  for (const i of program.interactions) appendEntityCleanup(lines, program, i.dimension, interactionTag(ctx.namespace, i.id), i.x, i.z);
  for (const c of program.cameras) appendEntityCleanup(lines, program, c.dimension, cameraTag(ctx.namespace, c.id), c.x, c.z);
  for (const p of program.particles) if (dynamic(p.x, p.y, p.z)) appendEntityCleanup(lines, program, p.dimension, particleTag(ctx.namespace, p.id), p.x, p.z);
  for (const s of program.sounds) if (dynamic(s.x, s.y, s.z)) appendEntityCleanup(lines, program, s.dimension, soundTag(ctx.namespace, s.id), s.x, s.z);
  if (program.sidebars.length) lines.push(`scoreboard objectives remove ${sidebarObjectiveName(ctx.namespace)}`);
  lines.push(`scoreboard objectives remove ${ctx.objective}`);
  return lines;
}

export function validateOwnershipCoverage(program) {
  const o = program.ownership;
  if (!o) return;
  const check = (dimension, x, z, label) => {
    if (dimension !== o.dimension) throw new Error(`${label} dimension is outside portable ownership region: ${dimension}`);
    const px = logicalCoordinate(program, x), pz = logicalCoordinate(program, z);
    if (px < o.minX || px > o.maxX || pz < o.minZ || pz > o.maxZ) throw new Error(`${label} initial position is outside portable ownership region`);
  };
  for (const p of program.projections) check(p.dimension, p.x, p.z, `projection ${p.id}`);
  for (const t of program.texts) check(t.dimension, t.x, t.z, `text ${t.id}`);
  for (const a of program.actors) check(a.dimension, a.x, a.z, `actor ${a.id}`);
  for (const i of program.interactions) check(i.dimension, i.x, i.z, `interaction ${i.id}`);
  for (const c of program.cameras) check(c.dimension, c.x, c.z, `camera ${c.id}`);
  for (const p of program.particles) if (dynamic(p.x, p.y, p.z)) check(p.dimension, p.x, p.z, `particle ${p.id}`);
  for (const s of program.sounds) if (dynamic(s.x, s.y, s.z)) check(s.dimension, s.x, s.z, `sound ${s.id}`);
}
