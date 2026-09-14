import {
  LIMITS, fail, has, isObject, requiredArray, requiredMember, requiredString,
  boundedInteger, finiteNumber, memberResource, portableId, scale,
} from "./utils.mjs";

function uniqueIds(values, path) {
  const seen = new Set();
  for (let i = 0; i < values.length; i++) {
    if (!isObject(values[i])) fail(`${path}[${i}] must be an object`);
    const id = portableId(values[i], `${path}[${i}]`);
    if (seen.has(id)) fail(`${path}[${i}].id is duplicated: ${id}`);
    seen.add(id);
  }
}

function parsePersistentGridEntry(value, index, path, fixedPoint) {
  const p = `${path}[${index}]`;
  if (!isObject(value)) fail(`${p} must be an object`);
  const id = portableId(value, p);
  const width = boundedInteger(requiredMember(value, "width", p), 1, LIMITS.gridDimension, `${p}.width`);
  const height = boundedInteger(requiredMember(value, "height", p), 1, LIMITS.gridDimension, `${p}.height`);
  if (width * height > LIMITS.gridCells) fail(`${p} exceeds max persistent-grid cell count ${LIMITS.gridCells}`);
  const initial = finiteNumber(requiredMember(value, "initial", p), `${p}.initial`);
  const outside = finiteNumber(requiredMember(value, "outside", p), `${p}.outside`);
  const onSchemaMismatch = Object.prototype.hasOwnProperty.call(value, "onSchemaMismatch") ? value.onSchemaMismatch : "reset";
  if (onSchemaMismatch !== "reset" && onSchemaMismatch !== "preserve") fail(`${p}.onSchemaMismatch must be reset or preserve`);
  return {
    id, width, height,
    initialRaw: scale(initial, fixedPoint, `${p}.initial`),
    outsideRaw: scale(outside, fixedPoint, `${p}.outside`),
    schema: boundedInteger(Object.prototype.hasOwnProperty.call(value, "schema") ? value.schema : 1, 1, 2147483647, `${p}.schema`),
    onSchemaMismatch,
  };
}

export function parsePersistentGrids(spec, version, fixedPoint, api) {
  if (!has(spec, "persistentGrids")) return [];
  if (version < 19) fail(`${api}.persistentGrids requires portable version 19`);
  const values = requiredArray(spec, "persistentGrids", api);
  if (values.length > LIMITS.persistentGrids) fail(`${api}.persistentGrids exceeds max persistent-grid count ${LIMITS.persistentGrids}`);
  uniqueIds(values, `${api}.persistentGrids`);
  return values.map((value, index) => parsePersistentGridEntry(value, index, `${api}.persistentGrids`, fixedPoint));
}

export function parsePersistentGridValues(values, fixedPoint, path) {
  uniqueIds(values, path);
  return values.map((value, index) => parsePersistentGridEntry(value, index, path, fixedPoint));
}

export function parseGrids(spec, version, fixedPoint, api) {
  if (!has(spec, "grids")) return [];
  if (version < 13) fail(`${api}.grids requires portable version 13`);
  const values = requiredArray(spec, "grids", api);
  if (values.length > LIMITS.grids) fail(`${api}.grids exceeds max grid count ${LIMITS.grids}`);
  uniqueIds(values, `${api}.grids`);
  return values.map((value, index) => {
    const p = `${api}.grids[${index}]`;
    const width = boundedInteger(requiredMember(value, "width", p), 1, LIMITS.gridDimension, `${p}.width`);
    const height = boundedInteger(requiredMember(value, "height", p), 1, LIMITS.gridDimension, `${p}.height`);
    if (width * height > LIMITS.gridCells) fail(`${p} exceeds max grid cell count ${LIMITS.gridCells}`);
    return {
      id: value.id,
      width,
      height,
      initialRaw: scale(finiteNumber(requiredMember(value, "initial", p), `${p}.initial`), fixedPoint, `${p}.initial`),
      outsideRaw: scale(finiteNumber(requiredMember(value, "outside", p), `${p}.outside`), fixedPoint, `${p}.outside`),
    };
  });
}

export function parseRngs(spec, version, api) {
  if (!has(spec, "rngs")) return [];
  if (version < 13) fail(`${api}.rngs requires portable version 13`);
  const values = requiredArray(spec, "rngs", api);
  if (values.length > LIMITS.rngs) fail(`${api}.rngs exceeds max RNG count ${LIMITS.rngs}`);
  uniqueIds(values, `${api}.rngs`);
  return values.map((value, index) => {
    const p = `${api}.rngs[${index}]`;
    return {
      id: value.id,
      seed: boundedInteger(requiredMember(value, "seed", p), -2147483648, 2147483647, `${p}.seed`),
    };
  });
}

export function parseGridWorlds(vanilla, ctx, api) {
  if (!has(vanilla, "gridWorlds")) return [];
  if (ctx.version < 13) fail(`${api}.vanilla.gridWorlds requires portable version 13`);
  const values = requiredArray(vanilla, "gridWorlds", `${api}.vanilla`);
  if (values.length > LIMITS.gridWorlds) fail(`${api}.vanilla.gridWorlds exceeds max grid-world count ${LIMITS.gridWorlds}`);
  uniqueIds(values, `${api}.vanilla.gridWorlds`);
  return values.map((value, index) => {
    const p = `${api}.vanilla.gridWorlds[${index}]`;
    const grid = requiredString(value, "grid", p);
    if (!ctx.grids.has(grid)) fail(`${p}.grid references unknown grid ${grid}`);
    const palette = requiredArray(value, "palette", p);
    if (palette.length < 1 || palette.length > LIMITS.gridPalette) fail(`${p}.palette must contain 1..${LIMITS.gridPalette} entries`);
    const seen = new Set();
    const parsedPalette = palette.map((entry, paletteIndex) => {
      const q = `${p}.palette[${paletteIndex}]`;
      if (!isObject(entry)) fail(`${q} must be an object`);
      const logical = finiteNumber(requiredMember(entry, "value", q), `${q}.value`);
      const raw = scale(logical, ctx.fixedPoint, `${q}.value`);
      if (seen.has(raw)) fail(`${q}.value duplicates another palette value: ${logical}`);
      seen.add(raw);
      return { raw, block: memberResource(entry, "block", null, q) };
    });
    return {
      id: value.id,
      grid,
      dimension: memberResource(value, "dimension", "minecraft:overworld", p),
      originX: boundedInteger(requiredMember(value, "originX", p), -30000000, 30000000, `${p}.originX`),
      y: boundedInteger(requiredMember(value, "y", p), -2048, 2048, `${p}.y`),
      originZ: boundedInteger(requiredMember(value, "originZ", p), -30000000, 30000000, `${p}.originZ`),
      cellsPerTick: boundedInteger(requiredMember(value, "cellsPerTick", p), 1, LIMITS.gridCellsPerTick, `${p}.cellsPerTick`),
      palette: parsedPalette,
    };
  });
}
