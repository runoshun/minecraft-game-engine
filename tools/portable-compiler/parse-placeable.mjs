import {
  LIMITS, RESOURCE_ID, fail, has, isObject, requiredArray, requiredMember, requiredObject,
  requiredString, boundedInteger, finiteNumber, portableId, scale, sortedKeys, validateValueName,
} from "./utils.mjs";

const TEXTURE_URL = /^https:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]{32,128}$/;

export function parseItems(spec, version, api) {
  if (!has(spec, "items")) return [];
  if (version < 25) fail(`${api}.items requires portable version 25`);
  const values = requiredArray(spec, "items", api);
  if (values.length > LIMITS.items) fail(`${api}.items exceeds max item count ${LIMITS.items}`);
  const seen = new Set();
  return values.map((value, index) => {
    const p = `${api}.items[${index}]`;
    if (!isObject(value)) fail(`${p} must be an object`);
    const allowedItem = new Set(["id", "name", "appearance", "maxStackSize"]);
    for (const key of Object.keys(value)) if (!allowedItem.has(key)) fail(`${p}.${key} is not supported`);
    const id = portableId(value, p);
    if (seen.has(id)) fail(`${p}.id is duplicated: ${id}`);
    seen.add(id);
    const name = requiredString(value, "name", p);
    if (name.length < 1 || name.length > 128) fail(`${p}.name must contain 1..128 characters`);
    const appearance = requiredObject(value, "appearance", p);
    const kind = requiredString(appearance, "kind", `${p}.appearance`);
    const allowedAppearance = kind === "head" ? new Set(["kind", "textureUrl"]) : new Set(["kind", "model"]);
    for (const key of Object.keys(appearance)) if (!allowedAppearance.has(key)) fail(`${p}.appearance.${key} is not supported`);
    let parsedAppearance;
    if (kind === "head") {
      const textureUrl = requiredString(appearance, "textureUrl", `${p}.appearance`);
      if (!TEXTURE_URL.test(textureUrl)) fail(`${p}.appearance.textureUrl must be an https://textures.minecraft.net/texture/<hex> URL`);
      parsedAppearance = { kind, textureUrl };
    } else if (kind === "model") {
      const model = requiredString(appearance, "model", `${p}.appearance`);
      if (!RESOURCE_ID.test(model)) fail(`${p}.appearance.model is not a valid resource id: ${model}`);
      parsedAppearance = { kind, model };
    } else {
      fail(`${p}.appearance.kind must be head or model`);
    }
    const maxStackSize = has(value, "maxStackSize")
      ? boundedInteger(value.maxStackSize, 1, 64, `${p}.maxStackSize`)
      : 1;
    return { id, name, appearance: parsedAppearance, maxStackSize };
  });
}

export function parsePlaceables(spec, version, fixedPoint, items, api) {
  if (!has(spec, "placeables")) {
    if (items.length) fail(api + ".items must each be bound to exactly one placeable type; unused: " + items.map(item => item.id).join(", "));
    return [];
  }
  if (version < 25) fail(`${api}.placeables requires portable version 25`);
  const values = requiredArray(spec, "placeables", api);
  if (values.length > LIMITS.placeableTypes) fail(`${api}.placeables exceeds max placeable type count ${LIMITS.placeableTypes}`);
  const itemIds = new Set(items.map(item => item.id));
  const usedItems = new Set();
  const seen = new Set();
  let slots = 0, cells = 0;
  const out = values.map((value, index) => {
    const p = `${api}.placeables[${index}]`;
    if (!isObject(value)) fail(`${p} must be an object`);
    const allowedPlaceable = new Set(["id", "item", "maxInstances", "orientation", "state"]);
    for (const key of Object.keys(value)) if (!allowedPlaceable.has(key)) fail(`${p}.${key} is not supported`);
    const id = portableId(value, p);
    if (seen.has(id)) fail(`${p}.id is duplicated: ${id}`);
    seen.add(id);
    const item = requiredString(value, "item", p);
    if (!itemIds.has(item)) fail(`${p}.item references unknown item ${item}`);
    if (usedItems.has(item)) fail(`${p}.item ${item} is already bound to another placeable type`);
    usedItems.add(item);
    const maxInstances = boundedInteger(requiredMember(value, "maxInstances", p), 1, LIMITS.placeableInstancesPerType, `${p}.maxInstances`);
    slots += maxInstances;
    if (slots > LIMITS.placeableSlotsTotal) fail(`${api}.placeables exceeds aggregate slot count ${LIMITS.placeableSlotsTotal}`);
    const orientation = has(value, "orientation") ? value.orientation : "cardinal";
    if (orientation !== "cardinal") fail(`${p}.orientation must be cardinal`);
    const rawState = has(value, "state") ? requiredObject(value, "state", p) : {};
    if (Object.keys(rawState).length > LIMITS.placeableStates) fail(`${p}.state exceeds max field count ${LIMITS.placeableStates}`);
    cells += Object.keys(rawState).length * maxInstances;
    if (cells > LIMITS.placeableStateCellsTotal) fail(`${api}.placeables exceeds aggregate state cell count ${LIMITS.placeableStateCellsTotal}`);
    const initialState = {};
    for (const name of sortedKeys(rawState)) {
      validateValueName(name, `${p}.state`);
      initialState[name] = scale(finiteNumber(rawState[name], `${p}.state.${name}`), fixedPoint, `${p}.state.${name}`);
    }
    return { id, item, maxInstances, orientation, initialState };
  });
  if (items.length !== usedItems.size) {
    const unused = items.map(item => item.id).filter(id => !usedItems.has(id));
    fail(`${api}.items must each be bound to exactly one placeable type; unused: ${unused.join(", ")}`);
  }
  return out;
}

export function placeableContextMap(placeables) {
  return new Map(placeables.map(value => [value.id, {
    id: value.id,
    maxInstances: value.maxInstances,
    states: new Set(Object.keys(value.initialState)),
  }]));
}
