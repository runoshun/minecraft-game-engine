import { CURRENT_VERSION, LIMITS, fail, has, isObject, requiredArray, requiredObject, finiteNumber, boundedInteger, validateValueName, scale, sortedKeys } from "./utils.mjs";
import { parseActions } from "./parse-actions.mjs";
import { parseVanillaScene } from "./parse-vanilla-scene.mjs";
import { parseVanillaUi } from "./parse-vanilla-ui.mjs";

export function parseProgram(spec, api = "portable.define") {
  if (!isObject(spec)) fail(`${api} requires an object`);
  const version = has(spec, "version") ? boundedInteger(spec.version, 1, CURRENT_VERSION, `${api}.version`) : 1;
  const fixedPoint = has(spec, "fixedPoint") ? boundedInteger(spec.fixedPoint, 1, 1000000, `${api}.fixedPoint`) : 1000;

  const rawState = requiredObject(spec, "state", api), initialState = {};
  if (Object.keys(rawState).length === 0) fail(`${api}.state must define at least one value`);
  if (Object.keys(rawState).length > LIMITS.states) fail(`${api}.state exceeds max state count ${LIMITS.states}`);
  for (const name of sortedKeys(rawState)) {
    validateValueName(name, `${api}.state`);
    initialState[name] = scale(finiteNumber(rawState[name], `${api}.state.${name}`), fixedPoint, `${api}.state.${name}`);
  }

  const initialInputs = {};
  if (has(spec, "inputs")) {
    if (version < 2) fail(`${api}.inputs requires portable version 2`);
    const raw = requiredObject(spec, "inputs", api);
    if (Object.keys(raw).length > LIMITS.inputs) fail(`${api}.inputs exceeds max input count ${LIMITS.inputs}`);
    for (const name of sortedKeys(raw)) {
      validateValueName(name, `${api}.inputs`);
      if (has(initialState, name)) fail(`${api}.inputs name collides with state: ${name}`);
      initialInputs[name] = scale(finiteNumber(raw[name], `${api}.inputs.${name}`), fixedPoint, `${api}.inputs.${name}`);
    }
  }

  const ctx = { version, fixedPoint, states: new Set(Object.keys(initialState)), inputs: new Set(Object.keys(initialInputs)) };
  let vanilla = { inputs: {}, projections: [], texts: [], actors: [], worldBatches: [], cameras: [], particles: [], sounds: [], huds: [], sidebars: [], ownership: null };
  if (has(spec, "vanilla")) {
    if (version < 2) fail(`${api}.vanilla requires portable version 2`);
    const raw = requiredObject(spec, "vanilla", api);
    vanilla = { ...vanilla, ...parseVanillaScene(raw, ctx, api), ...parseVanillaUi(raw, ctx, api) };
  }
  const tickActions = parseActions(requiredArray(spec, "tick", api), ctx, `${api}.tick`);
  return {
    version, fixedPoint, initialState, initialInputs,
    vanillaInputs: vanilla.inputs, projections: vanilla.projections, texts: vanilla.texts,
    actors: vanilla.actors, worldBatches: vanilla.worldBatches, cameras: vanilla.cameras,
    particles: vanilla.particles, sounds: vanilla.sounds, huds: vanilla.huds,
    sidebars: vanilla.sidebars, ownership: vanilla.ownership, tickActions,
    collisionDivisor: Math.max(1, Math.floor((fixedPoint + 99) / 100)),
  };
}
