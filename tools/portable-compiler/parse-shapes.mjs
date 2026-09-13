import { fail, has, isObject, finiteNumber, requiredMember, requiredNumber, memberNumber, scale } from "./utils.mjs";
import { parseValue } from "./parse-value.mjs";

export function parseVec3(object, member, fallback, path, positive) {
  if (!has(object, member)) return { ...fallback };
  const value = object[member];
  let result;
  if (typeof value === "number") { const v = finiteNumber(value, `${path}.${member}`); result = { x: v, y: v, z: v }; }
  else if (isObject(value)) result = { x: memberNumber(value, "x", fallback.x, `${path}.${member}`), y: memberNumber(value, "y", fallback.y, `${path}.${member}`), z: memberNumber(value, "z", fallback.z, `${path}.${member}`) };
  else fail(`${path}.${member} must be a number or vec3`);
  if (positive && (result.x <= 0 || result.y <= 0 || result.z <= 0 || result.x > 100 || result.y > 100 || result.z > 100)) fail(`${path}.${member} components must be > 0 and <= 100`);
  if (!positive && (Math.abs(result.x) > 100 || Math.abs(result.y) > 100 || Math.abs(result.z) > 100)) fail(`${path}.${member} components must be between -100 and 100`);
  return result;
}

export function parseAabb(value, ctx, path) {
  const width = requiredNumber(value, "width", path), height = requiredNumber(value, "height", path);
  if (width <= 0 || width > 1000) fail(`${path}.width must be > 0 and <= 1000`);
  if (height <= 0 || height > 1000) fail(`${path}.height must be > 0 and <= 1000`);
  const halfWidthRaw = scale(width / 2, ctx.fixedPoint, `${path}.width`), halfHeightRaw = scale(height / 2, ctx.fixedPoint, `${path}.height`);
  if (halfWidthRaw < 1 || halfHeightRaw < 1) fail(`${path} dimensions are below fixed-point resolution`);
  return { x: parseValue(requiredMember(value, "x", path), ctx, `${path}.x`), y: parseValue(requiredMember(value, "y", path), ctx, `${path}.y`), halfWidthRaw, halfHeightRaw };
}

export function parseCircle(value, ctx, path) {
  const radius = requiredNumber(value, "radius", path);
  if (radius <= 0 || radius > 1000) fail(`${path}.radius must be > 0 and <= 1000`);
  const radiusRaw = scale(radius, ctx.fixedPoint, `${path}.radius`);
  if (radiusRaw < 1) fail(`${path}.radius is below fixed-point resolution`);
  return { x: parseValue(requiredMember(value, "x", path), ctx, `${path}.x`), y: parseValue(requiredMember(value, "y", path), ctx, `${path}.y`), radiusRaw };
}

export function parseCapsule(value, ctx, path) {
  const ax = requiredNumber(value, "ax", path), ay = requiredNumber(value, "ay", path), bx = requiredNumber(value, "bx", path), by = requiredNumber(value, "by", path), radius = requiredNumber(value, "radius", path);
  if ([ax, ay, bx, by].some(v => Math.abs(v) > 64)) fail(`${path} endpoints must stay within -64..64 logic units`);
  if (radius < 0 || radius > 16) fail(`${path}.radius must be between 0 and 16`);
  const out = { axRaw: scale(ax, ctx.fixedPoint, `${path}.ax`), ayRaw: scale(ay, ctx.fixedPoint, `${path}.ay`), bxRaw: scale(bx, ctx.fixedPoint, `${path}.bx`), byRaw: scale(by, ctx.fixedPoint, `${path}.by`), radiusRaw: scale(radius, ctx.fixedPoint, `${path}.radius`) };
  if (out.axRaw === out.bxRaw && out.ayRaw === out.byRaw) fail(`${path} endpoints must not be identical`);
  return out;
}

export function validateCircleCapsule(circle, capsule, fixedPoint, path) {
  if (circle.radiusRaw + capsule.radiusRaw > 16 * fixedPoint) fail(`${path} combined circle/capsule radius must be <= 16 logic units`);
  const d = Math.max(1, Math.floor((fixedPoint + 99) / 100));
  if (Math.trunc(capsule.axRaw / d) === Math.trunc(capsule.bxRaw / d) && Math.trunc(capsule.ayRaw / d) === Math.trunc(capsule.byRaw / d)) fail(`${path} capsule length is below collision quantization resolution`);
}
