export const VALUE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
export const PORTABLE_ID = /^[a-z][a-z0-9_]{0,23}$/;
export const RESOURCE_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;
export const NAMESPACE = /^[a-z0-9_.-]+$/;
export const TEAM_NAME = /^[A-Za-z0-9_.-]{1,16}$/;

export const PLAYER_INPUT_NAMES = Object.freeze([
  "hotbarSlot", "forward", "backward", "left", "right", "jump", "sneak", "sprint",
]);

export const LIMITS = Object.freeze({
  states: 128,
  inputs: 32,
  playerStates: 32,
  playerSets: 8,
  sessions: 8,
  sessionStates: 64,
  sessionGridCellsTotal: 16384,
  sessionGridWorldsTotal: 16,
  sessionGridWorldCellsTotal: 16384,
  grids: 4,
  gridDimension: 64,
  gridCells: 2048,
  rngs: 4,
  projections: 64,
  texts: 64,
  actors: 64,
  worldBatches: 32,
  gridWorlds: 4,
  gridPalette: 8,
  gridCellsPerTick: 256,
  worldWrites: 32768,
  cameras: 8,
  particles: 64,
  sounds: 64,
  huds: 1,
  playerHuds: 8,
  hudTokens: 32,
  sidebars: 1,
  sidebarRows: 15,
  ownershipChunks: 64,
  actions: 2048,
  depth: 16,
});

export const CURRENT_VERSION = 16;

export function fail(message) { throw new Error(message); }
export function has(object, member) { return Object.prototype.hasOwnProperty.call(object, member); }
export function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function requiredMember(object, member, path) {
  if (!has(object, member) || object[member] == null) fail(`${path}.${member} is required`);
  return object[member];
}
export function requiredObject(object, member, path) {
  const value = requiredMember(object, member, path);
  if (!isObject(value)) fail(`${path}.${member} must be an object`);
  return value;
}
export function requiredArray(object, member, path) {
  const value = requiredMember(object, member, path);
  if (!Array.isArray(value)) fail(`${path}.${member} must be an array`);
  return value;
}
export function requiredString(object, member, path) {
  const value = requiredMember(object, member, path);
  if (typeof value !== "string") fail(`${path}.${member} must be a string`);
  return value;
}
export function memberString(object, member, fallback, path) {
  if (!has(object, member)) return fallback;
  if (typeof object[member] !== "string") fail(`${path}.${member} must be a string`);
  return object[member];
}
export function finiteNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${path} must be finite`);
  return value;
}
export function requiredNumber(object, member, path) {
  return finiteNumber(requiredMember(object, member, path), `${path}.${member}`);
}
export function memberNumber(object, member, fallback, path) {
  return has(object, member) ? finiteNumber(object[member], `${path}.${member}`) : fallback;
}
export function memberBoolean(object, member, fallback, path) {
  if (!has(object, member)) return fallback;
  if (typeof object[member] !== "boolean") fail(`${path}.${member} must be boolean`);
  return object[member];
}
export function boundedInteger(value, min, max, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) fail(`${path} must be an integer`);
  if (value < min || value > max) fail(`${path} must be between ${min} and ${max}`);
  return value;
}
export function memberBoundedInt(object, member, fallback, min, max, path) {
  return has(object, member) ? boundedInteger(object[member], min, max, `${path}.${member}`) : fallback;
}
export function memberResource(object, member, fallback, path) {
  const value = has(object, member) ? object[member] : fallback;
  if (value == null) fail(`${path}.${member} is required`);
  if (typeof value !== "string") fail(`${path}.${member} must be a string`);
  if (!RESOURCE_ID.test(value)) fail(`${path}.${member} is not a valid resource id: ${value}`);
  return value;
}
export function portableId(object, path) {
  const id = requiredString(object, "id", path);
  if (!PORTABLE_ID.test(id)) fail(`${path}.id must match ${PORTABLE_ID.source}`);
  return id;
}
export function validateValueName(name, path) {
  if (!VALUE_NAME.test(name)) fail(`${path} name must match ${VALUE_NAME.source}: ${name}`);
}
export function scale(logical, fixedPoint, path) {
  finiteNumber(logical, path);
  const raw = logical * fixedPoint;
  if (raw < -2147483648 || raw > 2147483647) fail(`${path} exceeds signed 32-bit fixed-point range`);
  return Math.round(raw);
}
export function floorDiv(value, divisor) { return Math.floor(value / divisor); }
export function sortedKeys(object) { return Object.keys(object).sort(); }

export function javaHashCode(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  return hash;
}
export function hashHex8(value) { return (javaHashCode(value) >>> 0).toString(16).padStart(8, "0"); }
export function hashBase36(value) { return (javaHashCode(value) >>> 0).toString(36); }
export function format6(value) { return Number(value).toFixed(6); }
export function format3(value) { return Number(value).toFixed(3); }
export function numberLiteral(value) {
  if (Object.is(value, 0) || Object.is(value, -0)) return "0";
  return Number(value).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
export function floatLiteral(value) { return `${numberLiteral(value)}f`; }
export function storeScale(fixedPoint) {
  let value = (1 / fixedPoint).toFixed(12);
  value = value.replace(/0+$/, "");
  if (value.endsWith(".")) value += "0";
  return value;
}
export function snbtQuoted(value) { return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
