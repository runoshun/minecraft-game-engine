(() => {
  const REF = Symbol("mcgame.portableDsl.ref");
  const CONDITION = Symbol("mcgame.portableDsl.condition");
  const COORDINATE = Symbol("mcgame.portableDsl.coordinate");
  const BOX = Symbol("mcgame.portableDsl.box");

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
    const stateValues = Object.create(null);
    const inputValues = Object.create(null);
    const vanillaInputs = Object.create(null);
    const projections = [];
    const texts = [];
    const cameras = [];
    const particles = [];
    const sounds = [];
    const huds = [];
    const runtimeInputs = [];
    let tickActions = null;
    let actionSink = null;

    function assertUnique(name) {
      if (Object.prototype.hasOwnProperty.call(stateValues, name) || Object.prototype.hasOwnProperty.call(inputValues, name)) {
        fail("duplicate state/input name: " + name);
      }
    }

    function unwrapValue(value) {
      if (typeof value === "number") return finiteNumber(value, "value");
      if (value && value[REF] === "state") return { state: value.name };
      if (value && value[REF] === "input") return { input: value.name };
      fail("value must be a number, state, or input reference");
    }

    function comparison(op, left, right) {
      return Object.freeze({
        [CONDITION]: true,
        op,
        left: unwrapValue(left),
        right: unwrapValue(right),
      });
    }

    function comparable(kind, name) {
      const ref = {
        [REF]: kind,
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
      assertUnique(name);
      stateValues[name] = finiteNumber(initial, "state " + name + " initial value");
      const ref = comparable("state", name);
      ref.set = value => emit({ op: "set", target: name, value: unwrapValue(value) });
      ref.add = value => emit({ op: "add", target: name, value: unwrapValue(value) });
      ref.sub = value => emit({ op: "sub", target: name, value: unwrapValue(value) });
      ref.negate = () => emit({ op: "negate", target: name });
      return Object.freeze(ref);
    }

    function makeInput(name, initial, binding) {
      assertUnique(name);
      inputValues[name] = finiteNumber(initial, "input " + name + " initial value");
      if (binding !== undefined) {
        if (binding == null || typeof binding !== "object" || typeof binding.source !== "string") {
          fail("input " + name + " binding must be { source: string }");
        }
        vanillaInputs[name] = { source: binding.source };
        runtimeInputs.push({ name, initial, source: binding.source });
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
      if (value && (value[REF] === "state" || value[REF] === "input")) return unwrapValue(value);
      fail(label + " must be a number, state, or input reference");
    }

    function box(id, spec) {
      if (typeof id !== "string" || id.length === 0) fail("box id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("box " + id + " spec must be an object");
      const width = finiteNumber(spec.width, "box " + id + " width");
      const height = finiteNumber(spec.height, "box " + id + " height");
      if (width <= 0 || width > 1000) fail("box " + id + " width must be > 0 and <= 1000");
      if (height <= 0 || height > 1000) fail("box " + id + " height must be > 0 and <= 1000");
      return Object.freeze({
        [BOX]: true,
        id,
        x: normalizeBoxValue(spec.x, "box " + id + " x"),
        y: normalizeBoxValue(spec.y, "box " + id + " y"),
        width,
        height,
      });
    }

    function serializeBox(value, label) {
      if (!value || value[BOX] !== true) fail(label + " must be created by box(...)");
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    }

    function whenColliding(a, b, thenCallback, elseCallback) {
      const action = {
        op: "if_aabb",
        a: serializeBox(a, "whenColliding first box"),
        b: serializeBox(b, "whenColliding second box"),
        then: captureActions(thenCallback, "whenColliding then"),
      };
      if (elseCallback !== undefined) action.else = captureActions(elseCallback, "whenColliding else");
      emit(action);
    }

    function block(id, spec) {
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
      projections.push(projection);
    }

    function textProjection(id, spec) {
      if (typeof id !== "string" || id.length === 0) fail("text id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("text " + id + " spec must be an object");
      if (typeof spec.text !== "string") fail("text " + id + " requires a text string");
      if (spec.text.length > 256) fail("text " + id + " exceeds 256 characters");
      const projection = {
        id,
        dimension: spec.dimension === undefined ? "minecraft:overworld" : spec.dimension,
        text: spec.text,
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
      texts.push(projection);
    }

    function cameraProjection(id, spec) {
      if (cameras.length > 0) fail("only one camera(...) is currently supported");
      if (typeof id !== "string" || id.length === 0) fail("camera id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("camera " + id + " spec must be an object");
      cameras.push({
        id,
        dimension: spec.dimension === undefined ? "minecraft:overworld" : spec.dimension,
        x: normalizeCoordinate(spec.x, "camera " + id + " x"),
        y: normalizeCoordinate(spec.y, "camera " + id + " y"),
        z: normalizeCoordinate(spec.z, "camera " + id + " z"),
        yaw: finiteNumber(spec.yaw === undefined ? 0 : spec.yaw, "camera " + id + " yaw"),
        pitch: finiteNumber(spec.pitch === undefined ? 0 : spec.pitch, "camera " + id + " pitch"),
      });
    }

    function particleEmitter(id, spec) {
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

    const dsl = Object.freeze({
      state: makeState,
      input(name, initial = 0, binding) { return makeInput(name, initial, binding); },
      tick,
      when,
      whenColliding,
      at,
      box,
      block,
      text: textProjection,
      camera: cameraProjection,
      particle: particleEmitter,
      sound: soundEmitter,
      hud: hudProjection,
    });

    build(dsl);
    if (tickActions === null) fail("tick(...) must be declared exactly once");
    if (Object.keys(stateValues).length === 0) fail("at least one state(...) is required");

    const spec = {
      version: 4,
      fixedPoint,
      state: stateValues,
      tick: tickActions,
    };
    if (Object.keys(inputValues).length > 0) spec.inputs = inputValues;
    if (Object.keys(vanillaInputs).length > 0 || projections.length > 0 || texts.length > 0 || cameras.length > 0 || particles.length > 0 || sounds.length > 0 || huds.length > 0) {
      spec.vanilla = {};
      if (Object.keys(vanillaInputs).length > 0) spec.vanilla.inputs = vanillaInputs;
      if (projections.length > 0) spec.vanilla.projections = projections;
      if (texts.length > 0) spec.vanilla.texts = texts;
      if (cameras.length > 0) spec.vanilla.cameras = cameras;
      if (particles.length > 0) spec.vanilla.particles = particles;
      if (sounds.length > 0) spec.vanilla.sounds = sounds;
      if (huds.length > 0) spec.vanilla.huds = huds;
    }

    portable.define(spec);

    function runtimeInputValue(binding, player) {
      if (!player) return binding.initial;
      switch (binding.source) {
        case "first_player_hotbar_slot": return player.hotbarSlot;
        case "first_player_forward": return player.forward ? 1 : 0;
        case "first_player_backward": return player.backward ? 1 : 0;
        case "first_player_left": return player.left ? 1 : 0;
        case "first_player_right": return player.right ? 1 : 0;
        case "first_player_jump": return player.jump ? 1 : 0;
        case "first_player_sneak": return player.sneak ? 1 : 0;
        case "first_player_sprint": return player.sprint ? 1 : 0;
        default: throw new Error("portableDsl runtime does not support input source: " + binding.source);
      }
    }

    if (runtimeInputs.length > 0) {
      game.onBeforeTick(() => {
        const players = input.players();
        const player = players.length > 0 ? players[0] : null;
        for (const binding of runtimeInputs) {
          portable.setInput(binding.name, runtimeInputValue(binding, player));
        }
      });
    }

    const runtimeCoordinate = coordinate => {
      if (typeof coordinate === "number") return coordinate;
      return (coordinate.base || 0) + portable.get(coordinate.state);
    };

    if (projections.length > 0) {
      const renderId = projection => "pdsl_" + projection.id;
      game.onStart(() => {
        for (const projection of projections) {
          const renderOptions = {
            visual: { kind: "block", block: projection.block },
            dimension: projection.dimension,
            x: runtimeCoordinate(projection.x),
            y: runtimeCoordinate(projection.y),
            z: runtimeCoordinate(projection.z),
          };
          if (projection.scale !== undefined) renderOptions.scale = projection.scale;
          if (projection.translation !== undefined) renderOptions.offset = projection.translation;
          if (typeof projection.x !== "number" || typeof projection.y !== "number" || typeof projection.z !== "number") {
            renderOptions.smoothing = { positionTicks: 1 };
          }
          render.spawn(renderId(projection), renderOptions);
        }
      });
      game.onTick(() => {
        for (const projection of projections) {
          if (typeof projection.x === "number" && typeof projection.y === "number" && typeof projection.z === "number") continue;
          render.update(renderId(projection), {
            x: runtimeCoordinate(projection.x),
            y: runtimeCoordinate(projection.y),
            z: runtimeCoordinate(projection.z),
          });
        }
      });
    }

    if (texts.length > 0) {
      const renderTextId = text => "pdsl_text_" + text.id;
      game.onStart(() => {
        for (const text of texts) {
          render.spawn(renderTextId(text), {
            visual: { kind: "text", text: text.text },
            dimension: text.dimension,
            x: runtimeCoordinate(text.x),
            y: runtimeCoordinate(text.y),
            z: runtimeCoordinate(text.z),
            scale: text.scale,
            billboard: text.billboard,
          });
        }
      });
      game.onTick(() => {
        for (const text of texts) {
          if (typeof text.x === "number" && typeof text.y === "number" && typeof text.z === "number") continue;
          render.update(renderTextId(text), {
            x: runtimeCoordinate(text.x),
            y: runtimeCoordinate(text.y),
            z: runtimeCoordinate(text.z),
          });
        }
      });
    }

    if (cameras.length > 0) {
      const declaredCamera = cameras[0];
      let runtimeCameraPlayerId = null;
      const cameraOptions = () => ({
        dimension: declaredCamera.dimension,
        x: runtimeCoordinate(declaredCamera.x),
        y: runtimeCoordinate(declaredCamera.y),
        z: runtimeCoordinate(declaredCamera.z),
        yaw: declaredCamera.yaw,
        pitch: declaredCamera.pitch,
      });
      const tryAttach = () => {
        const players = input.players();
        if (runtimeCameraPlayerId !== null) {
          const existing = players.find(player => player.id === runtimeCameraPlayerId);
          if (existing) return existing;
          runtimeCameraPlayerId = null;
        }
        const player = players.length > 0 ? players[0] : null;
        if (!player) return null;
        runtimeCameraPlayerId = player.id;
        camera.attach(player.id, cameraOptions());
        return player;
      };
      game.onStart(() => { tryAttach(); });
      game.onTick(() => {
        const player = tryAttach();
        if (!player) return;
        if (typeof declaredCamera.x !== "number" || typeof declaredCamera.y !== "number" || typeof declaredCamera.z !== "number") {
          camera.move(player.id, cameraOptions());
        }
      });
    }

    function runtimeValue(value) {
      if (typeof value === "number") return value;
      if (value && typeof value.state === "string") return portable.get(value.state);
      if (value && typeof value.input === "string") return portable.input(value.input);
      fail("internal runtime condition value is invalid");
    }

    function runtimeTest(condition) {
      const left = runtimeValue(condition.left);
      const right = runtimeValue(condition.right);
      switch (condition.op) {
        case "eq": return left === right;
        case "ne": return left !== right;
        case "lt": return left < right;
        case "lte": return left <= right;
        case "gt": return left > right;
        case "gte": return left >= right;
        default: fail("internal runtime condition operator is invalid: " + condition.op);
      }
    }

    if (particles.length > 0) {
      game.onTick(() => {
        for (const emitter of particles) {
          if (emitter.when !== undefined && !runtimeTest(emitter.when)) continue;
          effects.particle({
            dimension: emitter.dimension,
            particle: emitter.particle,
            x: runtimeCoordinate(emitter.x),
            y: runtimeCoordinate(emitter.y),
            z: runtimeCoordinate(emitter.z),
            delta: emitter.delta,
            speed: emitter.speed,
            count: emitter.count,
            force: emitter.force,
          });
        }
      });
    }

    if (sounds.length > 0) {
      game.onTick(() => {
        for (const emitter of sounds) {
          if (emitter.when !== undefined && !runtimeTest(emitter.when)) continue;
          effects.sound({
            dimension: emitter.dimension,
            sound: emitter.sound,
            x: runtimeCoordinate(emitter.x),
            y: runtimeCoordinate(emitter.y),
            z: runtimeCoordinate(emitter.z),
            volume: emitter.volume,
            pitch: emitter.pitch,
          });
        }
      });
    }

    if (huds.length > 0) {
      const hud = huds[0];
      game.onTick(() => {
        const players = input.players();
        const player = players.length > 0 ? players[0] : null;
        if (!player) return;
        let text = "";
        for (const token of hud.tokens) {
          if (token.text !== undefined) text += token.text;
          else text += String(Math.trunc(runtimeValue(token.value)));
        }
        ui.hud(player.id, text);
      });
    }
  }

  Object.defineProperty(globalThis, "portableDsl", {
    value: portableDsl,
    writable: false,
    configurable: false,
    enumerable: false,
  });
})();
