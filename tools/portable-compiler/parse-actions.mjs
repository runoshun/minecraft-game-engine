import { LIMITS, fail, has, isObject, requiredArray, requiredMember, requiredObject, requiredString, boundedInteger, scale } from "./utils.mjs";
import { parseCondition, parseValue } from "./parse-value.mjs";
import { parseAabb, parseCapsule, parseCircle, validateCircleCapsule } from "./parse-shapes.mjs";

function childContext(ctx, playerScope) { return { ...ctx, playerScope }; }

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
      if (ctx.playerScope === "multi") fail(`${p} shared state mutation is not allowed inside PlayerContext`);
      const target = requiredString(a, "target", p);
      if (!ctx.states.has(target)) fail(`${p} references unknown target state ${target}`);
      out.push(op === "negate" ? { op, target } : { op, target, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
      continue;
    }
    if (["player_set", "player_add", "player_sub", "player_negate"].includes(op)) {
      if (ctx.version < 12) fail(`${p}.op requires portable version 12`);
      if (!ctx.playerScope) fail(`${p}.op is only valid inside PlayerContext`);
      const target = requiredString(a, "target", p);
      if (!ctx.playerStates.has(target)) fail(`${p} references unknown target player state ${target}`);
      out.push(op === "player_negate" ? { op, target } : { op, target, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
      continue;
    }
    if (op === "for_each_player") {
      if (ctx.version < 12) fail(`${p}.op requires portable version 12`);
      if (ctx.playerScope) fail(`${p} nested PlayerContext is not supported`);
      const players = requiredString(a, "players", p);
      if (players !== "all_online") fail(`${p}.players must be all_online`);
      out.push({ op, players, actions: parseActions(requiredArray(a, "actions", p), childContext(ctx, "multi"), `${p}.actions`, depth + 1, counter) });
      continue;
    }
    if (op === "for_single_player") {
      if (ctx.version < 13) fail(`${p}.op requires portable version 13`);
      if (ctx.playerScope) fail(`${p} nested PlayerContext is not supported`);
      const players = requiredString(a, "players", p);
      if (players !== "all_online") fail(`${p}.players must be all_online`);
      out.push({ op, players, actions: parseActions(requiredArray(a, "actions", p), childContext(ctx, "single"), `${p}.actions`, depth + 1, counter) });
      continue;
    }
    if (["grid_fill", "grid_get", "grid_set", "grid_fill_rect"].includes(op)) {
      if (ctx.version < 13) fail(`${p}.op requires portable version 13`);
      if (ctx.playerScope === "multi") fail(`${p}.op is shared grid mutation and is not allowed inside multi-player PlayerContext`);
      const grid = requiredString(a, "grid", p);
      if (!ctx.grids.has(grid)) fail(`${p}.grid references unknown grid ${grid}`);
      if (op === "grid_fill") {
        out.push({ op, grid, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
        continue;
      }
      const x = parseValue(requiredMember(a, "x", p), ctx, `${p}.x`);
      const z = parseValue(requiredMember(a, "z", p), ctx, `${p}.z`);
      if (op === "grid_get") {
        const target = requiredString(a, "target", p);
        if (!ctx.states.has(target)) fail(`${p}.target references unknown shared state ${target}`);
        out.push({ op, grid, x, z, target });
        continue;
      }
      if (op === "grid_set") {
        out.push({ op, grid, x, z, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
        continue;
      }
      out.push({
        op, grid, x, z,
        width: parseValue(requiredMember(a, "width", p), ctx, `${p}.width`),
        height: parseValue(requiredMember(a, "height", p), ctx, `${p}.height`),
        value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`),
      });
      continue;
    }
    if (["rng_reset", "rng_int"].includes(op)) {
      if (ctx.version < 13) fail(`${p}.op requires portable version 13`);
      if (ctx.playerScope === "multi") fail(`${p}.op is shared RNG mutation and is not allowed inside multi-player PlayerContext`);
      const rng = requiredString(a, "rng", p);
      if (!ctx.rngs.has(rng)) fail(`${p}.rng references unknown random stream ${rng}`);
      if (op === "rng_reset") { out.push({ op, rng }); continue; }
      const target = requiredString(a, "target", p);
      if (!ctx.states.has(target)) fail(`${p}.target references unknown shared state ${target}`);
      const min = boundedInteger(requiredMember(a, "min", p), -2147483648, 2147483647, `${p}.min`);
      const max = boundedInteger(requiredMember(a, "max", p), -2147483648, 2147483647, `${p}.max`);
      if (min > max) fail(`${p} requires min <= max`);
      scale(min, ctx.fixedPoint, `${p}.min`); scale(max, ctx.fixedPoint, `${p}.max`);
      const range = max - min + 1;
      if (!Number.isSafeInteger(range) || range < 1 || range > 2147483647) fail(`${p} random range is too large`);
      out.push({ op, rng, target, min, max, range });
      continue;
    }
    if (op === "grid_world_rebuild") {
      if (ctx.version < 13) fail(`${p}.op requires portable version 13`);
      if (ctx.playerScope === "multi") fail(`${p}.op is shared world projection and is not allowed inside multi-player PlayerContext`);
      const target = requiredString(a, "target", p);
      if (!ctx.gridWorlds.has(target)) fail(`${p}.target references unknown grid-world projection ${target}`);
      out.push({ op, target });
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
