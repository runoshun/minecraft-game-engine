import {
  LIMITS, fail, has, isObject, requiredArray, requiredMember, requiredObject,
  boundedInteger, finiteNumber, portableId, scale, sortedKeys, validateValueName,
} from "./utils.mjs";
import { parsePlayerSetRef, playerSetKey } from "./player-set.mjs";

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

export function parseSessions(spec, version, fixedPoint, api, playerTeams) {
  if (!has(spec, "sessions")) return [];
  if (version < 15) fail(`${api}.sessions requires portable version 15`);
  const values = requiredArray(spec, "sessions", api);
  if (values.length > LIMITS.sessions) fail(`${api}.sessions exceeds max session count ${LIMITS.sessions}`);
  const ids = new Set(), playerSets = new Set();
  let totalGridCells = 0;
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
    const grids = parseSessionGrids(value, fixedPoint, p);
    const rngs = parseSessionRngs(value, p, grids.map(grid => grid.id));
    totalGridCells += grids.reduce((sum, grid) => sum + grid.width * grid.height, 0);
    return { id, players, initialState, grids, rngs };
  });
  if (totalGridCells > LIMITS.sessionGridCellsTotal) {
    fail(`${api}.sessions exceed aggregate session grid cell count ${LIMITS.sessionGridCellsTotal}`);
  }
  return sessions;
}

export function sessionContextMap(sessions) {
  return new Map(sessions.map(session => [session.id, {
    ...session,
    states: new Set(Object.keys(session.initialState)),
    grids: new Map(session.grids.map(grid => [grid.id, grid])),
    rngs: new Set(session.rngs.map(rng => rng.id)),
  }]));
}
