import { CURRENT_VERSION, LIMITS, PLAYER_INPUT_NAMES, fail, has, isObject, requiredArray, requiredObject, finiteNumber, boundedInteger, validateValueName, scale, sortedKeys } from "./utils.mjs";
import { parseActions } from "./parse-actions.mjs";
import { parseVanillaScene } from "./parse-vanilla-scene.mjs";
import { parseVanillaUi } from "./parse-vanilla-ui.mjs";
import { parseGrids, parseRngs } from "./parse-runtime.mjs";
import { parsePlayerSetDeclarations } from "./player-set.mjs";

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

  const playerTeams = parsePlayerSetDeclarations(spec, version, api);

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
  const rngs = parseRngs(spec, version, api);
  if (Object.keys(initialState).length === 0 && Object.keys(initialPlayerState).length === 0 && grids.length === 0) {
    fail(`${api} must define at least one shared state, player-local state, or grid`);
  }

  const initialInputs = {};
  if (has(spec, "inputs")) {
    if (version < 2) fail(`${api}.inputs requires portable version 2`);
    if (version >= 12) fail(`${api}.inputs is v1-v11 compatibility only; use playerInputs in v12`);
    const raw = requiredObject(spec, "inputs", api);
    if (Object.keys(raw).length > LIMITS.inputs) fail(`${api}.inputs exceeds max input count ${LIMITS.inputs}`);
    for (const name of sortedKeys(raw)) {
      validateValueName(name, `${api}.inputs`);
      if (has(initialState, name)) fail(`${api}.inputs name collides with state: ${name}`);
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
    states: new Set(Object.keys(initialState)), inputs: new Set(Object.keys(initialInputs)),
    playerStates: new Set(Object.keys(initialPlayerState)), playerInputs, playerTeams,
    grids: new Map(grids.map(grid => [grid.id, grid])),
    rngs: new Set(rngs.map(rng => rng.id)),
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

  const tickActions = parseActions(requiredArray(spec, "tick", api), ctx, `${api}.tick`);
  return {
    version, fixedPoint, initialState, initialPlayerState, initialInputs, playerInputs, playerTeams, grids, rngs,
    vanillaInputs: vanilla.inputs, projections: vanilla.projections, texts: vanilla.texts,
    actors: vanilla.actors, worldBatches: vanilla.worldBatches, gridWorlds: vanilla.gridWorlds, cameras: vanilla.cameras,
    particles: vanilla.particles, sounds: vanilla.sounds, huds: vanilla.huds, playerHuds: vanilla.playerHuds,
    sidebars: vanilla.sidebars, ownership: vanilla.ownership, tickActions,
    collisionDivisor: Math.max(1, Math.floor((fixedPoint + 99) / 100)),
  };
}
