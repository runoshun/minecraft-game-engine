import { ownerTag, placeablePendingTag } from "./compile-context.mjs";
import { compileControllerAdvance, interactionControllerIds } from "./compile-interaction-controller.mjs";
import { snbtQuoted } from "./utils.mjs";

const BUILTIN_DIMENSIONS = ["minecraft:overworld", "minecraft:the_nether", "minecraft:the_end"];

function placementDimensions(ownership) {
  return [...new Set([ownership.dimension, ...BUILTIN_DIMENSIONS])];
}

function itemFor(program, id) {
  const item = (program.items || []).find(value => value.id === id);
  if (!item) throw new Error(`unknown portable item: ${id}`);
  return item;
}

function placeableForItem(program, id) {
  const placeable = (program.placeables || []).find(value => value.item === id);
  if (!placeable) throw new Error(`portable item ${id} is not bound to a placeable`);
  return placeable;
}

function headTextureValue(url) {
  return Buffer.from(JSON.stringify({ textures: { SKIN: { url } } }), "utf8").toString("base64");
}

function appearanceComponentEntries(item) {
  const entries = [];
  entries.push(["minecraft:custom_name", snbtQuoted(JSON.stringify({ text: item.name, italic: false }))]);
  entries.push(["minecraft:max_stack_size", String(item.maxStackSize)]);
  if (item.appearance.kind === "head") {
    entries.push(["minecraft:item_model", snbtQuoted("minecraft:player_head")]);
    const texture = headTextureValue(item.appearance.textureUrl);
    entries.push(["minecraft:profile", `{properties:[{name:${snbtQuoted("textures")},value:${snbtQuoted(texture)}}]}`]);
  } else {
    entries.push(["minecraft:item_model", snbtQuoted(item.appearance.model)]);
  }
  return entries;
}

function carrierComponentEntries(item, placeable, ctx) {
  return [
    ...appearanceComponentEntries(item),
    ["minecraft:custom_data", `{mcgame_item:${snbtQuoted(item.id)}}`],
    ["minecraft:entity_data", `{id:${snbtQuoted("minecraft:armor_stand")},Tags:[${snbtQuoted(ownerTag(ctx.namespace))},${snbtQuoted(placeablePendingTag(ctx.namespace, placeable.id))}],Invisible:1b,Marker:1b,NoGravity:1b}`],
  ];
}

export function placeableItemStack(program, itemId, ctx) {
  const item = itemFor(program, itemId), placeable = placeableForItem(program, itemId);
  const components = carrierComponentEntries(item, placeable, ctx).map(([key, value]) => `${key}=${value}`).join(",");
  return `minecraft:armor_stand[${components}]`;
}

export function placeableItemNbt(program, itemId, ctx, count = 1) {
  const item = itemFor(program, itemId), placeable = placeableForItem(program, itemId);
  const components = carrierComponentEntries(item, placeable, ctx).map(([key, value]) => `${snbtQuoted(key)}:${value}`).join(",");
  return `{id:${snbtQuoted("minecraft:armor_stand")},count:${count},components:{${components}}}`;
}

export function placeableItemRenderNbt(program, itemId, count = 1) {
  const item = itemFor(program, itemId);
  const components = appearanceComponentEntries(item).map(([key, value]) => `${snbtQuoted(key)}:${value}`).join(",");
  return `{id:${snbtQuoted("minecraft:armor_stand")},count:${count},components:{${components}}}`;
}

export function compileItemGive(action, lines, ctx) {
  lines.push(`give @s ${placeableItemStack(ctx.program, action.item, ctx)} ${action.count}`);
}

function controllerIdsForSlot(program, placeable, slot) {
  const used = new Set(interactionControllerIds(program));
  return program.interactions
    .filter(value => value.placeable?.id === placeable && value.placeable?.slot === slot && used.has(value.id))
    .map(value => value.id);
}

function resetSlot(placeable, slot, lines, ctx) {
  for (const interaction of controllerIdsForSlot(ctx.program, placeable.id, slot)) compileControllerAdvance(interaction, lines, ctx, false);
  lines.push(`scoreboard players set ${ctx.placeableActiveHolder(placeable.id, slot)} ${ctx.objective} 0`);
  for (const [name, raw] of Object.entries(placeable.initialState).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`scoreboard players set ${ctx.placeableStateHolder(placeable.id, slot, name)} ${ctx.objective} ${raw}`);
  }
}

export function compilePlaceableRemove(action, lines, ctx) {
  const placeable = ctx.program.placeables.find(value => value.id === action.placeable);
  if (!placeable) throw new Error(`unknown placeable remove target: ${action.placeable}`);
  resetSlot(placeable, action.slot, lines, ctx);
  lines.push(`execute in ${ctx.program.ownership.dimension} run kill @e[type=minecraft:armor_stand,tag=${ctx.placeableAnchorTag(placeable.id, action.slot)}]`);
}

export function compilePlaceableLoad(program, lines, ctx) {
  if (program.version < 25 || !(program.placeables || []).length) return;
  for (const placeable of program.placeables) {
    for (const dimension of placementDimensions(program.ownership)) {
      lines.push(`execute in ${dimension} run kill @e[type=minecraft:armor_stand,tag=${placeablePendingTag(ctx.namespace, placeable.id)}]`);
    }
    for (let slot = 0; slot < placeable.maxInstances; slot++) {
      lines.push(`scoreboard players set ${ctx.placeableActiveHolder(placeable.id, slot)} ${ctx.objective} 0`);
      lines.push(`scoreboard players set ${ctx.placeableAnchorHolder(placeable.id, slot, "x")} ${ctx.objective} 0`);
      lines.push(`scoreboard players set ${ctx.placeableAnchorHolder(placeable.id, slot, "y")} ${ctx.objective} 0`);
      lines.push(`scoreboard players set ${ctx.placeableAnchorHolder(placeable.id, slot, "z")} ${ctx.objective} 0`);
      lines.push(`scoreboard players set ${ctx.placeableAnchorHolder(placeable.id, slot, "orientation")} ${ctx.objective} 0`);
      for (const [name, raw] of Object.entries(placeable.initialState).sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`scoreboard players set ${ctx.placeableStateHolder(placeable.id, slot, name)} ${ctx.objective} ${raw}`);
      }
    }
  }
}

function allocatorSlotFunction(placeable, slot, ctx) {
  const body = [];
  for (const interaction of controllerIdsForSlot(ctx.program, placeable.id, slot)) compileControllerAdvance(interaction, body, ctx, false);
  body.push(`execute store result score ${ctx.placeableAnchorHolder(placeable.id, slot, "x")} ${ctx.objective} run data get entity @s Pos[0] ${ctx.program.fixedPoint}`);
  body.push(`execute store result score ${ctx.placeableAnchorHolder(placeable.id, slot, "y")} ${ctx.objective} run data get entity @s Pos[1] ${ctx.program.fixedPoint}`);
  body.push(`execute store result score ${ctx.placeableAnchorHolder(placeable.id, slot, "z")} ${ctx.objective} run data get entity @s Pos[2] ${ctx.program.fixedPoint}`);
  body.push(`execute store result score #pyaw ${ctx.objective} run data get entity @s Rotation[0] 1`);
  const orientation = ctx.placeableAnchorHolder(placeable.id, slot, "orientation");
  body.push(`scoreboard players set ${orientation} ${ctx.objective} 0`);
  body.push(`execute if score #pyaw ${ctx.objective} matches 45..134 run scoreboard players set ${orientation} ${ctx.objective} 1`);
  body.push(`execute if score #pyaw ${ctx.objective} matches 135..180 run scoreboard players set ${orientation} ${ctx.objective} 2`);
  body.push(`execute if score #pyaw ${ctx.objective} matches -180..-135 run scoreboard players set ${orientation} ${ctx.objective} 2`);
  body.push(`execute if score #pyaw ${ctx.objective} matches -134..-46 run scoreboard players set ${orientation} ${ctx.objective} 3`);
  for (const [name, raw] of Object.entries(placeable.initialState).sort(([a], [b]) => a.localeCompare(b))) {
    body.push(`scoreboard players set ${ctx.placeableStateHolder(placeable.id, slot, name)} ${ctx.objective} ${raw}`);
  }
  body.push(`scoreboard players set ${ctx.placeableActiveHolder(placeable.id, slot)} ${ctx.objective} ${ctx.program.fixedPoint}`);
  body.push(`tag @s remove ${placeablePendingTag(ctx.namespace, placeable.id)}`);
  body.push(`tag @s add ${ctx.placeableAnchorTag(placeable.id, slot)}`);
  body.push(`scoreboard players set #palloc ${ctx.objective} 1`);
  return body;
}

export function compilePlaceableServices(program, lines, ctx) {
  if (program.version < 25 || !(program.placeables || []).length) return;
  const ownership = program.ownership;
  for (const placeable of program.placeables) {
    for (let slot = 0; slot < placeable.maxInstances; slot++) {
      ctx.functions.set(`placeable_${placeable.id}_${slot}_allocate`, allocatorSlotFunction(placeable, slot, ctx));
    }
    const reject = [
      `summon minecraft:item ~ ~0.25 ~ {Item:${placeableItemNbt(program, placeable.item, ctx, 1)}}`,
      `kill @s`,
    ];
    ctx.functions.set(`placeable_${placeable.id}_reject`, reject);
    const allocate = [];
    const minX = Math.round(ownership.minX * program.fixedPoint), maxX = Math.round(ownership.maxX * program.fixedPoint);
    const minZ = Math.round(ownership.minZ * program.fixedPoint), maxZ = Math.round(ownership.maxZ * program.fixedPoint);
    allocate.push(`execute store result score #pcx ${ctx.objective} run data get entity @s Pos[0] ${program.fixedPoint}`);
    allocate.push(`execute store result score #pcz ${ctx.objective} run data get entity @s Pos[2] ${program.fixedPoint}`);
    allocate.push(`execute unless score #pcx ${ctx.objective} matches ${minX}..${maxX} run function ${ctx.namespace}:portable/placeable_${placeable.id}_reject`);
    allocate.push(`execute unless score #pcx ${ctx.objective} matches ${minX}..${maxX} run return 0`);
    allocate.push(`execute unless score #pcz ${ctx.objective} matches ${minZ}..${maxZ} run function ${ctx.namespace}:portable/placeable_${placeable.id}_reject`);
    allocate.push(`execute unless score #pcz ${ctx.objective} matches ${minZ}..${maxZ} run return 0`);
    allocate.push(`scoreboard players set #palloc ${ctx.objective} 0`);
    for (let slot = 0; slot < placeable.maxInstances; slot++) {
      allocate.push(`execute if score #palloc ${ctx.objective} matches 0 if score ${ctx.placeableActiveHolder(placeable.id, slot)} ${ctx.objective} matches 0 run function ${ctx.namespace}:portable/placeable_${placeable.id}_${slot}_allocate`);
    }
    allocate.push(`execute if score #palloc ${ctx.objective} matches 0 run function ${ctx.namespace}:portable/placeable_${placeable.id}_reject`);
    ctx.functions.set(`placeable_${placeable.id}_allocate`, allocate);
    for (const dimension of placementDimensions(ownership)) {
      if (dimension === ownership.dimension) continue;
      lines.push(`execute in ${dimension} as @e[type=minecraft:armor_stand,tag=${placeablePendingTag(ctx.namespace, placeable.id)}] at @s if dimension ${dimension} run function ${ctx.namespace}:portable/placeable_${placeable.id}_reject`);
    }
    lines.push(`execute in ${ownership.dimension} as @e[type=minecraft:armor_stand,tag=${placeablePendingTag(ctx.namespace, placeable.id)}] at @s if dimension ${ownership.dimension} run function ${ctx.namespace}:portable/placeable_${placeable.id}_allocate`);
  }
}

export function placeableCleanupLines(program, ctx) {
  if (program.version < 25 || !(program.placeables || []).length) return [];
  const lines = [];
  for (const placeable of program.placeables) {
    for (const dimension of placementDimensions(program.ownership)) {
      lines.push(`execute in ${dimension} run kill @e[type=minecraft:armor_stand,tag=${placeablePendingTag(ctx.namespace, placeable.id)}]`);
    }
  }
  return lines;
}
