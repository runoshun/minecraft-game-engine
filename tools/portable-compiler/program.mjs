import { CURRENT_VERSION, LIMITS, PLAYER_INPUT_NAMES, fail, has, isObject, requiredArray, requiredObject, finiteNumber, boundedInteger, validateValueName, scale, sortedKeys } from "./utils.mjs";
import { parseActions } from "./parse-actions.mjs";
import { parseVanillaScene } from "./parse-vanilla-scene.mjs";
import { parseVanillaUi } from "./parse-vanilla-ui.mjs";
import { parseGrids, parsePersistentGrids, parseRngs } from "./parse-runtime.mjs";
import { parsePlayerSetDeclarations } from "./player-set.mjs";
import { parseSessions, sessionContextMap } from "./session.mjs";
import { parseSelections } from "./parse-selection.mjs";
import { parseForms } from "./parse-form.mjs";

function parsePersistentState(spec, version, fixedPoint, api) {
  if (!has(spec, "persistentState")) return {};
  if (version < 18) fail(`${api}.persistentState requires portable version 18`);
  const raw = requiredObject(spec, "persistentState", api);
  const out = {};
  for (const name of sortedKeys(raw)) {
    validateValueName(name, `${api}.persistentState`);
    const p = `${api}.persistentState.${name}`;
    const value = raw[name];
    if (!isObject(value)) fail(`${p} must be an object`);
    const onSchemaMismatch = has(value, "onSchemaMismatch") ? value.onSchemaMismatch : "reset";
    if (onSchemaMismatch !== "reset" && onSchemaMismatch !== "preserve") fail(`${p}.onSchemaMismatch must be reset or preserve`);
    out[name] = {
      initialRaw: scale(finiteNumber(value.initial, `${p}.initial`), fixedPoint, `${p}.initial`),
      schema: boundedInteger(has(value, "schema") ? value.schema : 1, 1, 2147483647, `${p}.schema`),
      onSchemaMismatch,
    };
  }
  return out;
}

function validateSessionGridWorldFootprints(grids, sessions, globalGridWorlds, ownership, api) {
  const globalGrids = new Map(grids.map(grid => [grid.id, grid]));
  const footprints = [];
  for (const projection of globalGridWorlds) {
    const grid = globalGrids.get(projection.grid);
    footprints.push({ session: null, id: projection.id, projection, grid });
  }
  for (const session of sessions) {
    const sessionGrids = new Map(session.grids.map(grid => [grid.id, grid]));
    for (const projection of session.gridWorlds || []) {
      const grid = sessionGrids.get(projection.grid);
      if (!ownership) fail(`${api}.sessions session grid-world projection requires vanilla.ownership`);
      const maxX = projection.originX + grid.width - 1, maxZ = projection.originZ + grid.height - 1;
      if (projection.dimension !== ownership.dimension
        || projection.originX < ownership.minX || maxX > ownership.maxX
        || projection.originZ < ownership.minZ || maxZ > ownership.maxZ) {
        fail(`${api}.sessions session grid-world projection ${session.id}.${projection.id} must be inside vanilla.ownership`);
      }
      footprints.push({ session: session.id, id: projection.id, projection, grid });
    }
  }
  for (let i = 0; i < footprints.length; i++) {
    for (let j = i + 1; j < footprints.length; j++) {
      const a = footprints[i], b = footprints[j];
      if (a.session === null && b.session === null) continue;
      if (a.projection.dimension !== b.projection.dimension || a.projection.y !== b.projection.y) continue;
      const overlapX = a.projection.originX < b.projection.originX + b.grid.width && b.projection.originX < a.projection.originX + a.grid.width;
      const overlapZ = a.projection.originZ < b.projection.originZ + b.grid.height && b.projection.originZ < a.projection.originZ + a.grid.height;
      if (overlapX && overlapZ) {
        const label = value => value.session ? `session ${value.session}.${value.id}` : `global ${value.id}`;
        fail(`${api} grid-world footprints overlap at the same dimension/y: ${label(a)} and ${label(b)}`);
      }
    }
  }
}

export function parseProgram(spec, api = "portable.define") {
  if (!isObject(spec)) fail(`${api} requires an object`);
  const version = has(spec, "version") ? boundedInteger(spec.version, 1, CURRENT_VERSION, `${api}.version`) : 1;
  const fixedPoint = has(spec, "fixedPoint") ? boundedInteger(spec.fixedPoint, 1, 1000000, `${api}.fixedPoint`) : 1000;

  const rawState = requiredObject(spec, "state", api), initialState = {};
  if (Object.keys(rawState).length > LIMITS.states) fail(`${api}.state exceeds max state count ${LIMITS.states}`);
  for (const name of sortedKeys(rawState)) {
    validateValueName(name, `${api}.state`);
    initialState[name] = scale(finiteNumber(rawState[name], `${api}.state.${name}`), fixedPoint, `${api}.state.${name}`);
  }

  const persistentState = parsePersistentState(spec, version, fixedPoint, api);
  for (const name of Object.keys(persistentState)) if (Object.prototype.hasOwnProperty.call(initialState, name)) fail(`${api} state/persistentState name collision: ${name}`);
  const playerTeams = parsePlayerSetDeclarations(spec, version, api);
  const sessions = parseSessions(spec, version, fixedPoint, api, playerTeams);
  const persistentCount = Object.keys(persistentState).length + sessions.reduce((sum, session) => sum + Object.keys(session.persistentState || {}).length, 0);
  if (persistentCount > LIMITS.persistentStates) fail(`${api} exceeds max persistent-state count ${LIMITS.persistentStates}`);

  const initialPlayerState = {};
  if (has(spec, "playerState")) {
    if (version < 12) fail(`${api}.playerState requires portable version 12`);
    const raw = requiredObject(spec, "playerState", api);
    if (Object.keys(raw).length > LIMITS.playerStates) fail(`${api}.playerState exceeds max player-state count ${LIMITS.playerStates}`);
    for (const name of sortedKeys(raw)) {
      validateValueName(name, `${api}.playerState`);
      initialPlayerState[name] = scale(finiteNumber(raw[name], `${api}.playerState.${name}`), fixedPoint, `${api}.playerState.${name}`);
    }
  }
  const grids = parseGrids(spec, version, fixedPoint, api);
  const persistentGrids = parsePersistentGrids(spec, version, fixedPoint, api);
  const rngs = parseRngs(spec, version, api);
  const selections = parseSelections(spec, version, fixedPoint, api);
  const forms = parseForms(spec, version, fixedPoint, api);
  const persistentGridCount = persistentGrids.length + sessions.reduce((sum, session) => sum + (session.persistentGrids || []).length, 0);
  const persistentGridCells = persistentGrids.reduce((sum, grid) => sum + grid.width * grid.height, 0) + sessions.reduce((sum, session) => sum + (session.persistentGrids || []).reduce((inner, grid) => inner + grid.width * grid.height, 0), 0);
  if (persistentGridCount > LIMITS.persistentGrids) fail(`${api} exceeds max persistent-grid count ${LIMITS.persistentGrids}`);
  if (persistentGridCells > LIMITS.persistentGridCellsTotal) fail(`${api} exceeds aggregate persistent-grid cell count ${LIMITS.persistentGridCellsTotal}`);
  if (Object.keys(initialState).length === 0 && Object.keys(persistentState).length === 0 && Object.keys(initialPlayerState).length === 0 && grids.length === 0 && persistentGrids.length === 0 && sessions.length === 0 && selections.length === 0 && forms.length === 0) {
    fail(`${api} must define at least one shared state, player-local state, grid, session, selection, or form`);
  }

  const initialInputs = {};
  if (has(spec, "inputs")) {
    if (version < 2) fail(`${api}.inputs requires portable version 2`);
    if (version >= 12) fail(`${api}.inputs is v1-v11 compatibility only; use playerInputs in v12`);
    const raw = requiredObject(spec, "inputs", api);
    if (Object.keys(raw).length > LIMITS.inputs) fail(`${api}.inputs exceeds max input count ${LIMITS.inputs}`);
    for (const name of sortedKeys(raw)) {
      validateValueName(name, `${api}.inputs`);
      if (has(initialState, name) || has(persistentState, name)) fail(`${api}.inputs name collides with state/persistentState: ${name}`);
      initialInputs[name] = scale(finiteNumber(raw[name], `${api}.inputs.${name}`), fixedPoint, `${api}.inputs.${name}`);
    }
  }

  const playerInputs = new Set();
  if (has(spec, "playerInputs")) {
    if (version < 12) fail(`${api}.playerInputs requires portable version 12`);
    const raw = requiredArray(spec, "playerInputs", api);
    for (let i = 0; i < raw.length; i++) {
      const name = raw[i];
      if (typeof name !== "string" || !PLAYER_INPUT_NAMES.includes(name)) fail(`${api}.playerInputs[${i}] unsupported player input: ${name}`);
      playerInputs.add(name);
    }
  }

  const ctx = {
    version, fixedPoint,
    states: new Set(Object.keys(initialState)), persistentStates: new Set(Object.keys(persistentState)), inputs: new Set(Object.keys(initialInputs)),
    playerStates: new Set(Object.keys(initialPlayerState)), playerInputs, playerTeams,
    sessions: sessionContextMap(sessions), sessionScope: null,
    grids: new Map(grids.map(grid => [grid.id, grid])),
    persistentGrids: new Map(persistentGrids.map(grid => [grid.id, grid])),
    rngs: new Set(rngs.map(rng => rng.id)),
    selections: new Set(selections.map(selection => selection.id)),
    forms: new Set(forms.map(form => form.id)),
    gridWorlds: new Set(),
    playerScope: false,
  };
  let vanilla = { inputs: {}, projections: [], texts: [], actors: [], worldBatches: [], gridWorlds: [], cameras: [], particles: [], sounds: [], huds: [], playerHuds: [], sidebars: [], ownership: null };
  if (has(spec, "vanilla")) {
    if (version < 2) fail(`${api}.vanilla requires portable version 2`);
    const raw = requiredObject(spec, "vanilla", api);
    vanilla = { ...vanilla, ...parseVanillaScene(raw, ctx, api), ...parseVanillaUi(raw, ctx, api) };
  }
  if (version >= 12 && Object.keys(vanilla.inputs).length) fail(`${api}.vanilla.inputs first_player_* bindings are v1-v11 compatibility only; use player.input.* in v12`);
  if (version >= 12 && vanilla.huds.length) fail(`${api}.vanilla.huds is single-controller v1-v11 presentation; use player.hud(...) in v12`);
  ctx.gridWorlds = new Set(vanilla.gridWorlds.map(value => value.id));
  if (version >= 16) validateSessionGridWorldFootprints(grids, sessions, vanilla.gridWorlds, vanilla.ownership, api);

  const tickActions = parseActions(requiredArray(spec, "tick", api), ctx, `${api}.tick`);
  return {
    version, fixedPoint, initialState, persistentState, initialPlayerState, initialInputs, playerInputs, playerTeams, sessions, grids, persistentGrids, rngs, selections, forms,
    vanillaInputs: vanilla.inputs, projections: vanilla.projections, texts: vanilla.texts,
    actors: vanilla.actors, worldBatches: vanilla.worldBatches, gridWorlds: vanilla.gridWorlds, cameras: vanilla.cameras,
    particles: vanilla.particles, sounds: vanilla.sounds, huds: vanilla.huds, playerHuds: vanilla.playerHuds,
    sidebars: vanilla.sidebars, ownership: vanilla.ownership, tickActions,
    collisionDivisor: Math.max(1, Math.floor((fixedPoint + 99) / 100)),
  };
}
