import { LIMITS, fail, has, isObject, requiredArray, requiredMember, requiredObject, requiredString, memberString, memberNumber, memberBoolean, boundedInteger, memberResource, portableId, sortedKeys } from "./utils.mjs";
import { parseCondition, parseCoordinate, parseTokens } from "./parse-value.mjs";
import { parseVec3 } from "./parse-shapes.mjs";
import { parseGridWorlds } from "./parse-runtime.mjs";

function uniqueIds(values, path) {
  const seen = new Set();
  for (let i = 0; i < values.length; i++) {
    if (!isObject(values[i])) fail(`${path}[${i}] must be an object`);
    const id = portableId(values[i], `${path}[${i}]`);
    if (seen.has(id)) fail(`${path}[${i}].id is duplicated: ${id}`);
    seen.add(id);
  }
}

export function parseVanillaScene(vanilla, ctx, api) {
  const out = { inputs: {}, projections: [], texts: [], actors: [], interactions: [], worldBatches: [], gridWorlds: [] };
  if (has(vanilla, "inputs")) {
    const bindings = requiredObject(vanilla, "inputs", `${api}.vanilla`);
    const allowed = ["first_player_hotbar_slot", "first_player_forward", "first_player_backward", "first_player_left", "first_player_right", "first_player_jump", "first_player_sneak", "first_player_sprint"];
    for (const name of sortedKeys(bindings)) {
      if (!ctx.inputs.has(name)) fail(`${api}.vanilla.inputs references unknown portable input ${name}`);
      const p = `${api}.vanilla.inputs.${name}`, binding = bindings[name];
      if (!isObject(binding)) fail(`${p} must be an object`);
      const source = requiredString(binding, "source", p);
      if (!allowed.includes(source)) fail(`${p}.source unsupported source: ${source}`);
      if (source !== "first_player_hotbar_slot" && ctx.version < 3) fail(`${p}.source requires portable version 3`);
      out.inputs[name] = source;
    }
  }
  if (has(vanilla, "projections")) {
    const values = requiredArray(vanilla, "projections", `${api}.vanilla`);
    if (values.length > LIMITS.projections) fail(`${api}.vanilla.projections exceeds max projection count ${LIMITS.projections}`);
    uniqueIds(values, `${api}.vanilla.projections`);
    out.projections = values.map((v, i) => {
      const p = `${api}.vanilla.projections[${i}]`;
      const result = { id: v.id, dimension: memberResource(v, "dimension", "minecraft:overworld", p), block: memberResource(v, "block", null, p), x: parseCoordinate(requiredMember(v, "x", p), ctx, `${p}.x`), y: parseCoordinate(requiredMember(v, "y", p), ctx, `${p}.y`), z: parseCoordinate(requiredMember(v, "z", p), ctx, `${p}.z`), scale: parseVec3(v, "scale", { x: 1, y: 1, z: 1 }, p, true), translation: parseVec3(v, "translation", { x: 0, y: 0, z: 0 }, p, false), condition: null };
      if (has(v, "when")) { if (ctx.version < 5) fail(`${p}.when requires portable version 5`); result.condition = parseCondition(requiredObject(v, "when", p), ctx, `${p}.when`); }
      return result;
    });
  }
  if (has(vanilla, "texts")) {
    if (ctx.version < 4) fail(`${api}.vanilla.texts requires portable version 4`);
    const values = requiredArray(vanilla, "texts", `${api}.vanilla`);
    if (values.length > LIMITS.texts) fail(`${api}.vanilla.texts exceeds max text count ${LIMITS.texts}`);
    uniqueIds(values, `${api}.vanilla.texts`);
    out.texts = values.map((v, i) => {
      const p = `${api}.vanilla.texts[${i}]`;
      let tokens;
      if (typeof v.text === "string") { if (v.text.length > 256) fail(`${p}.text exceeds 256 characters`); tokens = [{ kind: "literal", text: v.text }]; }
      else { if (ctx.version < 7) fail(`${p}.text token arrays require portable version 7`); tokens = parseTokens(requiredMember(v, "text", p), ctx, `${p}.text`); }
      const billboard = memberString(v, "billboard", "center", p);
      if (!["fixed", "vertical", "horizontal", "center"].includes(billboard)) fail(`${p}.billboard must be fixed, vertical, horizontal, or center`);
      const result = { id: v.id, dimension: memberResource(v, "dimension", "minecraft:overworld", p), tokens, x: parseCoordinate(requiredMember(v, "x", p), ctx, `${p}.x`), y: parseCoordinate(requiredMember(v, "y", p), ctx, `${p}.y`), z: parseCoordinate(requiredMember(v, "z", p), ctx, `${p}.z`), scale: parseVec3(v, "scale", { x: 1, y: 1, z: 1 }, p, true), billboard, condition: null };
      if (has(v, "when")) { if (ctx.version < 5) fail(`${p}.when requires portable version 5`); result.condition = parseCondition(requiredObject(v, "when", p), ctx, `${p}.when`); }
      return result;
    });
  }
  if (has(vanilla, "actors")) {
    if (ctx.version < 7) fail(`${api}.vanilla.actors requires portable version 7`);
    const values = requiredArray(vanilla, "actors", `${api}.vanilla`);
    if (values.length > LIMITS.actors) fail(`${api}.vanilla.actors exceeds max actor count ${LIMITS.actors}`);
    uniqueIds(values, `${api}.vanilla.actors`);
    out.actors = values.map((v, i) => {
      const p = `${api}.vanilla.actors[${i}]`, entityType = memberResource(v, "entityType", "minecraft:mannequin", p);
      if (!["minecraft:mannequin", "minecraft:zombie", "minecraft:skeleton"].includes(entityType)) fail(`${p}.entityType must be minecraft:mannequin, minecraft:zombie, or minecraft:skeleton`);
      const v22Keys = ["pitch", "profile", "hiddenLayers", "pose", "mainHand", "equipment"];
      if (ctx.version < 22 && v22Keys.some(key => has(v, key))) fail(`${p} expanded actor presentation requires portable version 22`);
      const result = { id: v.id, dimension: memberResource(v, "dimension", "minecraft:overworld", p), entityType, x: parseCoordinate(requiredMember(v, "x", p), ctx, `${p}.x`), y: parseCoordinate(requiredMember(v, "y", p), ctx, `${p}.y`), z: parseCoordinate(requiredMember(v, "z", p), ctx, `${p}.z`), yaw: has(v, "yaw") ? parseCoordinate(v.yaw, ctx, `${p}.yaw`) : { state: null, baseRaw: 0 }, pitch: has(v, "pitch") ? parseCoordinate(v.pitch, ctx, `${p}.pitch`) : null, condition: has(v, "when") ? parseCondition(requiredObject(v, "when", p), ctx, `${p}.when`) : null, profile: null, hiddenLayers: null, pose: null, mainHand: null, equipment: null };
      if (has(v, "profile")) {
        const q = `${p}.profile`, profile = requiredObject(v, "profile", p), allowed = new Set(["texture", "cape", "elytra", "model"]);
        for (const key of Object.keys(profile)) if (!allowed.has(key)) fail(`${q}.${key} is not supported`);
        result.profile = {};
        for (const key of ["texture", "cape", "elytra"]) if (has(profile, key)) result.profile[key] = memberResource(profile, key, null, q);
        if (has(profile, "model")) { if (profile.model !== "wide" && profile.model !== "slim") fail(`${q}.model must be wide or slim`); result.profile.model = profile.model; }
      }
      if (has(v, "hiddenLayers")) {
        const layers = requiredArray(v, "hiddenLayers", p), allowed = new Set(["cape", "jacket", "left_sleeve", "right_sleeve", "left_pants_leg", "right_pants_leg", "hat"]);
        if (layers.length > 7 || new Set(layers).size !== layers.length || layers.some(layer => typeof layer !== "string" || !allowed.has(layer))) fail(`${p}.hiddenLayers contains an unsupported or duplicate layer`);
        result.hiddenLayers = [...layers];
      }
      if (has(v, "pose")) { if (!["standing", "crouching", "swimming", "fall_flying", "sleeping"].includes(v.pose)) fail(`${p}.pose is unsupported`); result.pose = v.pose; }
      if (has(v, "mainHand")) { if (v.mainHand !== "left" && v.mainHand !== "right") fail(`${p}.mainHand must be left or right`); result.mainHand = v.mainHand; }
      if (has(v, "equipment")) {
        const q = `${p}.equipment`, equipment = requiredObject(v, "equipment", p), slots = new Set(["head", "chest", "legs", "feet", "mainhand", "offhand"]);
        for (const key of Object.keys(equipment)) if (!slots.has(key)) fail(`${q}.${key} is not supported`);
        result.equipment = {};
        for (const key of slots) if (has(equipment, key)) result.equipment[key] = memberResource(equipment, key, null, q);
      }
      return result;
    });
  }
  if (has(vanilla, "interactions")) {
    if (ctx.version < 23) fail(`${api}.vanilla.interactions requires portable version 23`);
    const values = requiredArray(vanilla, "interactions", `${api}.vanilla`);
    if (values.length > LIMITS.interactions) fail(`${api}.vanilla.interactions exceeds max interaction count ${LIMITS.interactions}`);
    uniqueIds(values, `${api}.vanilla.interactions`);
    out.interactions = values.map((v, i) => {
      const p = `${api}.vanilla.interactions[${i}]`;
      const width = memberNumber(v, "width", 1, p), height = memberNumber(v, "height", 1, p);
      if (width < 0.01 || width > 64) fail(`${p}.width must be between 0.01 and 64`);
      if (height < 0.01 || height > 64) fail(`${p}.height must be between 0.01 and 64`);
      return {
        id: v.id,
        dimension: memberResource(v, "dimension", "minecraft:overworld", p),
        x: parseCoordinate(requiredMember(v, "x", p), ctx, `${p}.x`),
        y: parseCoordinate(requiredMember(v, "y", p), ctx, `${p}.y`),
        z: parseCoordinate(requiredMember(v, "z", p), ctx, `${p}.z`),
        width, height,
        response: memberBoolean(v, "response", true, p),
        condition: has(v, "when") ? parseCondition(requiredObject(v, "when", p), ctx, `${p}.when`) : null,
      };
    });
  }
  if (has(vanilla, "worldBatches")) {
    if (ctx.version < 8) fail(`${api}.vanilla.worldBatches requires portable version 8`);
    const values = requiredArray(vanilla, "worldBatches", `${api}.vanilla`);
    if (values.length > LIMITS.worldBatches) fail(`${api}.vanilla.worldBatches exceeds max batch count ${LIMITS.worldBatches}`);
    uniqueIds(values, `${api}.vanilla.worldBatches`); let total = 0;
    out.worldBatches = values.map((v, i) => {
      const p = `${api}.vanilla.worldBatches[${i}]`, blocks = requiredArray(v, "blocks", p);
      if (blocks.length < 1 || blocks.length > LIMITS.worldWrites) fail(`${p}.blocks must contain 1..${LIMITS.worldWrites} writes`);
      total += blocks.length; if (total > LIMITS.worldWrites) fail(`${api}.vanilla.worldBatches exceeds total write count ${LIMITS.worldWrites}`);
      return { id: v.id, dimension: memberResource(v, "dimension", "minecraft:overworld", p), blocks: blocks.map((w, j) => { const q = `${p}.blocks[${j}]`; if (!isObject(w)) fail(`${q} must be an object`); return { x: boundedInteger(requiredMember(w, "x", q), -30000000, 30000000, `${q}.x`), y: boundedInteger(requiredMember(w, "y", q), -2048, 2048, `${q}.y`), z: boundedInteger(requiredMember(w, "z", q), -30000000, 30000000, `${q}.z`), block: memberResource(w, "block", null, q) }; }), condition: has(v, "when") ? parseCondition(requiredObject(v, "when", p), ctx, `${p}.when`) : null };
    });
  }
  out.gridWorlds = parseGridWorlds(vanilla, ctx, api);
  return out;
}
