import { LIMITS, fail, has, isObject, requiredArray, requiredMember, requiredObject, requiredString, boundedInteger, scale } from "./utils.mjs";
import { parseCondition, parseValue } from "./parse-value.mjs";
import { parseAabb, parseCapsule, parseCircle, validateCircleCapsule } from "./parse-shapes.mjs";
import { parsePlayerSetRef, playerSetKey } from "./player-set.mjs";

function childContext(ctx, playerScope) { return { ...ctx, playerScope }; }
function sessionChildContext(ctx, sessionScope) { return { ...ctx, sessionScope }; }
function placeableChildContext(ctx, id, slot) { return { ...ctx, placeableScope: { id, slot } }; }
function currentSession(ctx, path) {
  const session = ctx.sessions?.get(ctx.sessionScope);
  if (!session) fail(`${path} references unknown active session ${ctx.sessionScope}`);
  return session;
}
function requireSessionPlayers(ctx, players, path) {
  if (!ctx.sessionScope) return;
  const session = currentSession(ctx, path);
  if (playerSetKey(players) !== playerSetKey(session.players)) fail(`${path} PlayerSet must match session ${ctx.sessionScope}`);
}

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
      if (ctx.sessionScope) {
        const session = currentSession(ctx, p);
        if (!session.states.has(target)) fail(`${p} references unknown target session state ${ctx.sessionScope}.${target}`);
        const parsed = op === "negate" ? { op, session: ctx.sessionScope, target } : { op, session: ctx.sessionScope, target, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) };
        out.push(parsed);
      } else {
        if (!ctx.states.has(target)) fail(`${p} references unknown target state ${target}`);
        out.push(op === "negate" ? { op, target } : { op, target, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
      }
      continue;
    }
    if (["persistent_set", "persistent_add", "persistent_sub", "persistent_negate"].includes(op)) {
      if (ctx.version < 18) fail(`${p}.op requires portable version 18`);
      if (ctx.playerScope === "multi") fail(`${p} persistent shared state mutation is not allowed inside PlayerContext`);
      const target = requiredString(a, "target", p);
      if (ctx.sessionScope) {
        const session = currentSession(ctx, p);
        if (!session.persistentStates.has(target)) fail(`${p} references unknown target session persistent state ${ctx.sessionScope}.${target}`);
        out.push(op === "persistent_negate" ? { op, session: ctx.sessionScope, target } : { op, session: ctx.sessionScope, target, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
      } else {
        if (!ctx.persistentStates?.has(target)) fail(`${p} references unknown target persistent state ${target}`);
        out.push(op === "persistent_negate" ? { op, target } : { op, target, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
      }
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
    if (op === "placeable_tick") {
      if (ctx.version < 25) fail(`${p}.op requires portable version 25`);
      if (depth !== 0 || ctx.playerScope || ctx.sessionScope || ctx.placeableScope) fail(`${p}.op must be declared directly in the root tick action list`);
      const placeable = requiredString(a, "placeable", p);
      const declaration = ctx.placeables?.get(placeable);
      if (!declaration) fail(`${p}.placeable references unknown placeable ${placeable}`);
      const slot = boundedInteger(requiredMember(a, "slot", p), 0, declaration.maxInstances - 1, `${p}.slot`);
      out.push({ op, placeable, slot, actions: parseActions(requiredArray(a, "actions", p), placeableChildContext(ctx, placeable, slot), `${p}.actions`, depth + 1, counter) });
      continue;
    }
    if (["placeable_set", "placeable_add", "placeable_sub", "placeable_negate"].includes(op)) {
      if (ctx.version < 25) fail(`${p}.op requires portable version 25`);
      if (!ctx.placeableScope) fail(`${p}.op is only valid inside PlaceableInstanceContext`);
      if (ctx.playerScope === "multi") fail(`${p} placeable state mutation is not allowed inside multi-player PlayerContext`);
      const placeable = requiredString(a, "placeable", p);
      const slot = boundedInteger(requiredMember(a, "slot", p), 0, 2147483647, `${p}.slot`);
      if (ctx.placeableScope.id !== placeable || ctx.placeableScope.slot !== slot) fail(`${p}.op targets a different placeable slot`);
      const declaration = ctx.placeables?.get(placeable);
      const target = requiredString(a, "target", p);
      if (!declaration?.states.has(target)) fail(`${p}.target references unknown placeable state ${placeable}.${target}`);
      out.push(op === "placeable_negate" ? { op, placeable, slot, target } : { op, placeable, slot, target, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
      continue;
    }
    if (op === "placeable_remove") {
      if (ctx.version < 25) fail(`${p}.op requires portable version 25`);
      if (!ctx.placeableScope) fail(`${p}.op is only valid inside PlaceableInstanceContext`);
      if (ctx.playerScope === "multi") fail(`${p}.op is not allowed inside multi-player PlayerContext`);
      const placeable = requiredString(a, "placeable", p);
      const slot = boundedInteger(requiredMember(a, "slot", p), 0, 2147483647, `${p}.slot`);
      if (ctx.placeableScope.id !== placeable || ctx.placeableScope.slot !== slot) fail(`${p}.op targets a different placeable slot`);
      out.push({ op, placeable, slot });
      continue;
    }
    if (op === "item_give") {
      if (ctx.version < 25) fail(`${p}.op requires portable version 25`);
      if (!ctx.playerScope || ctx.playerScope === "reduce") fail(`${p}.op is only valid inside mutable PlayerContext`);
      const item = requiredString(a, "item", p);
      if (!ctx.items?.has(item)) fail(`${p}.item references unknown item ${item}`);
      const count = has(a, "count") ? boundedInteger(a.count, 1, 64, `${p}.count`) : 1;
      out.push({ op, item, count });
      continue;
    }
    if (op === "interaction_use") {
      if (ctx.version < 23) fail(`${p}.op requires portable version 23`);
      const interaction = requiredString(a, "interaction", p);
      if (!ctx.interactions?.has(interaction)) fail(`${p}.interaction references unknown interaction ${interaction}`);
      const mapped = ctx.interactionPlaceables?.get(interaction) ?? null;
      const directPlaceable = depth === 1 && ctx.placeableScope && mapped && mapped.id === ctx.placeableScope.id && mapped.slot === ctx.placeableScope.slot;
      if ((depth !== 0 && !directPlaceable) || ctx.playerScope || ctx.sessionScope) fail(`${p}.op must be declared directly in the root tick action list or matching placeable tick action list`);
      if (!counter.interactionUses) counter.interactionUses = new Set();
      if (counter.interactionUses.has(interaction)) fail(`${p} duplicate use handler for interaction ${interaction}`);
      counter.interactionUses.add(interaction);
      const placeableScope = ctx.interactionPlaceables?.get(interaction) ?? null;
      const useCtx = { ...childContext(ctx, "single"), interactionUse: interaction, placeableScope };
      out.push({ op, interaction, actions: parseActions(requiredArray(a, "actions", p), useCtx, `${p}.actions`, depth + 1, counter) });
      continue;
    }
    if (op === "interaction_controller_claim") {
      if (ctx.version < 24) fail(`${p}.op requires portable version 24`);
      const interaction = requiredString(a, "interaction", p);
      if (!ctx.interactions?.has(interaction)) fail(`${p}.interaction references unknown interaction ${interaction}`);
      if (!ctx.playerScope || ctx.interactionUse !== interaction) fail(`${p}.op is only valid inside the matching interaction_use callback`);
      out.push({ op, interaction });
      continue;
    }
    if (op === "interaction_controller_return") {
      if (ctx.version < 26) fail(`${p}.op requires portable version 26`);
      const interaction = requiredString(a, "interaction", p);
      if (!ctx.interactions?.has(interaction)) fail(`${p}.interaction references unknown interaction ${interaction}`);
      if (ctx.playerScope !== "single" || ctx.interactionController !== interaction) fail(`${p}.op is only valid inside the matching interaction_controller_player callback`);
      out.push({ op, interaction });
      continue;
    }
    if (op === "interaction_controller_player") {
      if (ctx.version < 24) fail(`${p}.op requires portable version 24`);
      const interaction = requiredString(a, "interaction", p);
      if (!ctx.interactions?.has(interaction)) fail(`${p}.interaction references unknown interaction ${interaction}`);
      const mapped = ctx.interactionPlaceables?.get(interaction) ?? null;
      const directPlaceable = depth === 1 && ctx.placeableScope && mapped && mapped.id === ctx.placeableScope.id && mapped.slot === ctx.placeableScope.slot;
      if ((depth !== 0 && !directPlaceable) || ctx.playerScope || ctx.sessionScope) fail(`${p}.op must be declared directly in the root tick action list or matching placeable tick action list`);
      const placeableScope = ctx.interactionPlaceables?.get(interaction) ?? null;
      const controllerCtx = { ...childContext(ctx, "single"), interactionUse: null, interactionController: interaction, placeableScope };
      out.push({ op, interaction, actions: parseActions(requiredArray(a, "actions", p), controllerCtx, `${p}.actions`, depth + 1, counter) });
      continue;
    }
    if (op === "for_session") {
      if (ctx.version < 15) fail(`${p}.op requires portable version 15`);
      if (ctx.sessionScope) fail(`${p} nested SessionContext is not supported`);
      if (ctx.playerScope) fail(`${p} SessionContext cannot be entered from PlayerContext`);
      const session = requiredString(a, "session", p);
      if (!ctx.sessions?.has(session)) fail(`${p}.session references unknown session ${session}`);
      out.push({ op, session, actions: parseActions(requiredArray(a, "actions", p), sessionChildContext(ctx, session), `${p}.actions`, depth + 1, counter) });
      continue;
    }
    if (op === "for_each_player") {
      if (ctx.version < 12) fail(`${p}.op requires portable version 12`);
      if (ctx.playerScope) fail(`${p} nested PlayerContext is not supported`);
      const players = parsePlayerSetRef(requiredMember(a, "players", p), ctx, `${p}.players`);
      requireSessionPlayers(ctx, players, p);
      out.push({ op, players, actions: parseActions(requiredArray(a, "actions", p), childContext(ctx, "multi"), `${p}.actions`, depth + 1, counter) });
      continue;
    }
    if (op === "for_single_player") {
      if (ctx.version < 13) fail(`${p}.op requires portable version 13`);
      if (ctx.playerScope) fail(`${p} nested PlayerContext is not supported`);
      const players = parsePlayerSetRef(requiredMember(a, "players", p), ctx, `${p}.players`);
      requireSessionPlayers(ctx, players, p);
      out.push({ op, players, actions: parseActions(requiredArray(a, "actions", p), childContext(ctx, "single"), `${p}.actions`, depth + 1, counter) });
      continue;
    }
    if (op === "player_reduce") {
      if (ctx.version < 17) fail(`${p}.op requires portable version 17`);
      if (ctx.playerScope) fail(`${p}.op cannot be used inside PlayerContext`);
      counter.reductions = (counter.reductions || 0) + 1;
      if (counter.reductions > LIMITS.reductions) fail(`${path} exceeds max player reduction count ${LIMITS.reductions}`);
      const kind = requiredString(a, "kind", p);
      if (!["count", "sum", "min", "max", "any", "all"].includes(kind)) fail(`${p}.kind unsupported reduction: ${kind}`);
      const players = parsePlayerSetRef(requiredMember(a, "players", p), ctx, `${p}.players`);
      requireSessionPlayers(ctx, players, p);
      const target = requiredString(a, "target", p);
      const scoped = ctx.sessionScope ? { session: ctx.sessionScope } : {};
      if (ctx.sessionScope) {
        const session = currentSession(ctx, p);
        if (!session.states.has(target)) fail(`${p}.target references unknown session state ${ctx.sessionScope}.${target}`);
      } else if (!ctx.states.has(target)) fail(`${p}.target references unknown shared state ${target}`);
      if (kind === "count") { out.push({ op, kind, players, ...scoped, target }); continue; }
      const reductionCtx = childContext(ctx, "reduce");
      if (kind === "any" || kind === "all") {
        out.push({ op, kind, players, ...scoped, target, condition: parseCondition(requiredObject(a, "condition", p), reductionCtx, `${p}.condition`) });
        continue;
      }
      const parsed = { op, kind, players, ...scoped, target, value: parseValue(requiredMember(a, "value", p), reductionCtx, `${p}.value`) };
      if (kind === "min" || kind === "max") parsed.emptyRaw = scale(requiredMember(a, "empty", p), ctx.fixedPoint, `${p}.empty`);
      out.push(parsed);
      continue;
    }
    if (op === "selection_open" || op === "selection_clear") {
      if (ctx.version < 20) fail(`${p}.op requires portable version 20`);
      if (!ctx.playerScope || ctx.playerScope === "reduce") fail(`${p}.op is only valid in mutable PlayerContext`);
      const selection = requiredString(a, "selection", p);
      if (!ctx.selections?.has(selection)) fail(`${p}.selection references unknown selection ${selection}`);
      out.push({ op, selection });
      continue;
    }
    if (op === "form_open" || op === "form_clear") {
      if (ctx.version < 21) fail(`${p}.op requires portable version 21`);
      if (!ctx.playerScope || ctx.playerScope === "reduce") fail(`${p}.op is only valid in mutable PlayerContext`);
      const form = requiredString(a, "form", p);
      if (!ctx.forms?.has(form)) fail(`${p}.form references unknown form ${form}`);
      out.push({ op, form });
      continue;
    }
    if (["persistent_grid_fill", "persistent_grid_get", "persistent_grid_set", "persistent_grid_fill_rect"].includes(op)) {
      if (ctx.version < 19) fail(`${p}.op requires portable version 19`);
      if (ctx.playerScope === "multi") fail(`${p}.op is persistent shared grid mutation and is not allowed inside multi-player PlayerContext`);
      const grid = requiredString(a, "grid", p);
      const session = ctx.sessionScope ? currentSession(ctx, p) : null;
      const grids = session ? session.persistentGrids : ctx.persistentGrids;
      if (!grids?.has(grid)) fail(`${p}.grid references unknown ${session ? `session ${ctx.sessionScope} ` : ""}persistent grid ${grid}`);
      const scoped = ctx.sessionScope ? { session: ctx.sessionScope } : {};
      if (op === "persistent_grid_fill") {
        out.push({ op, ...scoped, grid, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
        continue;
      }
      const x = parseValue(requiredMember(a, "x", p), ctx, `${p}.x`);
      const z = parseValue(requiredMember(a, "z", p), ctx, `${p}.z`);
      if (op === "persistent_grid_get") {
        const target = requiredString(a, "target", p);
        if (session) {
          if (!session.states.has(target)) fail(`${p}.target references unknown session state ${ctx.sessionScope}.${target}`);
        } else if (!ctx.states.has(target)) fail(`${p}.target references unknown shared state ${target}`);
        out.push({ op, ...scoped, grid, x, z, target });
        continue;
      }
      if (op === "persistent_grid_set") {
        out.push({ op, ...scoped, grid, x, z, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
        continue;
      }
      out.push({
        op, ...scoped, grid, x, z,
        width: parseValue(requiredMember(a, "width", p), ctx, `${p}.width`),
        height: parseValue(requiredMember(a, "height", p), ctx, `${p}.height`),
        value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`),
      });
      continue;
    }
    if (["grid_fill", "grid_get", "grid_set", "grid_fill_rect"].includes(op)) {
      if (ctx.version < 13) fail(`${p}.op requires portable version 13`);
      if (ctx.playerScope === "multi") fail(`${p}.op is shared grid mutation and is not allowed inside multi-player PlayerContext`);
      const grid = requiredString(a, "grid", p);
      const session = ctx.sessionScope ? currentSession(ctx, p) : null;
      const grids = session ? session.grids : ctx.grids;
      if (!grids.has(grid)) fail(`${p}.grid references unknown ${session ? `session ${ctx.sessionScope} ` : ""}grid ${grid}`);
      const scoped = ctx.sessionScope ? { session: ctx.sessionScope } : {};
      if (op === "grid_fill") {
        out.push({ op, ...scoped, grid, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
        continue;
      }
      const x = parseValue(requiredMember(a, "x", p), ctx, `${p}.x`);
      const z = parseValue(requiredMember(a, "z", p), ctx, `${p}.z`);
      if (op === "grid_get") {
        const target = requiredString(a, "target", p);
        if (session) {
          if (!session.states.has(target)) fail(`${p}.target references unknown session state ${ctx.sessionScope}.${target}`);
        } else if (!ctx.states.has(target)) fail(`${p}.target references unknown shared state ${target}`);
        out.push({ op, ...scoped, grid, x, z, target });
        continue;
      }
      if (op === "grid_set") {
        out.push({ op, ...scoped, grid, x, z, value: parseValue(requiredMember(a, "value", p), ctx, `${p}.value`) });
        continue;
      }
      out.push({
        op, ...scoped, grid, x, z,
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
      const session = ctx.sessionScope ? currentSession(ctx, p) : null;
      const rngs = session ? session.rngs : ctx.rngs;
      if (!rngs.has(rng)) fail(`${p}.rng references unknown ${session ? `session ${ctx.sessionScope} ` : ""}random stream ${rng}`);
      const scoped = ctx.sessionScope ? { session: ctx.sessionScope } : {};
      if (op === "rng_reset") { out.push({ op, ...scoped, rng }); continue; }
      const target = requiredString(a, "target", p);
      if (session) {
        if (!session.states.has(target)) fail(`${p}.target references unknown session state ${ctx.sessionScope}.${target}`);
      } else if (!ctx.states.has(target)) fail(`${p}.target references unknown shared state ${target}`);
      const min = boundedInteger(requiredMember(a, "min", p), -2147483648, 2147483647, `${p}.min`);
      const max = boundedInteger(requiredMember(a, "max", p), -2147483648, 2147483647, `${p}.max`);
      if (min > max) fail(`${p} requires min <= max`);
      scale(min, ctx.fixedPoint, `${p}.min`); scale(max, ctx.fixedPoint, `${p}.max`);
      const range = max - min + 1;
      if (!Number.isSafeInteger(range) || range < 1 || range > 2147483647) fail(`${p} random range is too large`);
      out.push({ op, ...scoped, rng, target, min, max, range });
      continue;
    }
    if (op === "grid_world_rebuild") {
      if (ctx.version < 13) fail(`${p}.op requires portable version 13`);
      if (ctx.playerScope === "multi") fail(`${p}.op is shared world projection and is not allowed inside multi-player PlayerContext`);
      const target = requiredString(a, "target", p);
      if (ctx.sessionScope) {
        if (ctx.version < 16) fail(`${p}.op session-local world projection requires portable version 16`);
        const session = currentSession(ctx, p);
        if (!session.gridWorlds.has(target)) fail(`${p}.target references unknown session grid-world projection ${ctx.sessionScope}.${target}`);
        out.push({ op, session: ctx.sessionScope, target });
      } else {
        if (!ctx.gridWorlds.has(target)) fail(`${p}.target references unknown grid-world projection ${target}`);
        out.push({ op, target });
      }
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
