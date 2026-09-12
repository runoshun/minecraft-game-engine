(() => {
  const REF = Symbol("mcgame.portableDsl.ref");
  const CONDITION = Symbol("mcgame.portableDsl.condition");
  const COORDINATE = Symbol("mcgame.portableDsl.coordinate");
  const BOX = Symbol("mcgame.portableDsl.box");
  const CIRCLE = Symbol("mcgame.portableDsl.circle");
  const CAPSULE = Symbol("mcgame.portableDsl.capsule");
  const TRIGGER = Symbol("mcgame.portableDsl.trigger");
  const FLIPPER = Symbol("mcgame.portableDsl.flipper");

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
    const actorProjections = [];
    const worldBatches = [];
    let worldWriteCount = 0;
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

    function circle(id, spec) {
      if (typeof id !== "string" || id.length === 0) fail("circle id must be a non-empty string");
      if (spec == null || typeof spec !== "object") fail("circle " + id + " spec must be an object");
      const radius = finiteNumber(spec.radius, "circle " + id + " radius");
      if (radius <= 0 || radius > 1000) fail("circle " + id + " radius must be > 0 and <= 1000");
      return Object.freeze({
        [CIRCLE]: true,
        id,
        x: normalizeBoxValue(spec.x, "circle " + id + " x"),
        y: normalizeBoxValue(spec.y, "circle " + id + " y"),
        radius,
      });
    }

    function serializeBox(value, label) {
      if (!value || value[BOX] !== true) fail(label + " must be created by box(...)");
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    }

    function serializeCircle(value, label) {
      if (!value || value[CIRCLE] !== true) fail(label + " must be created by circle(...)");
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
      const action = {
        op: "if_trigger",
        trigger: serializeBox(triggerValue.zone, "whenTriggered trigger"),
        point: { x: watched.x, y: watched.y },
        then: captureActions(thenCallback, "whenTriggered then"),
      };
      if (elseCallback !== undefined) action.else = captureActions(elseCallback, "whenTriggered else");
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
      if (spec.when !== undefined) projection.when = serializedCondition(spec.when, "block " + id + " when");
      projections.push(projection);
    }

    function textProjection(id, spec) {
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
    });

    build(dsl);
    if (tickActions === null) fail("tick(...) must be declared exactly once");
    if (Object.keys(stateValues).length === 0) fail("at least one state(...) is required");

    const spec = {
      version: 8,
      fixedPoint,
      state: stateValues,
      tick: tickActions,
    };
    if (Object.keys(inputValues).length > 0) spec.inputs = inputValues;
    if (Object.keys(vanillaInputs).length > 0 || projections.length > 0 || texts.length > 0 || actorProjections.length > 0 || worldBatches.length > 0 || cameras.length > 0 || particles.length > 0 || sounds.length > 0 || huds.length > 0) {
      spec.vanilla = {};
      if (Object.keys(vanillaInputs).length > 0) spec.vanilla.inputs = vanillaInputs;
      if (projections.length > 0) spec.vanilla.projections = projections;
      if (texts.length > 0) spec.vanilla.texts = texts;
      if (actorProjections.length > 0) spec.vanilla.actors = actorProjections;
      if (worldBatches.length > 0) spec.vanilla.worldBatches = worldBatches;
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

    if (actorProjections.length > 0) {
      const actorId = actor => "pdsl_actor_" + actor.id;
      const visible = new Set();
      const shouldShow = actor => actor.when === undefined || runtimeTest(actor.when);
      const dynamicActor = actor =>
        typeof actor.x !== "number" || typeof actor.y !== "number" || typeof actor.z !== "number" || typeof actor.yaw !== "number";
      const actorOptions = actor => ({
        entityType: actor.entityType,
        dimension: actor.dimension,
        x: runtimeCoordinate(actor.x),
        y: runtimeCoordinate(actor.y),
        z: runtimeCoordinate(actor.z),
        yaw: runtimeCoordinate(actor.yaw),
      });
      const spawnActor = actor => {
        actors.spawn(actorId(actor), actorOptions(actor));
        visible.add(actor.id);
      };
      game.onStart(() => {
        for (const actor of actorProjections) if (shouldShow(actor)) spawnActor(actor);
      });
      game.onTick(() => {
        for (const actor of actorProjections) {
          const show = shouldShow(actor);
          const isVisible = visible.has(actor.id);
          if (show && !isVisible) spawnActor(actor);
          if (!show && isVisible) {
            actors.remove(actorId(actor));
            visible.delete(actor.id);
            continue;
          }
          if (show && dynamicActor(actor)) actors.move(actorId(actor), actorOptions(actor));
        }
      });
    }

    if (projections.length > 0) {
      const renderId = projection => "pdsl_" + projection.id;
      const visible = new Set();
      const shouldShow = projection => projection.when === undefined || runtimeTest(projection.when);
      const spawnProjection = projection => {
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
        visible.add(projection.id);
      };
      game.onStart(() => {
        for (const projection of projections) if (shouldShow(projection)) spawnProjection(projection);
      });
      game.onTick(() => {
        for (const projection of projections) {
          const show = shouldShow(projection);
          const isVisible = visible.has(projection.id);
          if (show && !isVisible) spawnProjection(projection);
          if (!show && isVisible) {
            render.remove(renderId(projection));
            visible.delete(projection.id);
            continue;
          }
          if (!show) continue;
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
      const visible = new Set();
      const shouldShow = text => text.when === undefined || runtimeTest(text.when);
      const dynamicText = text => Array.isArray(text.text) && text.text.some(token => token.value !== undefined);
      const runtimeText = text => {
        if (typeof text.text === "string") return text.text;
        return text.text.map(token => token.text !== undefined ? token.text : String(Math.trunc(runtimeValue(token.value)))).join("");
      };
      const spawnText = text => {
        render.spawn(renderTextId(text), {
          visual: { kind: "text", text: runtimeText(text) },
          dimension: text.dimension,
          x: runtimeCoordinate(text.x),
          y: runtimeCoordinate(text.y),
          z: runtimeCoordinate(text.z),
          scale: text.scale,
          billboard: text.billboard,
        });
        visible.add(text.id);
      };
      game.onStart(() => {
        for (const text of texts) if (shouldShow(text)) spawnText(text);
      });
      game.onTick(() => {
        for (const text of texts) {
          const show = shouldShow(text);
          const isVisible = visible.has(text.id);
          if (show && !isVisible) spawnText(text);
          if (!show && isVisible) {
            render.remove(renderTextId(text));
            visible.delete(text.id);
            continue;
          }
          if (!show) continue;
          const dynamicPosition = typeof text.x !== "number" || typeof text.y !== "number" || typeof text.z !== "number";
          if (!dynamicPosition && !dynamicText(text)) continue;
          const patch = {};
          if (dynamicPosition) {
            patch.x = runtimeCoordinate(text.x);
            patch.y = runtimeCoordinate(text.y);
            patch.z = runtimeCoordinate(text.z);
          }
          if (dynamicText(text)) patch.visual = { kind: "text", text: runtimeText(text) };
          render.update(renderTextId(text), patch);
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

    if (worldBatches.length > 0) {
      const applyWorldBatch = batch => world.setBlocks({ dimension: batch.dimension, blocks: batch.blocks });
      game.onStart(() => {
        for (const batch of worldBatches) if (batch.when === undefined) applyWorldBatch(batch);
      });
      game.onTick(() => {
        for (const batch of worldBatches) {
          if (batch.when !== undefined && runtimeTest(batch.when)) applyWorldBatch(batch);
        }
      });
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
