import {
  LIMITS, fail, has, isObject, requiredArray, requiredMember, requiredObject,
  boundedInteger, finiteNumber, memberResource, portableId, scale, sortedKeys, validateValueName,
} from "./utils.mjs";
import { parsePlayerSetRef, playerSetKey } from "./player-set.mjs";

function parseSessionPersistentState(value, version, fixedPoint, path) {
  if (!has(value, "persistentState")) return {};
  if (version < 18) fail(`${path}.persistentState requires portable version 18`);
  const raw = requiredObject(value, "persistentState", path);
  const out = {};
  for (const name of sortedKeys(raw)) {
    validateValueName(name, `${path}.persistentState`);
    const p = `${path}.persistentState.${name}`;
    const spec = raw[name];
    if (!isObject(spec)) fail(`${p} must be an object`);
    const onSchemaMismatch = has(spec, "onSchemaMismatch") ? spec.onSchemaMismatch : "reset";
    if (onSchemaMismatch !== "reset" && onSchemaMismatch !== "preserve") fail(`${p}.onSchemaMismatch must be reset or preserve`);
    out[name] = {
      initialRaw: scale(finiteNumber(requiredMember(spec, "initial", p), `${p}.initial`), fixedPoint, `${p}.initial`),
      schema: boundedInteger(has(spec, "schema") ? spec.schema : 1, 1, 2147483647, `${p}.schema`),
      onSchemaMismatch,
    };
  }
  return out;
}

function parseSessionGrids(value, fixedPoint, path) {
  if (!has(value, "grids")) return [];
  const values = requiredArray(value, "grids", path);
  if (values.length > LIMITS.grids) fail(`${path}.grids exceeds max grid count ${LIMITS.grids}`);
  const seen = new Set();
  return values.map((grid, index) => {
    const p = `${path}.grids[${index}]`;
    if (!isObject(grid)) fail(`${p} must be an object`);
    const id = portableId(grid, p);
    if (seen.has(id)) fail(`${p}.id is duplicated: ${id}`);
    seen.add(id);
    const width = boundedInteger(requiredMember(grid, "width", p), 1, LIMITS.gridDimension, `${p}.width`);
    const height = boundedInteger(requiredMember(grid, "height", p), 1, LIMITS.gridDimension, `${p}.height`);
    if (width * height > LIMITS.gridCells) fail(`${p} exceeds max grid cell count ${LIMITS.gridCells}`);
    return {
      id, width, height,
      initialRaw: scale(finiteNumber(requiredMember(grid, "initial", p), `${p}.initial`), fixedPoint, `${p}.initial`),
      outsideRaw: scale(finiteNumber(requiredMember(grid, "outside", p), `${p}.outside`), fixedPoint, `${p}.outside`),
    };
  });
}

function parseSessionRngs(value, path, gridIds) {
  if (!has(value, "rngs")) return [];
  const values = requiredArray(value, "rngs", path);
  if (values.length > LIMITS.rngs) fail(`${path}.rngs exceeds max RNG count ${LIMITS.rngs}`);
  const seen = new Set(gridIds);
  return values.map((rng, index) => {
    const p = `${path}.rngs[${index}]`;
    if (!isObject(rng)) fail(`${p} must be an object`);
    const id = portableId(rng, p);
    if (seen.has(id)) fail(`${p}.id collides with another session declaration: ${id}`);
    seen.add(id);
    return { id, seed: boundedInteger(requiredMember(rng, "seed", p), -2147483648, 2147483647, `${p}.seed`) };
  });
}

function parseSessionGridWorlds(value, version, fixedPoint, path, grids, rngIds) {
  if (!has(value, "gridWorlds")) return [];
  if (version < 16) fail(`${path}.gridWorlds requires portable version 16`);
  const values = requiredArray(value, "gridWorlds", path);
  if (values.length > LIMITS.gridWorlds) fail(`${path}.gridWorlds exceeds max grid-world count ${LIMITS.gridWorlds}`);
  const gridMap = new Map(grids.map(grid => [grid.id, grid]));
  const declarationIds = new Set([...gridMap.keys(), ...rngIds]);
  return values.map((projection, index) => {
    const p = `${path}.gridWorlds[${index}]`;
    if (!isObject(projection)) fail(`${p} must be an object`);
    const id = portableId(projection, p);
    if (declarationIds.has(id)) fail(`${p}.id collides with another session declaration: ${id}`);
    declarationIds.add(id);
    const grid = requiredMember(projection, "grid", p);
    if (typeof grid !== "string" || !gridMap.has(grid)) fail(`${p}.grid references unknown session grid ${String(grid)}`);
    const palette = requiredArray(projection, "palette", p);
    if (palette.length < 1 || palette.length > LIMITS.gridPalette) fail(`${p}.palette must contain 1..${LIMITS.gridPalette} entries`);
    const seen = new Set();
    const parsedPalette = palette.map((entry, paletteIndex) => {
      const q = `${p}.palette[${paletteIndex}]`;
      if (!isObject(entry)) fail(`${q} must be an object`);
      const logical = finiteNumber(requiredMember(entry, "value", q), `${q}.value`);
      const raw = scale(logical, fixedPoint, `${q}.value`);
      if (seen.has(raw)) fail(`${q}.value duplicates another palette value: ${logical}`);
      seen.add(raw);
      return { raw, block: memberResource(entry, "block", null, q) };
    });
    return {
      id, grid,
      dimension: memberResource(projection, "dimension", "minecraft:overworld", p),
      originX: boundedInteger(requiredMember(projection, "originX", p), -30000000, 30000000, `${p}.originX`),
      y: boundedInteger(requiredMember(projection, "y", p), -2048, 2048, `${p}.y`),
      originZ: boundedInteger(requiredMember(projection, "originZ", p), -30000000, 30000000, `${p}.originZ`),
      cellsPerTick: boundedInteger(requiredMember(projection, "cellsPerTick", p), 1, LIMITS.gridCellsPerTick, `${p}.cellsPerTick`),
      palette: parsedPalette,
    };
  });
}

export function parseSessions(spec, version, fixedPoint, api, playerTeams) {
  if (!has(spec, "sessions")) return [];
  if (version < 15) fail(`${api}.sessions requires portable version 15`);
  const values = requiredArray(spec, "sessions", api);
  if (values.length > LIMITS.sessions) fail(`${api}.sessions exceeds max session count ${LIMITS.sessions}`);
  const ids = new Set(), playerSets = new Set();
  let totalGridCells = 0, totalGridWorlds = 0, totalGridWorldCells = 0;
  const sessions = values.map((value, index) => {
    const p = `${api}.sessions[${index}]`;
    if (!isObject(value)) fail(`${p} must be an object`);
    const id = portableId(value, p);
    if (ids.has(id)) fail(`${p}.id is duplicated: ${id}`);
    ids.add(id);
    const players = parsePlayerSetRef(requiredMember(value, "players", p), { version, playerTeams }, `${p}.players`);
    if (players === "all_online") fail(`${p}.players must be a team PlayerSet`);
    const playerKey = playerSetKey(players);
    if (playerSets.has(playerKey)) fail(`${p}.players is already bound to another session: ${playerKey}`);
    playerSets.add(playerKey);

    const rawState = has(value, "state") ? requiredObject(value, "state", p) : {};
    if (Object.keys(rawState).length > LIMITS.sessionStates) fail(`${p}.state exceeds max session-state count ${LIMITS.sessionStates}`);
    const initialState = {};
    for (const name of sortedKeys(rawState)) {
      validateValueName(name, `${p}.state`);
      initialState[name] = scale(finiteNumber(rawState[name], `${p}.state.${name}`), fixedPoint, `${p}.state.${name}`);
    }
    const persistentState = parseSessionPersistentState(value, version, fixedPoint, p);
    for (const name of Object.keys(persistentState)) if (Object.prototype.hasOwnProperty.call(initialState, name)) fail(`${p} state/persistentState name collision: ${name}`);
    const grids = parseSessionGrids(value, fixedPoint, p);
    const rngs = parseSessionRngs(value, p, grids.map(grid => grid.id));
    const gridWorlds = parseSessionGridWorlds(value, version, fixedPoint, p, grids, rngs.map(rng => rng.id));
    const gridMap = new Map(grids.map(grid => [grid.id, grid]));
    totalGridCells += grids.reduce((sum, grid) => sum + grid.width * grid.height, 0);
    totalGridWorlds += gridWorlds.length;
    totalGridWorldCells += gridWorlds.reduce((sum, projection) => {
      const grid = gridMap.get(projection.grid);
      return sum + grid.width * grid.height;
    }, 0);
    return { id, players, initialState, persistentState, grids, rngs, gridWorlds };
  });
  if (totalGridCells > LIMITS.sessionGridCellsTotal) {
    fail(`${api}.sessions exceed aggregate session grid cell count ${LIMITS.sessionGridCellsTotal}`);
  }
  if (totalGridWorlds > LIMITS.sessionGridWorldsTotal) {
    fail(`${api}.sessions exceed aggregate session grid-world count ${LIMITS.sessionGridWorldsTotal}`);
  }
  if (totalGridWorldCells > LIMITS.sessionGridWorldCellsTotal) {
    fail(`${api}.sessions exceed aggregate session grid-world cell count ${LIMITS.sessionGridWorldCellsTotal}`);
  }
  return sessions;
}

export function sessionContextMap(sessions) {
  return new Map(sessions.map(session => [session.id, {
    ...session,
    states: new Set(Object.keys(session.initialState)),
    persistentStates: new Set(Object.keys(session.persistentState || {})),
    grids: new Map(session.grids.map(grid => [grid.id, grid])),
    rngs: new Set(session.rngs.map(rng => rng.id)),
    gridWorlds: new Map(session.gridWorlds.map(projection => [projection.id, projection])),
  }]));
}
