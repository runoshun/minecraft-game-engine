import { LIMITS, fail, has, isObject, requiredMember, requiredString, memberNumber, scale } from "./utils.mjs";

export function parseValue(value, ctx, path) {
  if (typeof value === "number") return { kind: "constant", raw: scale(value, ctx.fixedPoint, path) };
  if (!isObject(value)) fail(`${path} must be a portable scalar value`);
  if (has(value, "state")) {
    if (typeof value.state !== "string") fail(`${path}.state must be a string`);
    if (!ctx.states.has(value.state)) fail(`${path} references unknown state ${value.state}`);
    return { kind: "state", name: value.state };
  }
  if (has(value, "input")) {
    if (typeof value.input !== "string") fail(`${path}.input must be a string`);
    if (!ctx.inputs.has(value.input)) fail(`${path} references unknown input ${value.input}`);
    return { kind: "input", name: value.input };
  }
  if (has(value, "sessionState")) {
    if (ctx.version < 15) fail(`${path}.sessionState requires portable version 15`);
    if (!isObject(value.sessionState)) fail(`${path}.sessionState must be an object`);
    const session = requiredString(value.sessionState, "session", `${path}.sessionState`);
    const name = requiredString(value.sessionState, "state", `${path}.sessionState`);
    if (!ctx.sessionScope || ctx.sessionScope !== session) fail(`${path} uses session-local state outside its SessionContext`);
    const declaration = ctx.sessions?.get(session);
    if (!declaration || !declaration.states.has(name)) fail(`${path} references unknown session state ${session}.${name}`);
    return { kind: "session_state", session, name };
  }
  if (has(value, "playerState")) {
    if (!ctx.playerScope) fail(`${path} uses player-local state outside PlayerContext`);
    if (typeof value.playerState !== "string") fail(`${path}.playerState must be a string`);
    if (!ctx.playerStates.has(value.playerState)) fail(`${path} references unknown player state ${value.playerState}`);
    return { kind: "player_state", name: value.playerState };
  }
  if (has(value, "playerInput")) {
    if (!ctx.playerScope) fail(`${path} uses player-local input outside PlayerContext`);
    if (typeof value.playerInput !== "string") fail(`${path}.playerInput must be a string`);
    if (!ctx.playerInputs.has(value.playerInput)) fail(`${path} references undeclared player input ${value.playerInput}`);
    return { kind: "player_input", name: value.playerInput };
  }
  if (has(value, "gridWorldReady")) {
    if (ctx.version < 13) fail(`${path}.gridWorldReady requires portable version 13`);
    if (typeof value.gridWorldReady !== "string") fail(`${path}.gridWorldReady must be a string`);
    if (!ctx.gridWorlds.has(value.gridWorldReady)) fail(`${path} references unknown grid-world projection ${value.gridWorldReady}`);
    return { kind: "grid_world_ready", name: value.gridWorldReady };
  }
  fail(`${path} must be a number or portable scalar reference`);
}

export function parseCondition(value, ctx, path) {
  if (!isObject(value)) fail(`${path} must be an object`);
  const op = requiredString(value, "op", path);
  if (!["eq", "ne", "lt", "lte", "gt", "gte"].includes(op)) fail(`${path}.op unsupported comparison: ${op}`);
  return { op, left: parseValue(requiredMember(value, "left", path), ctx, `${path}.left`), right: parseValue(requiredMember(value, "right", path), ctx, `${path}.right`) };
}

export function parseCoordinate(value, ctx, path) {
  if (typeof value === "number") return { state: null, baseRaw: scale(value, ctx.fixedPoint, path) };
  if (!isObject(value)) fail(`${path} must be a number or { state, base? }`);
  const state = requiredString(value, "state", path);
  if (!ctx.states.has(state)) fail(`${path} references unknown state ${state}`);
  return { state, baseRaw: scale(memberNumber(value, "base", 0, path), ctx.fixedPoint, `${path}.base`) };
}

export function parseTokens(tokens, ctx, path) {
  if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > LIMITS.hudTokens) fail(`${path} must contain 1..${LIMITS.hudTokens} entries`);
  return tokens.map((token, i) => {
    const p = `${path}[${i}]`;
    if (!isObject(token)) fail(`${p} must be an object`);
    if (has(token, "text")) {
      if (typeof token.text !== "string") fail(`${p}.text must be a string`);
      if (token.text.length > 128) fail(`${p}.text exceeds 128 characters`);
      return { kind: "literal", text: token.text };
    }
    if (has(token, "value")) return { kind: "value", value: parseValue(token.value, ctx, `${p}.value`) };
    fail(`${p} requires text or value`);
  });
}
