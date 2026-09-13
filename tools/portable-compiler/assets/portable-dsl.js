(() => {
  const REF = Symbol("mcgame.portableDsl.ref");
  const CONDITION = Symbol("mcgame.portableDsl.condition");
  const COORDINATE = Symbol("mcgame.portableDsl.coordinate");
  const BOX = Symbol("mcgame.portableDsl.box");
  const CIRCLE = Symbol("mcgame.portableDsl.circle");
  const CAPSULE = Symbol("mcgame.portableDsl.capsule");
  const TRIGGER = Symbol("mcgame.portableDsl.trigger");
  const FLIPPER = Symbol("mcgame.portableDsl.flipper");
  const PLAYER_SET = Symbol("mcgame.portableDsl.playerSet");
  const PLAYER_SCOPE = Symbol("mcgame.portableDsl.playerScope");
  const SESSION_SCOPE = Symbol("mcgame.portableDsl.sessionScope");
  const GRID = Symbol("mcgame.portableDsl.grid");
  const RNG = Symbol("mcgame.portableDsl.rng");
  const GRID_WORLD = Symbol("mcgame.portableDsl.gridWorld");

  function fail(message) {
    throw new Error("portableDsl: " + message);
  }

  function finiteNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value)) fail(label + " must be a finite number");
    return value;
  }

  function finiteInteger(value, label, min, max) {
    finiteNumber(value, label);
    if (!Number.isInteger(value) || value < min || value > max) {
      fail(label + " must be an integer between " + min + " and " + max);
    }
    return value;
  }

  function normalizeVec3(value, fallback, label, allowScalar = true) {
    if (value === undefined) return { x: fallback.x, y: fallback.y, z: fallback.z };
    if (allowScalar && typeof value === "number") {
      const scalar = finiteNumber(value, label);
      return { x: scalar, y: scalar, z: scalar };
    }
    if (value == null || typeof value !== "object") fail(label + " must be a vec3" + (allowScalar ? " or number" : ""));
    return {
      x: finiteNumber(value.x === undefined ? fallback.x : value.x, label + ".x"),
      y: finiteNumber(value.y === undefined ? fallback.y : value.y, label + ".y"),
      z: finiteNumber(value.z === undefined ? fallback.z : value.z, label + ".z"),
    };
  }

  function portableDsl(options, build) {
    if (typeof options === "function") {
      build = options;
      options = {};
    }
    if (options == null) options = {};
    if (typeof options !== "object") fail("options must be an object");
    if (typeof build !== "function") fail("build callback is required");

    const fixedPoint = options.fixedPoint === undefined ? 1000 : finiteNumber(options.fixedPoint, "fixedPoint");
    let ownership = null;
    if (options.ownership !== undefined) {
      const value = options.ownership;
      if (value == null || typeof value !== "object") fail("ownership must be an object");
      const minX = finiteInteger(value.minX, "ownership.minX", -30000000, 30000000);
      const minZ = finiteInteger(value.minZ, "ownership.minZ", -30000000, 30000000);
      const maxX = finiteInteger(value.maxX, "ownership.maxX", -30000000, 30000000);
      const maxZ = finiteInteger(value.maxZ, "ownership.maxZ", -30000000, 30000000);
      if (minX > maxX || minZ > maxZ) fail("ownership requires minX <= maxX and minZ <= maxZ");
      const minChunkX = Math.floor(minX / 16), maxChunkX = Math.floor(maxX / 16);
      const minChunkZ = Math.floor(minZ / 16), maxChunkZ = Math.floor(maxZ / 16);
      if ((maxChunkX - minChunkX + 1) * (maxChunkZ - minChunkZ + 1) > 64) fail("ownership exceeds max owned chunk count 64");
      ownership = {
        dimension: value.dimension === undefined ? "minecraft:overworld" : value.dimension,
        minX, minZ, maxX, maxZ,
      };
      if (typeof ownership.dimension !== "string" || ownership.dimension.length === 0) fail("ownership.dimension must be a resource id string");
    }
    const stateValues = Object.create(null);
    const inputValues = Object.create(null);
    const playerStateValues = Object.create(null);
    const playerInputs = new Set();
    const playerTeams = new Set();
    const sessions = [];
    const sessionTeams = new Set();
    let sessionGridCellCount = 0;
    const grids = [];
    const rngs = [];
    const gridWorlds = [];
    const declarationIds = new Set();
    const vanillaInputs = Object.create(null);
    const projections = [];
    const texts = [];
    const actorProjections = [];
    const worldBatches = [];
    let worldWriteCount = 0;
    const cameras = [];
    const particles = [];
    const sounds = [];
    const huds = [];
    const playerHuds = [];
    const sidebars = [];
    let tickActions = null;
    let actionSink = null;
    let activePlayerScope = null;
    let activePlayerMode = null;
    let playerRootSink = null;
    let nextPlayerScope = 0;
    let activeSessionScope = null;
    let activeSessionId = null;
    let activeSessionPlayers = null;
    let nextSessionScope = 0;
    let usesPlayerApi = false;
    let usesV13 = false;
    let usesV14 = false;
    let usesV15 = false;

    function assertUnique(name) {
      if (Object.prototype.hasOwnProperty.call(stateValues, name) || Object.prototype.hasOwnProperty.call(inputValues, name)) {
        fail("duplicate state/input name: " + name);
      }
    }

    function isPlayerRef(value) {
      return value && (value[REF] === "player_state" || value[REF] === "player_input");
    }

    function isSessionRef(value) { return value && value[REF] === "session_state"; }

    function unwrapValue(value) {
      if (typeof value === "number") return finiteNumber(value, "value");
      if (value && value[REF] === "state") return { state: value.name };
      if (value && value[REF] === "input") return { input: value.name };
      if (value && value[REF] === "session_state") {
        if (activeSessionScope === null || value[SESSION_SCOPE] !== activeSessionScope || value.session !== activeSessionId) {
          fail("session state reference escaped its SessionContext");
        }
        return { sessionState: { session: value.session, state: value.name } };
      }
      if (value && value[REF] === "player_state") {
        if (activePlayerScope === null || value[PLAYER_SCOPE] !== activePlayerScope) fail("player state reference escaped its PlayerContext");
        return { playerState: value.name };
      }
      if (value && value[REF] === "player_input") {
        if (activePlayerScope === null || value[PLAYER_SCOPE] !== activePlayerScope) fail("player input reference escaped its PlayerContext");
        return { playerInput: value.name };
      }
      if (value && value[REF] === "grid_world_ready") return { gridWorldReady: value.name };
      fail("value must be a number or portable scalar reference");
    }

    function comparison(op, left, right) {
      const playerScope = isPlayerRef(left) || isPlayerRef(right) ? activePlayerScope : null;
      const sessionScope = isSessionRef(left) || isSessionRef(right) ? activeSessionScope : null;
      return Object.freeze({
        [CONDITION]: true,
        [PLAYER_SCOPE]: playerScope,
        [SESSION_SCOPE]: sessionScope,
        op,
        left: unwrapValue(left),
        right: unwrapValue(right),
      });
    }

    function comparable(kind, name, scope = null, sessionScope = null, sessionId = null) {
      const ref = {
        [REF]: kind,
        [PLAYER_SCOPE]: scope,
        [SESSION_SCOPE]: sessionScope,
        session: sessionId,
        name,
        eq(value) { return comparison("eq", ref, value); },
        ne(value) { return comparison("ne", ref, value); },
        lt(value) { return comparison("lt", ref, value); },
        lte(value) { return comparison("lte", ref, value); },
        gt(value) { return comparison("gt", ref, value); },
        gte(value) { return comparison("gte", ref, value); },
      };
      return ref;
    }

    function emit(action) {
      if (actionSink == null) fail("state mutations and when(...) are only valid inside tick(...)");
      actionSink.push(action);
    }

    function makeState(name, initial) {
      if (activeSessionScope !== null) fail("game.state(...) is global; use session.state(...) inside SessionContext");
      assertUnique(name);
      stateValues[name] = finiteNumber(initial, "state " + name + " initial value");
      const ref = comparable("state", name);
      const assertSharedWrite = () => {
        if (activeSessionScope !== null) fail("global shared state mutation is not allowed inside SessionContext");
        if (activePlayerMode === "multi") fail("shared state mutation is not allowed inside PlayerContext");
      };
      ref.set = value => { assertSharedWrite(); emit({ op: "set", target: name, value: unwrapValue(value) }); };
      ref.add = value => { assertSharedWrite(); emit({ op: "add", target: name, value: unwrapValue(value) }); };
      ref.sub = value => { assertSharedWrite(); emit({ op: "sub", target: name, value: unwrapValue(value) }); };
      ref.negate = () => { assertSharedWrite(); emit({ op: "negate", target: name }); };
      return Object.freeze(ref);
    }

    function makeInput(name, initial, binding) {
      if (activeSessionScope !== null) fail("game.input(...) is global and not available inside SessionContext");
      assertUnique(name);
      inputValues[name] = finiteNumber(initial, "input " + name + " initial value");
      if (binding !== undefined) {
        if (binding == null || typeof binding !== "object" || typeof binding.source !== "string") {
          fail("input " + name + " binding must be { source: string }");
        }
        vanillaInputs[name] = { source: binding.source };
      }
      return Object.freeze(comparable("input", name));
    }

    function captureActions(callback, label) {
      if (typeof callback !== "function") fail(label + " callback is required");
      const previous = actionSink;
      const captured = [];
      actionSink = captured;
      try {
        callback();
      } finally {
        actionSink = previous;
      }
      return captured;
    }

    function serializedCondition(condition, label = "condition") {
      if (!condition || condition[CONDITION] !== true) fail(label + " must be created by eq/ne/lt/lte/gt/gte");
      if (condition[PLAYER_SCOPE] !== null && condition[PLAYER_SCOPE] !== activePlayerScope) fail(label + " escaped its PlayerContext");
      if (condition[SESSION_SCOPE] !== null && condition[SESSION_SCOPE] !== activeSessionScope) fail(label + " escaped its SessionContext");
      return { op: condition.op, left: condition.left, right: condition.right };
    }

    function when(condition, thenCallback, elseCallback) {
      const action = {
        op: "if",
        condition: serializedCondition(condition, "when condition"),
        then: captureActions(thenCallback, "when then"),
      };
      if (elseCallback !== undefined) action.else = captureActions(elseCallback, "when else");
      emit(action);
    }

    function tick(callback) {
      if (tickActions !== null) fail("tick(...) may only be declared once");
      if (actionSink !== null) fail("tick(...) cannot be nested");
      tickActions = captureActions(callback, "tick");
    }

    function players() {
      usesPlayerApi = true;
      return Object.freeze({ [PLAYER_SET]: "all_online" });
    }

    function teamPlayers(team) {
      if (typeof team !== "string" || !/^[A-Za-z0-9_.-]{1,16}$/.test(team)) fail("teamPlayers(...) team must match [A-Za-z0-9_.-]{1,16}");
      if (!playerTeams.has(team) && playerTeams.size >= 8) fail("portable v14 supports at most 8 team PlayerSets");
      playerTeams.add(team);
      usesPlayerApi = true;
      usesV14 = true;
      return Object.freeze({ [PLAYER_SET]: Object.freeze({ team }) });
    }

    function requirePlayerSet(value, label) {
      if (!value) fail(label + " must be returned by players() or teamPlayers()");
      const set = value[PLAYER_SET];
      if (set === "all_online") return "all_online";
      if (set && typeof set === "object" && typeof set.team === "string" && playerTeams.has(set.team)) return { team: set.team };
      fail(label + " must be returned by players() or teamPlayers()");
    }

    function playerSetKey(set) { return set === "all_online" ? "all_online" : "team:" + set.team; }

    function validateDisjointPlayerAudiences(values, label) {
      if (values.length <= 1) return;
      const seen = new Set();
      for (const value of values) {
        if (value.audience === "all_online") fail(label + " all_online audience cannot coexist with another audience");
        const key = playerSetKey(value.audience);
        if (seen.has(key)) fail(label + " duplicate audience " + key);
        seen.add(key);
      }
    }

    function makePlayerState(name, initial, scope) {
      if (typeof name !== "string" || name.length === 0) fail("player state name must be a non-empty string");
      const value = finiteNumber(initial, "player state " + name + " initial value");
      if (Object.prototype.hasOwnProperty.call(playerStateValues, name) && playerStateValues[name] !== value) {
        fail("player state " + name + " was declared with a different initial value");
      }
      playerStateValues[name] = value;
      const ref = comparable("player_state", name, scope);
      ref.set = next => emit({ op: "player_set", target: name, value: unwrapValue(next) });
      ref.add = next => emit({ op: "player_add", target: name, value: unwrapValue(next) });
      ref.sub = next => emit({ op: "player_sub", target: name, value: unwrapValue(next) });
      ref.negate = () => emit({ op: "player_negate", target: name });
      return Object.freeze(ref);
    }

    function playerInputRef(name, scope) {
      playerInputs.add(name);
      return Object.freeze(comparable("player_input", name, scope));
    }

    function playerHud(scope, set, id, spec) {
      if (activePlayerScope !== scope) fail("player.hud(...) is only valid in its PlayerContext");
      if (actionSink !== playerRootSink) fail("player.hud(...) must be declared directly in a player iteration scope, not inside a conditional branch");
      if (playerHuds.length >= 8) fail("portable v14 supports at most 8 player.hud(...) declarations");
      if (typeof id !== "string" || id.length === 0) fail("player hud id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("player hud " + id + " spec must be an object");
      const source = typeof spec.text === "string" ? [spec.text] : spec.text;
      if (!Array.isArray(source) || source.length < 1 || source.length > 32) fail("player hud " + id + " text must be a string or an array with 1..32 tokens");
      const tokens = source.map((token, index) => {
        if (typeof token === "string") {
          if (token.length > 128) fail("player hud " + id + " token " + index + " exceeds 128 characters");
          return { text: token };
        }
        return { value: unwrapValue(token) };
      });
      const hud = { id, audience: set, tokens };
      if (activeSessionId !== null) hud.session = activeSessionId;
      playerHuds.push(hud);
    }

    function capturePlayerContext(set, callback, mode, op, label) {
      if (actionSink === null) fail(label + "(...) is only valid inside tick(...)");
      if (activePlayerScope !== null) fail("nested PlayerContext is not supported");
      const serializedSet = requirePlayerSet(set, label + " player set");
      if (activeSessionScope !== null && playerSetKey(serializedSet) !== playerSetKey(activeSessionPlayers)) {
        fail(label + " PlayerSet must match the active session");
      }
      if (typeof callback !== "function") fail(label + " callback is required");
      usesPlayerApi = true;
      if (mode === "single") usesV13 = true;
      const scope = ++nextPlayerScope;
      const input = {};
      for (const name of ["hotbarSlot", "forward", "backward", "left", "right", "jump", "sneak", "sprint"]) {
        Object.defineProperty(input, name, { enumerable: true, get() { return playerInputRef(name, scope); } });
      }
      const player = Object.freeze({
        state(name, initial) {
          if (activePlayerScope !== scope) fail("player.state(...) is only valid in its PlayerContext");
          return makePlayerState(name, initial, scope);
        },
        input: Object.freeze(input),
        hud(id, spec) { return playerHud(scope, serializedSet, id, spec); },
      });
      const previousSink = actionSink, previousScope = activePlayerScope, previousMode = activePlayerMode, previousRoot = playerRootSink;
      const captured = [];
      actionSink = captured; activePlayerScope = scope; activePlayerMode = mode; playerRootSink = captured;
      try { callback(player); } finally {
        actionSink = previousSink; activePlayerScope = previousScope; activePlayerMode = previousMode; playerRootSink = previousRoot;
      }
      emit({ op, players: serializedSet, actions: captured });
    }

    function forEachPlayer(set, callback) {
      capturePlayerContext(set, callback, "multi", "for_each_player", "forEachPlayer");
    }

    function forSinglePlayer(set, callback) {
      capturePlayerContext(set, callback, "single", "for_single_player", "forSinglePlayer");
    }

    function sessionBlock(id, set, callback) {
      if (actionSink === null) fail("session(...) is only valid inside tick(...)");
      if (activeSessionScope !== null) fail("nested SessionContext is not supported");
      if (activePlayerScope !== null) fail("session(...) cannot be entered from PlayerContext");
      if (typeof id !== "string" || !/^[a-z][a-z0-9_]{0,23}$/.test(id)) fail("session id must match [a-z][a-z0-9_]{0,23}");
      if (sessions.some(value => value.id === id)) fail("duplicate session id: " + id);
      if (sessions.length >= 8) fail("portable v15 supports at most 8 sessions");
      const serializedSet = requirePlayerSet(set, "session player set");
      if (serializedSet === "all_online") fail("session(...) requires a team PlayerSet");
      const setKey = playerSetKey(serializedSet);
      if (sessionTeams.has(setKey)) fail("session player set is already bound to another session: " + setKey);
      if (typeof callback !== "function") fail("session(...) callback is required");

      usesV15 = true;
      usesV14 = true;
      usesPlayerApi = true;
      sessionTeams.add(setKey);
      const scope = ++nextSessionScope;
      const declarationIds = new Set();
      const declaration = { id, players: serializedSet, state: Object.create(null), grids: [], rngs: [] };
      sessions.push(declaration);

      function assertSessionActive(label) {
        if (activeSessionScope !== scope || activeSessionId !== id) fail(label + " escaped its SessionContext");
      }
      function assertSessionSharedMutation(label) {
        assertSessionActive(label);
        if (activePlayerMode === "multi") fail(label + " is session-shared mutation and cannot run inside multi-player PlayerContext");
      }
      function localId(value, label) {
        if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,23}$/.test(value)) fail(label + " id must match [a-z][a-z0-9_]{0,23}");
        if (declarationIds.has(value)) fail("duplicate session declaration id: " + value);
        declarationIds.add(value);
      }
      function sessionState(name, initial) {
        assertSessionActive("session.state(...)");
        if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name)) fail("session state name must match [A-Za-z][A-Za-z0-9_]{0,31}");
        const value = finiteNumber(initial, "session state " + name + " initial value");
        if (!Object.prototype.hasOwnProperty.call(declaration.state, name) && Object.keys(declaration.state).length >= 64) fail("portable v15 supports at most 64 states per session");
        if (Object.prototype.hasOwnProperty.call(declaration.state, name) && declaration.state[name] !== value) fail("session state " + name + " was declared with a different initial value");
        declaration.state[name] = value;
        const ref = comparable("session_state", name, null, scope, id);
        ref.set = next => { assertSessionSharedMutation("session state set"); emit({ op: "set", target: name, value: unwrapValue(next) }); };
        ref.add = next => { assertSessionSharedMutation("session state add"); emit({ op: "add", target: name, value: unwrapValue(next) }); };
        ref.sub = next => { assertSessionSharedMutation("session state sub"); emit({ op: "sub", target: name, value: unwrapValue(next) }); };
        ref.negate = () => { assertSessionSharedMutation("session state negate"); emit({ op: "negate", target: name }); };
        return Object.freeze(ref);
      }
      function sessionGrid(gridId, spec) {
        assertSessionActive("session.grid(...)");
        localId(gridId, "session grid");
        if (declaration.grids.length >= 4) fail("portable v15 supports at most 4 grids per session");
        if (spec == null || typeof spec !== "object") fail("session grid " + gridId + " spec must be an object");
        const width = finiteInteger(spec.width, "session grid " + gridId + " width", 1, 64);
        const height = finiteInteger(spec.height, "session grid " + gridId + " height", 1, 64);
        if (width * height > 2048) fail("session grid " + gridId + " exceeds 2048 cells");
        if (sessionGridCellCount + width * height > 16384) fail("portable v15 session grids exceed aggregate 16384 cells");
        sessionGridCellCount += width * height;
        const initial = finiteNumber(spec.initial === undefined ? 0 : spec.initial, "session grid " + gridId + " initial");
        const outside = finiteNumber(spec.outside === undefined ? initial : spec.outside, "session grid " + gridId + " outside");
        declaration.grids.push({ id: gridId, width, height, initial, outside });
        const ref = {
          [GRID]: true, id: gridId, width, height, [SESSION_SCOPE]: scope, session: id,
          fill(value) { assertSessionSharedMutation("session grid.fill(...)"); emit({ op: "grid_fill", grid: gridId, value: unwrapValue(value) }); },
          get(x, z, target) {
            assertSessionSharedMutation("session grid.get(...)");
            if (!target || target[REF] !== "session_state" || target[SESSION_SCOPE] !== scope) fail("session grid.get(...) target must be a state from the same session");
            emit({ op: "grid_get", grid: gridId, x: unwrapValue(x), z: unwrapValue(z), target: target.name });
          },
          set(x, z, value) { assertSessionSharedMutation("session grid.set(...)"); emit({ op: "grid_set", grid: gridId, x: unwrapValue(x), z: unwrapValue(z), value: unwrapValue(value) }); },
          fillRect(rect) {
            assertSessionSharedMutation("session grid.fillRect(...)");
            if (rect == null || typeof rect !== "object") fail("session grid.fillRect(...) requires an object");
            emit({ op: "grid_fill_rect", grid: gridId, x: unwrapValue(rect.x), z: unwrapValue(rect.z), width: unwrapValue(rect.width), height: unwrapValue(rect.height), value: unwrapValue(rect.value) });
          },
        };
        return Object.freeze(ref);
      }
      function sessionRng(rngId, spec) {
        assertSessionActive("session.rng(...)");
        localId(rngId, "session rng");
        if (declaration.rngs.length >= 4) fail("portable v15 supports at most 4 random streams per session");
        if (spec == null || typeof spec !== "object") fail("session rng " + rngId + " spec must be an object");
        const seed = finiteInteger(spec.seed, "session rng " + rngId + " seed", -2147483648, 2147483647);
        declaration.rngs.push({ id: rngId, seed });
        return Object.freeze({
          [RNG]: true, id: rngId, [SESSION_SCOPE]: scope, session: id,
          reset() { assertSessionSharedMutation("session rng.reset(...)"); emit({ op: "rng_reset", rng: rngId }); },
          int(target, min, max) {
            assertSessionSharedMutation("session rng.int(...)");
            if (!target || target[REF] !== "session_state" || target[SESSION_SCOPE] !== scope) fail("session rng.int(...) target must be a state from the same session");
            finiteInteger(min, "session rng.int min", -2147483648, 2147483647);
            finiteInteger(max, "session rng.int max", -2147483648, 2147483647);
            if (min > max) fail("session rng.int(...) requires min <= max");
            emit({ op: "rng_int", rng: rngId, target: target.name, min, max });
          },
        });
      }

      const sessionContext = Object.freeze({
        id,
        players: set,
        state: sessionState,
        grid: sessionGrid,
        rng: sessionRng,
        forEachPlayer(playerCallback) { assertSessionActive("session.forEachPlayer(...)"); capturePlayerContext(set, playerCallback, "multi", "for_each_player", "session.forEachPlayer"); },
        forSinglePlayer(playerCallback) { assertSessionActive("session.forSinglePlayer(...)"); capturePlayerContext(set, playerCallback, "single", "for_single_player", "session.forSinglePlayer"); },
      });

      const previousSink = actionSink, previousScope = activeSessionScope, previousId = activeSessionId, previousPlayers = activeSessionPlayers;
      const captured = [];
      actionSink = captured; activeSessionScope = scope; activeSessionId = id; activeSessionPlayers = serializedSet;
      try { callback(sessionContext); } finally {
        actionSink = previousSink; activeSessionScope = previousScope; activeSessionId = previousId; activeSessionPlayers = previousPlayers;
      }
      emit({ op: "for_session", session: id, actions: captured });
    }

    function repeat(count, callback) {
      const total = finiteInteger(count, "repeat count", 0, 256);
      if (typeof callback !== "function") fail("repeat callback is required");
      const out = [];
      for (let i = 0; i < total; i++) out.push(callback(i));
      return Object.freeze(out);
    }

    function at(state, base = 0) {
      if (!state || state[REF] !== "state") fail("at(...) requires a state reference");
      return Object.freeze({
        [COORDINATE]: true,
        state: state.name,
        base: finiteNumber(base, "coordinate base"),
      });
    }

    function normalizeCoordinate(value, label) {
      if (typeof value === "number") return finiteNumber(value, label);
      if (value && value[REF] === "state") return { state: value.name };
      if (value && value[COORDINATE] === true) return { state: value.state, base: value.base };
      fail(label + " must be a number, state, or at(state, base)");
    }

    function normalizeBoxValue(value, label) {
      if (typeof value === "number") return finiteNumber(value, label);
      if (value && (value[REF] === "state" || value[REF] === "input" || value[REF] === "session_state" || value[REF] === "player_state" || value[REF] === "player_input")) return unwrapValue(value);
      fail(label + " must be a number or portable state/input reference");
    }

    function valuePlayerScope(value) { return isPlayerRef(value) ? value[PLAYER_SCOPE] : null; }
    function valueSessionScope(value) { return isSessionRef(value) ? value[SESSION_SCOPE] : null; }
    function requireShapeScope(value, label) {
      if (value && value[PLAYER_SCOPE] !== null && value[PLAYER_SCOPE] !== activePlayerScope) fail(label + " escaped its PlayerContext");
      if (value && value[SESSION_SCOPE] !== null && value[SESSION_SCOPE] !== activeSessionScope) fail(label + " escaped its SessionContext");
    }

    function box(id, spec) {
      if (typeof id !== "string" || id.length === 0) fail("box id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("box " + id + " spec must be an object");
      const width = finiteNumber(spec.width, "box " + id + " width");
      const height = finiteNumber(spec.height, "box " + id + " height");
      if (width <= 0 || width > 1000) fail("box " + id + " width must be > 0 and <= 1000");
      if (height <= 0 || height > 1000) fail("box " + id + " height must be > 0 and <= 1000");
      const scope = valuePlayerScope(spec.x) || valuePlayerScope(spec.y);
      const sessionScope = valueSessionScope(spec.x) || valueSessionScope(spec.y);
      return Object.freeze({
        [BOX]: true,
        [PLAYER_SCOPE]: scope,
        [SESSION_SCOPE]: sessionScope,
        id,
        x: normalizeBoxValue(spec.x, "box " + id + " x"),
        y: normalizeBoxValue(spec.y, "box " + id + " y"),
        width,
        height,
      });
    }

    function circle(id, spec) {
      if (typeof id !== "string" || id.length === 0) fail("circle id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("circle " + id + " spec must be an object");
      const radius = finiteNumber(spec.radius, "circle " + id + " radius");
      if (radius <= 0 || radius > 1000) fail("circle " + id + " radius must be > 0 and <= 1000");
      const scope = valuePlayerScope(spec.x) || valuePlayerScope(spec.y);
      const sessionScope = valueSessionScope(spec.x) || valueSessionScope(spec.y);
      return Object.freeze({
        [CIRCLE]: true,
        [PLAYER_SCOPE]: scope,
        [SESSION_SCOPE]: sessionScope,
        id,
        x: normalizeBoxValue(spec.x, "circle " + id + " x"),
        y: normalizeBoxValue(spec.y, "circle " + id + " y"),
        radius,
      });
    }

    function serializeBox(value, label) {
      if (!value || value[BOX] !== true) fail(label + " must be created by box(...)");
      requireShapeScope(value, label);
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    }

    function serializeCircle(value, label) {
      if (!value || value[CIRCLE] !== true) fail(label + " must be created by circle(...)");
      requireShapeScope(value, label);
      return { x: value.x, y: value.y, radius: value.radius };
    }

    function staticLogicNumber(value, label) {
      const number = finiteNumber(value, label);
      if (number < -64 || number > 64) fail(label + " must be between -64 and 64");
      return number;
    }

    function makeCapsule(id, spec, allowZeroRadius, kind) {
      if (typeof id !== "string" || id.length === 0) fail(kind + " id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail(kind + " " + id + " spec must be an object");
      const ax = staticLogicNumber(spec.ax, kind + " " + id + " ax");
      const ay = staticLogicNumber(spec.ay, kind + " " + id + " ay");
      const bx = staticLogicNumber(spec.bx, kind + " " + id + " bx");
      const by = staticLogicNumber(spec.by, kind + " " + id + " by");
      const radius = finiteNumber(spec.radius === undefined ? 0 : spec.radius, kind + " " + id + " radius");
      if (allowZeroRadius ? (radius < 0 || radius > 16) : (radius <= 0 || radius > 16)) {
        fail(kind + " " + id + " radius must be " + (allowZeroRadius ? "between 0 and 16" : "> 0 and <= 16"));
      }
      if (ax === bx && ay === by) fail(kind + " " + id + " endpoints must not be identical");
      return Object.freeze({ [CAPSULE]: true, id, ax, ay, bx, by, radius });
    }

    function segment(id, spec) {
      return makeCapsule(id, { ...spec, radius: 0 }, true, "segment");
    }

    function capsule(id, spec) {
      return makeCapsule(id, spec, false, "capsule");
    }

    function serializeCapsule(value, label) {
      if (!value || value[CAPSULE] !== true) fail(label + " must be created by segment(...), capsule(...), or flipper(...)");
      return { ax: value.ax, ay: value.ay, bx: value.bx, by: value.by, radius: value.radius };
    }

    function trigger(id, spec) {
      const zone = box(id, spec);
      return Object.freeze({ [TRIGGER]: true, id, zone });
    }

    function flipper(id, spec) {
      if (typeof id !== "string" || id.length === 0) fail("flipper id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("flipper " + id + " spec must be an object");
      const pivotX = staticLogicNumber(spec.pivotX, "flipper " + id + " pivotX");
      const pivotY = staticLogicNumber(spec.pivotY, "flipper " + id + " pivotY");
      const length = finiteNumber(spec.length, "flipper " + id + " length");
      const radius = finiteNumber(spec.radius, "flipper " + id + " radius");
      const restAngle = finiteNumber(spec.restAngle, "flipper " + id + " restAngle");
      const activeAngle = finiteNumber(spec.activeAngle, "flipper " + id + " activeAngle");
      if (length <= 0 || length > 16) fail("flipper " + id + " length must be > 0 and <= 16");
      if (radius <= 0 || radius > 4) fail("flipper " + id + " radius must be > 0 and <= 4");
      const activeWhen = serializedCondition(spec.activeWhen, "flipper " + id + " activeWhen");
      function pose(suffix, degrees) {
        const radians = degrees * Math.PI / 180;
        return makeCapsule(id + "_" + suffix, {
          ax: pivotX, ay: pivotY,
          bx: pivotX + Math.cos(radians) * length,
          by: pivotY + Math.sin(radians) * length,
          radius,
        }, false, "flipper");
      }
      return Object.freeze({
        [FLIPPER]: true, id,
        rest: pose("rest", restAngle),
        active: pose("active", activeAngle),
        activeWhen,
      });
    }

    function circleCapsuleAction(circleValue, capsuleValue, thenActions, elseActions) {
      const action = {
        op: "if_circle_capsule",
        circle: serializeCircle(circleValue, "circle/capsule circle"),
        capsule: serializeCapsule(capsuleValue, "circle/capsule capsule"),
        then: thenActions,
      };
      if (elseActions !== undefined) action.else = elseActions;
      return action;
    }

    function whenColliding(a, b, thenCallback, elseCallback) {
      const thenActions = captureActions(thenCallback, "whenColliding then");
      const elseActions = elseCallback === undefined ? undefined : captureActions(elseCallback, "whenColliding else");
      let action;
      if (a && b && a[BOX] === true && b[BOX] === true) {
        action = { op: "if_aabb", a: serializeBox(a, "whenColliding first box"), b: serializeBox(b, "whenColliding second box"), then: thenActions };
        if (elseActions !== undefined) action.else = elseActions;
      } else if (a && b && a[CIRCLE] === true && b[CIRCLE] === true) {
        action = { op: "if_circle", a: serializeCircle(a, "whenColliding first circle"), b: serializeCircle(b, "whenColliding second circle"), then: thenActions };
        if (elseActions !== undefined) action.else = elseActions;
      } else if (a && b && a[CIRCLE] === true && b[CAPSULE] === true) {
        action = circleCapsuleAction(a, b, thenActions, elseActions);
      } else if (a && b && a[CAPSULE] === true && b[CIRCLE] === true) {
        action = circleCapsuleAction(b, a, thenActions, elseActions);
      } else if (a && b && a[CIRCLE] === true && b[FLIPPER] === true) {
        action = {
          op: "if", condition: b.activeWhen,
          then: [circleCapsuleAction(a, b.active, thenActions, elseActions)],
          else: [circleCapsuleAction(a, b.rest, thenActions, elseActions)],
        };
      } else if (a && b && a[FLIPPER] === true && b[CIRCLE] === true) {
        action = {
          op: "if", condition: a.activeWhen,
          then: [circleCapsuleAction(b, a.active, thenActions, elseActions)],
          else: [circleCapsuleAction(b, a.rest, thenActions, elseActions)],
        };
      } else {
        fail("whenColliding requires box/box, circle/circle, circle/segment, circle/capsule, or circle/flipper shapes");
      }
      emit(action);
    }

    function whenTriggered(triggerValue, watched, thenCallback, elseCallback) {
      if (!triggerValue || triggerValue[TRIGGER] !== true) fail("whenTriggered first argument must be created by trigger(...)");
      if (!watched || (watched[CIRCLE] !== true && watched[BOX] !== true)) {
        fail("whenTriggered currently watches the center of a circle(...) or box(...)");
      }
      const watchedShape = watched[CIRCLE] === true ? serializeCircle(watched, "whenTriggered watched") : serializeBox(watched, "whenTriggered watched");
      const action = {
        op: "if_trigger",
        trigger: serializeBox(triggerValue.zone, "whenTriggered trigger"),
        point: { x: watchedShape.x, y: watchedShape.y },
        then: captureActions(thenCallback, "whenTriggered then"),
      };
      if (elseCallback !== undefined) action.else = captureActions(elseCallback, "whenTriggered else");
      emit(action);
    }

    function assertSharedPresentation(label) {
      if (activePlayerScope !== null) fail(label + " is shared presentation and cannot be declared inside PlayerContext");
      if (activeSessionScope !== null) fail(label + " is global presentation and cannot be declared inside SessionContext");
    }

    function assertV13Id(id, label) {
      if (typeof id !== "string" || !/^[a-z][a-z0-9_]{0,23}$/.test(id)) fail(label + " id must match [a-z][a-z0-9_]{0,23}");
      if (declarationIds.has(id)) fail("duplicate v13 declaration id: " + id);
      declarationIds.add(id);
    }

    function assertV13SharedMutation(label) {
      if (activeSessionScope !== null) fail(label + " is global shared mutation and cannot run inside SessionContext");
      if (activePlayerMode === "multi") fail(label + " is shared mutation and cannot run inside multi-player PlayerContext");
      usesV13 = true;
    }

    function gridDeclaration(id, spec) {
      if (activeSessionScope !== null) fail("game.grid(...) is global; use session.grid(...) inside SessionContext");
      assertV13Id(id, "grid");
      if (grids.length >= 4) fail("portable v13 supports at most 4 grids");
      if (spec == null || typeof spec !== "object") fail("grid " + id + " spec must be an object");
      const width = finiteInteger(spec.width, "grid " + id + " width", 1, 64);
      const height = finiteInteger(spec.height, "grid " + id + " height", 1, 64);
      if (width * height > 2048) fail("grid " + id + " exceeds 2048 cells");
      const initial = finiteNumber(spec.initial === undefined ? 0 : spec.initial, "grid " + id + " initial");
      const outside = finiteNumber(spec.outside === undefined ? initial : spec.outside, "grid " + id + " outside");
      usesV13 = true;
      grids.push({ id, width, height, initial, outside });
      const ref = {
        [GRID]: true, id, width, height,
        fill(value) { assertV13SharedMutation("grid.fill(...)"); emit({ op: "grid_fill", grid: id, value: unwrapValue(value) }); },
        get(x, z, target) {
          assertV13SharedMutation("grid.get(...)");
          if (!target || target[REF] !== "state") fail("grid.get(...) target must be a shared state reference");
          emit({ op: "grid_get", grid: id, x: unwrapValue(x), z: unwrapValue(z), target: target.name });
        },
        set(x, z, value) { assertV13SharedMutation("grid.set(...)"); emit({ op: "grid_set", grid: id, x: unwrapValue(x), z: unwrapValue(z), value: unwrapValue(value) }); },
        fillRect(rect) {
          assertV13SharedMutation("grid.fillRect(...)");
          if (rect == null || typeof rect !== "object") fail("grid.fillRect(...) requires an object");
          emit({ op: "grid_fill_rect", grid: id, x: unwrapValue(rect.x), z: unwrapValue(rect.z), width: unwrapValue(rect.width), height: unwrapValue(rect.height), value: unwrapValue(rect.value) });
        },
      };
      return Object.freeze(ref);
    }

    function rngDeclaration(id, spec) {
      if (activeSessionScope !== null) fail("game.rng(...) is global; use session.rng(...) inside SessionContext");
      assertV13Id(id, "rng");
      if (rngs.length >= 4) fail("portable v13 supports at most 4 random streams");
      if (spec == null || typeof spec !== "object") fail("rng " + id + " spec must be an object");
      const seed = finiteInteger(spec.seed, "rng " + id + " seed", -2147483648, 2147483647);
      usesV13 = true;
      rngs.push({ id, seed });
      return Object.freeze({
        [RNG]: true, id,
        reset() { assertV13SharedMutation("rng.reset(...)"); emit({ op: "rng_reset", rng: id }); },
        int(target, min, max) {
          assertV13SharedMutation("rng.int(...)");
          if (!target || target[REF] !== "state") fail("rng.int(...) target must be a shared state reference");
          finiteInteger(min, "rng.int min", -2147483648, 2147483647);
          finiteInteger(max, "rng.int max", -2147483648, 2147483647);
          if (min > max) fail("rng.int(...) requires min <= max");
          emit({ op: "rng_int", rng: id, target: target.name, min, max });
        },
      });
    }

    function gridWorldDeclaration(id, spec) {
      if (activeSessionScope !== null) fail("game.gridWorld(...) is global and is not available inside SessionContext in v15");
      assertV13Id(id, "gridWorld");
      if (gridWorlds.length >= 4) fail("portable v13 supports at most 4 grid-world projections");
      if (spec == null || typeof spec !== "object") fail("gridWorld " + id + " spec must be an object");
      if (!spec.grid || spec.grid[GRID] !== true) fail("gridWorld " + id + " grid must be returned by game.grid(...)");
      if (!Array.isArray(spec.palette) || spec.palette.length < 1 || spec.palette.length > 8) fail("gridWorld " + id + " palette must contain 1..8 entries");
      const palette = spec.palette.map((entry, index) => {
        if (entry == null || typeof entry !== "object") fail("gridWorld " + id + " palette " + index + " must be an object");
        if (typeof entry.block !== "string" || entry.block.length === 0) fail("gridWorld " + id + " palette " + index + " block must be a resource id string");
        return { value: finiteNumber(entry.value, "gridWorld " + id + " palette " + index + " value"), block: entry.block };
      });
      const declaration = {
        id, grid: spec.grid.id,
        dimension: spec.dimension === undefined ? "minecraft:overworld" : spec.dimension,
        originX: finiteInteger(spec.originX, "gridWorld " + id + " originX", -30000000, 30000000),
        y: finiteInteger(spec.y, "gridWorld " + id + " y", -2048, 2048),
        originZ: finiteInteger(spec.originZ, "gridWorld " + id + " originZ", -30000000, 30000000),
        palette,
        cellsPerTick: finiteInteger(spec.cellsPerTick === undefined ? 128 : spec.cellsPerTick, "gridWorld " + id + " cellsPerTick", 1, 256),
      };
      if (typeof declaration.dimension !== "string" || declaration.dimension.length === 0) fail("gridWorld " + id + " dimension must be a resource id string");
      usesV13 = true;
      gridWorlds.push(declaration);
      const ready = Object.freeze(comparable("grid_world_ready", id));
      return Object.freeze({
        [GRID_WORLD]: true, id, ready,
        rebuild() { assertV13SharedMutation("gridWorld.rebuild(...)"); emit({ op: "grid_world_rebuild", target: id }); },
      });
    }

    function block(id, spec) {
      assertSharedPresentation("block(...)");
      if (typeof id !== "string" || id.length === 0) fail("block id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("block " + id + " spec must be an object");
      if (typeof spec.block !== "string") fail("block " + id + " requires a block resource id");
      const projection = {
        id,
        dimension: spec.dimension === undefined ? "minecraft:overworld" : spec.dimension,
        block: spec.block,
        x: normalizeCoordinate(spec.x, "block " + id + " x"),
        y: normalizeCoordinate(spec.y, "block " + id + " y"),
        z: normalizeCoordinate(spec.z, "block " + id + " z"),
      };
      if (spec.scale !== undefined) projection.scale = spec.scale;
      if (spec.translation !== undefined) projection.translation = spec.translation;
      if (spec.when !== undefined) projection.when = serializedCondition(spec.when, "block " + id + " when");
      projections.push(projection);
    }

    function textProjection(id, spec) {
      assertSharedPresentation("text(...)");
      if (typeof id !== "string" || id.length === 0) fail("text id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("text " + id + " spec must be an object");
      let content;
      if (typeof spec.text === "string") {
        if (spec.text.length > 256) fail("text " + id + " exceeds 256 characters");
        content = spec.text;
      } else if (Array.isArray(spec.text) && spec.text.length >= 1 && spec.text.length <= 32) {
        content = spec.text.map((token, index) => {
          if (typeof token === "string") {
            if (token.length > 128) fail("text " + id + " token " + index + " exceeds 128 characters");
            return { text: token };
          }
          if (token && (token[REF] === "state" || token[REF] === "input")) return { value: unwrapValue(token) };
          fail("text " + id + " token " + index + " must be a string, state, or input reference");
        });
      } else {
        fail("text " + id + " requires a string or an array with 1..32 string/state/input tokens");
      }
      const projection = {
        id,
        dimension: spec.dimension === undefined ? "minecraft:overworld" : spec.dimension,
        text: content,
        x: normalizeCoordinate(spec.x, "text " + id + " x"),
        y: normalizeCoordinate(spec.y, "text " + id + " y"),
        z: normalizeCoordinate(spec.z, "text " + id + " z"),
        scale: normalizeVec3(spec.scale, { x: 1, y: 1, z: 1 }, "text " + id + " scale"),
        billboard: spec.billboard === undefined ? "center" : spec.billboard,
      };
      if (!["fixed", "vertical", "horizontal", "center"].includes(projection.billboard)) {
        fail("text " + id + " billboard must be fixed, vertical, horizontal, or center");
      }
      if (projection.scale.x <= 0 || projection.scale.y <= 0 || projection.scale.z <= 0) {
        fail("text " + id + " scale components must be > 0");
      }
      if (spec.when !== undefined) projection.when = serializedCondition(spec.when, "text " + id + " when");
      texts.push(projection);
    }

    function actorProjection(id, spec) {
      assertSharedPresentation("actor(...)");
      if (typeof id !== "string" || id.length === 0) fail("actor id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("actor " + id + " spec must be an object");
      const entityType = spec.entityType === undefined ? "minecraft:mannequin" : spec.entityType;
      if (!["minecraft:mannequin", "minecraft:zombie", "minecraft:skeleton"].includes(entityType)) {
        fail("actor " + id + " entityType must be minecraft:mannequin, minecraft:zombie, or minecraft:skeleton");
      }
      const actor = {
        id,
        dimension: spec.dimension === undefined ? "minecraft:overworld" : spec.dimension,
        entityType,
        x: normalizeCoordinate(spec.x, "actor " + id + " x"),
        y: normalizeCoordinate(spec.y, "actor " + id + " y"),
        z: normalizeCoordinate(spec.z, "actor " + id + " z"),
        yaw: normalizeCoordinate(spec.yaw === undefined ? 0 : spec.yaw, "actor " + id + " yaw"),
      };
      if (spec.when !== undefined) actor.when = serializedCondition(spec.when, "actor " + id + " when");
      actorProjections.push(actor);
    }

    function normalizeWorldWrite(write, label) {
      if (write == null || typeof write !== "object") fail(label + " must be an object");
      if (typeof write.block !== "string" || write.block.length === 0) fail(label + ".block must be a resource id string");
      return {
        x: finiteInteger(write.x, label + ".x", -30000000, 30000000),
        y: finiteInteger(write.y, label + ".y", -2048, 2048),
        z: finiteInteger(write.z, label + ".z", -30000000, 30000000),
        block: write.block,
      };
    }

    function worldBatch(id, spec) {
      assertSharedPresentation("worldBatch(...)");
      if (typeof id !== "string" || id.length === 0) fail("worldBatch id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("worldBatch " + id + " spec must be an object");
      if (!Array.isArray(spec.blocks) || spec.blocks.length < 1 || spec.blocks.length > 32768) {
        fail("worldBatch " + id + " blocks must contain 1..32768 writes");
      }
      const blocks = spec.blocks.map((write, index) => normalizeWorldWrite(write, "worldBatch " + id + " block " + index));
      worldWriteCount += blocks.length;
      if (worldWriteCount > 32768) fail("portable world batches exceed total write count 32768");
      const batch = {
        id,
        dimension: spec.dimension === undefined ? "minecraft:overworld" : spec.dimension,
        blocks,
      };
      if (typeof batch.dimension !== "string" || batch.dimension.length === 0) fail("worldBatch " + id + " dimension must be a resource id string");
      if (spec.when !== undefined) batch.when = serializedCondition(spec.when, "worldBatch " + id + " when");
      worldBatches.push(batch);
    }

    function worldFill(id, spec) {
      assertSharedPresentation("worldFill(...)");
      if (spec == null || typeof spec !== "object") fail("worldFill " + id + " spec must be an object");
      if (typeof spec.block !== "string" || spec.block.length === 0) fail("worldFill " + id + " block must be a resource id string");
      const fromX = finiteInteger(spec.fromX, "worldFill " + id + ".fromX", -30000000, 30000000);
      const fromY = finiteInteger(spec.fromY, "worldFill " + id + ".fromY", -2048, 2048);
      const fromZ = finiteInteger(spec.fromZ, "worldFill " + id + ".fromZ", -30000000, 30000000);
      const toX = finiteInteger(spec.toX, "worldFill " + id + ".toX", -30000000, 30000000);
      const toY = finiteInteger(spec.toY, "worldFill " + id + ".toY", -2048, 2048);
      const toZ = finiteInteger(spec.toZ, "worldFill " + id + ".toZ", -30000000, 30000000);
      const minX = Math.min(fromX, toX), maxX = Math.max(fromX, toX);
      const minY = Math.min(fromY, toY), maxY = Math.max(fromY, toY);
      const minZ = Math.min(fromZ, toZ), maxZ = Math.max(fromZ, toZ);
      const count = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
      if (!Number.isSafeInteger(count) || count < 1 || count > 32768) fail("worldFill " + id + " exceeds 32768 writes");
      const blocks = [];
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          for (let x = minX; x <= maxX; x++) blocks.push({ x, y, z, block: spec.block });
        }
      }
      worldBatch(id, { dimension: spec.dimension, blocks, when: spec.when });
    }

    function cameraProjection(id, spec) {
      assertSharedPresentation("camera(...)");
      if (cameras.length >= 8) fail("portable v14 supports at most 8 camera(...) declarations");
      if (typeof id !== "string" || id.length === 0) fail("camera id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("camera " + id + " spec must be an object");
      const mode = spec.mode === undefined ? "position_lock" : spec.mode;
      if (!["position_lock", "spectate"].includes(mode)) fail("camera " + id + " mode must be position_lock or spectate");
      const camera = {
        id,
        dimension: spec.dimension === undefined ? "minecraft:overworld" : spec.dimension,
        x: normalizeCoordinate(spec.x, "camera " + id + " x"),
        y: normalizeCoordinate(spec.y, "camera " + id + " y"),
        z: normalizeCoordinate(spec.z, "camera " + id + " z"),
        yaw: finiteNumber(spec.yaw === undefined ? 0 : spec.yaw, "camera " + id + " yaw"),
        pitch: finiteNumber(spec.pitch === undefined ? 0 : spec.pitch, "camera " + id + " pitch"),
      };
      if (mode === "spectate") camera.mode = mode;
      if (spec.audience !== undefined) { camera.audience = requirePlayerSet(spec.audience, "camera " + id + " audience"); usesPlayerApi = true; }
      cameras.push(camera);
    }

    function particleEmitter(id, spec) {
      assertSharedPresentation("particle(...)");
      if (typeof id !== "string" || id.length === 0) fail("particle id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("particle " + id + " spec must be an object");
      if (typeof spec.particle !== "string") fail("particle " + id + " requires a particle resource id");
      const delta = normalizeVec3(spec.delta, { x: 0, y: 0, z: 0 }, "particle " + id + " delta");
      if (delta.x < 0 || delta.y < 0 || delta.z < 0) fail("particle " + id + " delta components must be >= 0");
      const emitter = {
        id,
        dimension: spec.dimension === undefined ? "minecraft:overworld" : spec.dimension,
        particle: spec.particle,
        x: normalizeCoordinate(spec.x, "particle " + id + " x"),
        y: normalizeCoordinate(spec.y, "particle " + id + " y"),
        z: normalizeCoordinate(spec.z, "particle " + id + " z"),
        delta,
        speed: finiteNumber(spec.speed === undefined ? 0 : spec.speed, "particle " + id + " speed"),
        count: finiteInteger(spec.count === undefined ? 1 : spec.count, "particle " + id + " count", 1, 1000),
        force: spec.force === undefined ? false : spec.force,
      };
      if (typeof emitter.force !== "boolean") fail("particle " + id + " force must be boolean");
      if (emitter.speed < 0 || emitter.speed > 100) fail("particle " + id + " speed must be between 0 and 100");
      if (spec.when !== undefined) emitter.when = serializedCondition(spec.when, "particle " + id + " when");
      particles.push(emitter);
    }

    function soundEmitter(id, spec) {
      assertSharedPresentation("sound(...)");
      if (typeof id !== "string" || id.length === 0) fail("sound id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("sound " + id + " spec must be an object");
      if (typeof spec.sound !== "string") fail("sound " + id + " requires a sound resource id");
      const emitter = {
        id,
        dimension: spec.dimension === undefined ? "minecraft:overworld" : spec.dimension,
        sound: spec.sound,
        x: normalizeCoordinate(spec.x, "sound " + id + " x"),
        y: normalizeCoordinate(spec.y, "sound " + id + " y"),
        z: normalizeCoordinate(spec.z, "sound " + id + " z"),
        volume: finiteNumber(spec.volume === undefined ? 1 : spec.volume, "sound " + id + " volume"),
        pitch: finiteNumber(spec.pitch === undefined ? 1 : spec.pitch, "sound " + id + " pitch"),
      };
      if (emitter.volume < 0 || emitter.volume > 100) fail("sound " + id + " volume must be between 0 and 100");
      if (emitter.pitch < 0 || emitter.pitch > 2) fail("sound " + id + " pitch must be between 0 and 2");
      if (spec.when !== undefined) emitter.when = serializedCondition(spec.when, "sound " + id + " when");
      sounds.push(emitter);
    }

    function hudProjection(id, spec) {
      assertSharedPresentation("hud(...)");
      if (huds.length > 0) fail("only one hud(...) is currently supported");
      if (typeof id !== "string" || id.length === 0) fail("hud id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("hud " + id + " spec must be an object");
      const source = typeof spec.text === "string" ? [spec.text] : spec.text;
      if (!Array.isArray(source) || source.length < 1 || source.length > 32) {
        fail("hud " + id + " text must be a string or an array with 1..32 tokens");
      }
      const tokens = source.map((token, index) => {
        if (typeof token === "string") {
          if (token.length > 128) fail("hud " + id + " text token " + index + " exceeds 128 characters");
          return { text: token };
        }
        if (token && (token[REF] === "state" || token[REF] === "input")) return { value: unwrapValue(token) };
        fail("hud " + id + " token " + index + " must be a string, state, or input reference");
      });
      huds.push({ id, tokens });
    }

    function sidebarProjection(id, spec) {
      assertSharedPresentation("sidebar(...)");
      if (sidebars.length > 0) fail("only one sidebar(...) is currently supported");
      if (typeof id !== "string" || id.length === 0) fail("sidebar id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("sidebar " + id + " spec must be an object");
      if (typeof spec.title !== "string" || spec.title.length > 128) fail("sidebar " + id + " title must be a string of at most 128 characters");
      if (!Array.isArray(spec.rows) || spec.rows.length < 1 || spec.rows.length > 15) fail("sidebar " + id + " rows must contain 1..15 entries");
      const seen = new Set();
      const rows = spec.rows.map((row, rowIndex) => {
        if (row == null || typeof row !== "object") fail("sidebar " + id + " row " + rowIndex + " must be an object");
        if (typeof row.id !== "string" || row.id.length === 0) fail("sidebar " + id + " row " + rowIndex + " id must be a non-empty string");
        if (seen.has(row.id)) fail("sidebar " + id + " duplicate row id: " + row.id);
        seen.add(row.id);
        const source = typeof row.text === "string" ? [row.text] : row.text;
        if (!Array.isArray(source) || source.length < 1 || source.length > 32) fail("sidebar " + id + " row " + row.id + " text must be a string or an array with 1..32 tokens");
        const tokens = source.map((token, tokenIndex) => {
          if (typeof token === "string") {
            if (token.length > 128) fail("sidebar " + id + " row " + row.id + " token " + tokenIndex + " exceeds 128 characters");
            return { text: token };
          }
          if (token && (token[REF] === "state" || token[REF] === "input")) return { value: unwrapValue(token) };
          fail("sidebar " + id + " row " + row.id + " token " + tokenIndex + " must be a string, state, or input reference");
        });
        return { id: row.id, tokens };
      });
      sidebars.push({ id, title: spec.title, rows });
    }

    const dsl = Object.freeze({
      state: makeState,
      input(name, initial = 0, binding) { return makeInput(name, initial, binding); },
      players,
      teamPlayers,
      forEachPlayer,
      forSinglePlayer,
      session: sessionBlock,
      grid: gridDeclaration,
      rng: rngDeclaration,
      gridWorld: gridWorldDeclaration,
      tick,
      repeat,
      when,
      whenColliding,
      whenTriggered,
      at,
      box,
      circle,
      segment,
      capsule,
      trigger,
      flipper,
      block,
      text: textProjection,
      actor: actorProjection,
      worldBatch,
      worldFill,
      camera: cameraProjection,
      particle: particleEmitter,
      sound: soundEmitter,
      hud: hudProjection,
      sidebar: sidebarProjection,
    });

    build(dsl);
    if (tickActions === null) fail("tick(...) must be declared exactly once");
    if (Object.keys(stateValues).length === 0 && Object.keys(playerStateValues).length === 0 && grids.length === 0 && sessions.length === 0) fail("at least one shared state, player-local state, grid, or session is required");

    if (usesPlayerApi) {
      if (Object.keys(inputValues).length > 0 || Object.keys(vanillaInputs).length > 0) fail("game.input(...) is v1-v11 compatibility only; use player.input.* in multiplayer v12");
      if (huds.length > 0) fail("game.hud(...) is single-controller v1-v11 presentation; use player.hud(...) in multiplayer v12");
      for (const camera of cameras) if (camera.audience === undefined) camera.audience = "all_online";
      validateDisjointPlayerAudiences(cameras, "camera");
      validateDisjointPlayerAudiences(playerHuds, "player.hud");
      const playerHudValues = playerHuds.reduce((total, hud) => total + hud.tokens.filter(token => token.value !== undefined).length, 0);
      if (playerHudValues > 32) fail("player.hud(...) declarations exceed total numeric HUD value count 32");
    }

    const usesSpectateCamera = cameras.some(camera => camera.mode === "spectate");
    const spec = {
      version: usesV15 ? 15 : (usesV14 ? 14 : (usesV13 ? 13 : (usesPlayerApi ? 12 : (usesSpectateCamera ? 11 : (ownership === null ? 9 : 10))))),
      fixedPoint,
      state: stateValues,
      tick: tickActions,
    };
    if (Object.keys(inputValues).length > 0) spec.inputs = inputValues;
    if (playerTeams.size > 0) spec.playerSets = Array.from(playerTeams).sort().map(team => ({ team }));
    if (sessions.length > 0) spec.sessions = sessions;
    if (grids.length > 0) spec.grids = grids;
    if (rngs.length > 0) spec.rngs = rngs;
    if (usesPlayerApi) {
      spec.playerState = playerStateValues;
      spec.playerInputs = Array.from(playerInputs);
    }
    if (ownership !== null || Object.keys(vanillaInputs).length > 0 || projections.length > 0 || texts.length > 0 || actorProjections.length > 0 || worldBatches.length > 0 || gridWorlds.length > 0 || cameras.length > 0 || particles.length > 0 || sounds.length > 0 || huds.length > 0 || playerHuds.length > 0 || sidebars.length > 0) {
      spec.vanilla = {};
      if (ownership !== null) spec.vanilla.ownership = ownership;
      if (Object.keys(vanillaInputs).length > 0) spec.vanilla.inputs = vanillaInputs;
      if (projections.length > 0) spec.vanilla.projections = projections;
      if (texts.length > 0) spec.vanilla.texts = texts;
      if (actorProjections.length > 0) spec.vanilla.actors = actorProjections;
      if (worldBatches.length > 0) spec.vanilla.worldBatches = worldBatches;
      if (gridWorlds.length > 0) spec.vanilla.gridWorlds = gridWorlds;
      if (cameras.length > 0) spec.vanilla.cameras = cameras;
      if (particles.length > 0) spec.vanilla.particles = particles;
      if (sounds.length > 0) spec.vanilla.sounds = sounds;
      if (huds.length > 0) spec.vanilla.huds = huds;
      if (playerHuds.length > 0) spec.vanilla.playerHuds = playerHuds;
      if (sidebars.length > 0) spec.vanilla.sidebars = sidebars;
    }

    portable.define(spec);
  }

  Object.defineProperty(globalThis, "portableDsl", {
    value: portableDsl,
    writable: false,
    configurable: false,
    enumerable: false,
  });
})();
