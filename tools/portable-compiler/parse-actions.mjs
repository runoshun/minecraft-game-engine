import { LIMITS, fail, has, isObject, requiredArray, requiredMember, requiredObject, requiredString } from "./utils.mjs";
import { parseCondition, parseValue } from "./parse-value.mjs";
import { parseAabb, parseCapsule, parseCircle, validateCircleCapsule } from "./parse-shapes.mjs";

export function parseActions(array, ctx, path, depth = 0, counter = { count: 0 }) {
  if (!Array.isArray(array)) fail(`${path} must be an array`);
  if (depth > LIMITS.depth) fail(`${path} exceeds max nesting depth ${LIMITS.depth}`);
  const out = [];
  for (let i = 0; i < array.length; i++) {
    counter.count++;
    if (counter.count > LIMITS.actions) fail(`${path} exceeds max action count ${LIMITS.actions}`);
    const a = array[i], p = `${path}[${i}]`;
    if (!isObject(a)) fail(`${p} must be an object`);
    const op = requiredString(a, "op", p);
    if (["set", "add", "sub", "negate"].includes(op)) {
      const target = requiredString(a, "target", p);
      if (!ctx.states.has(target)) fail(`${p} references unknown target state ${target}`);
      out.push(op === "negate" ? { op, target } : { op, target, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
      continue;
    }
    if (op === "if") {
      out.push({ op, condition: parseCondition(requiredObject(a, "condition", p), ctx, `${p}.condition`), then: parseActions(requiredArray(a, "then", p), ctx, `${p}.then`, depth + 1, counter), else: has(a, "else") ? parseActions(requiredArray(a, "else", p), ctx, `${p}.else`, depth + 1, counter) : [] });
      continue;
    }
    if (op === "if_aabb") {
      if (ctx.version < 4) fail(`${p}.op requires portable version 4`);
      out.push({ op, a: parseAabb(requiredObject(a, "a", p), ctx, `${p}.a`), b: parseAabb(requiredObject(a, "b", p), ctx, `${p}.b`), then: parseActions(requiredArray(a, "then", p), ctx, `${p}.then`, depth + 1, counter), else: has(a, "else") ? parseActions(requiredArray(a, "else", p), ctx, `${p}.else`, depth + 1, counter) : [] });
      continue;
    }
    if (op === "if_circle") {
      if (ctx.version < 5) fail(`${p}.op requires portable version 5`);
      out.push({ op, a: parseCircle(requiredObject(a, "a", p), ctx, `${p}.a`), b: parseCircle(requiredObject(a, "b", p), ctx, `${p}.b`), then: parseActions(requiredArray(a, "then", p), ctx, `${p}.then`, depth + 1, counter), else: has(a, "else") ? parseActions(requiredArray(a, "else", p), ctx, `${p}.else`, depth + 1, counter) : [] });
      continue;
    }
    if (op === "if_circle_capsule") {
      if (ctx.version < 6) fail(`${p}.op requires portable version 6`);
      const circle = parseCircle(requiredObject(a, "circle", p), ctx, `${p}.circle`), capsule = parseCapsule(requiredObject(a, "capsule", p), ctx, `${p}.capsule`);
      validateCircleCapsule(circle, capsule, ctx.fixedPoint, p);
      out.push({ op, circle, capsule, then: parseActions(requiredArray(a, "then", p), ctx, `${p}.then`, depth + 1, counter), else: has(a, "else") ? parseActions(requiredArray(a, "else", p), ctx, `${p}.else`, depth + 1, counter) : [] });
      continue;
    }
    if (op === "if_trigger") {
      if (ctx.version < 6) fail(`${p}.op requires portable version 6`);
      const point = requiredObject(a, "point", p);
      out.push({ op, trigger: parseAabb(requiredObject(a, "trigger", p), ctx, `${p}.trigger`), point: { x: parseValue(requiredMember(point, "x", `${p}.point`), ctx, `${p}.point.x`), y: parseValue(requiredMember(point, "y", `${p}.point`), ctx, `${p}.point.y`) }, then: parseActions(requiredArray(a, "then", p), ctx, `${p}.then`, depth + 1, counter), else: has(a, "else") ? parseActions(requiredArray(a, "else", p), ctx, `${p}.else`, depth + 1, counter) : [] });
      continue;
    }
    fail(`${p}.op unsupported portable operation: ${op}`);
  }
  return out;
}
