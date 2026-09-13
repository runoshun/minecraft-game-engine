import { LIMITS, TEAM_NAME, fail, has, isObject, requiredString } from "./utils.mjs";

export function validateTeamName(value, path) {
  if (typeof value !== "string" || !TEAM_NAME.test(value)) fail(`${path} must match ${TEAM_NAME.source}`);
  return value;
}

export function parsePlayerSetDeclarations(spec, version, api) {
  const teams = new Set();
  if (!has(spec, "playerSets")) return teams;
  if (version < 14) fail(`${api}.playerSets requires portable version 14`);
  const raw = spec.playerSets;
  if (!Array.isArray(raw)) fail(`${api}.playerSets must be an array`);
  if (raw.length > LIMITS.playerSets) fail(`${api}.playerSets exceeds max player-set count ${LIMITS.playerSets}`);
  for (let i = 0; i < raw.length; i++) {
    const p = `${api}.playerSets[${i}]`, value = raw[i];
    if (!isObject(value)) fail(`${p} must be an object`);
    const team = validateTeamName(requiredString(value, "team", p), `${p}.team`);
    if (teams.has(team)) fail(`${p}.team is duplicated: ${team}`);
    teams.add(team);
  }
  return teams;
}

export function parsePlayerSetRef(value, ctx, path) {
  if (value === "all_online") return "all_online";
  if (!isObject(value)) fail(`${path} must be all_online or a team PlayerSet`);
  if (ctx.version < 14) fail(`${path} team PlayerSet requires portable version 14`);
  const team = validateTeamName(requiredString(value, "team", path), `${path}.team`);
  if (!ctx.playerTeams?.has(team)) fail(`${path} references undeclared team PlayerSet ${team}`);
  return { team };
}

export function playerSetKey(value) {
  return value === "all_online" ? "all_online" : `team:${value.team}`;
}

export function validateDisjointAudiences(values, path) {
  if (values.length <= 1) return;
  const seen = new Set();
  for (let i = 0; i < values.length; i++) {
    const audience = values[i].audience;
    if (audience === "all_online") fail(`${path}[${i}].audience all_online cannot coexist with another audience`);
    const key = playerSetKey(audience);
    if (seen.has(key)) fail(`${path}[${i}].audience duplicates ${key}`);
    seen.add(key);
  }
}
