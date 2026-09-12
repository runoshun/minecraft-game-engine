# ADR 0012: Add sound, text, actionbar HUD, and 2D AABB collision to portable IR

Status: accepted as experimental API

## Context

Portable IR v3 can express a useful arcade loop with normal held input, fixed-point state, block displays, a spectator camera, and particles, but a game still needs handwritten Fabric-only glue for audio and textual presentation. Collision response also remains hand-authored as repeated scalar threshold comparisons, which is portable but obscures the game rule and becomes unwieldy as the number of moving objects grows.

The next primitives should remain deterministic and backend-neutral. They must compile to ordinary Minecraft 26.1 datapack mechanisms and also map to the existing Fabric host capabilities without exposing raw commands or Java objects.

## Decision

Portable IR version 4 adds four bounded capability families while retaining v1-v3 compatibility:

- static-content world text projections with fixed/state-backed coordinates, scale, and billboard mode;
- conditional sound emitters with fixed/state-backed coordinates, volume, and pitch;
- one actionbar HUD whose content is a bounded sequence of literal text and fixed-point state/input values;
- deterministic 2D axis-aligned bounding boxes plus an `if_aabb` rule action.

The DSL exposes these as `text(id, spec)`, `sound(id, spec)`, `hud(id, spec)`, `box(id, spec)`, and `whenColliding(a, b, thenFn, elseFn?)`.

World text is presentation metadata rather than game state. The vanilla backend emits owned `text_display` entities; the Fabric adapter maps the same declaration to `render` text nodes. Text content is static in v4, while its position may follow fixed-point state.

Sound emitters run after portable rules each tick. Their optional condition is a normal portable comparison, so one-shot sounds are authored by raising a state for one tick. The vanilla backend emits `playsound`; state-backed positions use owned marker anchors. The Fabric adapter uses `effects.sound`.

The portable HUD maps to the vanilla actionbar. Literal and numeric tokens are concatenated in declaration order. Numeric tokens display their logical integer value by truncating fixed-point state/input values toward zero. The vanilla backend copies values into scratch scoreboard holders, divides by `fixedPoint`, and uses JSON score components. The Fabric adapter sends an actionbar packet through `ui.hud`. The v4 HUD is intentionally a compact single-line game HUD, not a replacement for the richer Fabric-only `ui.panel` sidebar or menus.

Collision is logic-space, not a Minecraft-world query. `box(...)` records a center x/y value plus constant width and height. `whenColliding` tests inclusive AABB overlap after earlier rules in the same tick have updated state. The Java interpreter computes the same fixed-point comparisons as the vanilla backend, which lowers the overlap test to scoreboard edge calculations and `execute if score` comparisons. Collision response remains game-owned: the body decides whether to clamp position, invert velocity, apply damage, increment score, or do nothing.

## Consequences

Positive:

- a small arcade game can now keep input, physics, collision, world text, HUD, audio, camera, displays, and particles in one DSL-only source;
- generated deployment remains a normal vanilla Minecraft 26.1 datapack with no runtime mod;
- collision intent is explicit without introducing Minecraft block/entity queries into Game Core;
- Fabric and vanilla backends continue to consume the same portable declaration and rule semantics.

Tradeoffs and limitations:

- v4 collision is 2D AABB only; there is no swept collision, spatial index, arbitrary polygon, 3D volume, block query, or entity query;
- box width and height are declaration-time constants, while center coordinates may be constants, state, or input values;
- touching AABB boundaries counts as overlap;
- world-text content is static; dynamic text belongs in the HUD for now;
- the HUD supports one actionbar line and numeric values are displayed as truncated logical integers, not formatted decimals;
- conditional sound declarations are level-triggered and run at tick rate while their condition remains true, so one-shot behavior needs an edge/pulse state;
- generated dynamic text/sound anchors inherit the same bounded-scene ownership assumptions as other portable projections.

ADR 0012 extends ADR 0009's portable backend contract, ADR 0010's DSL frontend, and ADR 0011's input/camera/effects work. It does not make arbitrary TypeScript or arbitrary Minecraft queries portable.
