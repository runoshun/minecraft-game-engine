# ADR 0014: Add bounded pinball collision primitives in Portable IR v6

Status: accepted

## Context

ADR 0013 makes the generated vanilla datapack backend primary and requires a representative mod-free pinball prototype before the Fabric runtime can be retired. Portable v5 already has circle/circle collision, which is sufficient for circular bumpers, but it cannot represent table rails, sloped guides, drain sensors, or player-controlled flippers without expanding those concepts into fragile hand-written scalar comparisons.

A general rigid-body engine is not required for the retirement gate and would be a poor fit for Minecraft scoreboard arithmetic. The portable boundary should instead expose a small set of deterministic arcade primitives whose geometry is bounded at compile time and whose game response remains authored explicitly in portable rules.

## Decision

Portable IR version 6 adds two low-level branch operations:

- `if_circle_capsule`: test a dynamic circle against a static capsule (a line segment plus radius);
- `if_trigger`: test the center point of a watched collider against an AABB sensor zone.

The TypeScript DSL exposes those operations through four game-facing primitives:

- `game.segment(id, { ax, ay, bx, by })`: a zero-radius static capsule;
- `game.capsule(id, { ax, ay, bx, by, radius })`: a static thick segment;
- `game.trigger(id, boxSpec)`: an AABB sensor; `game.whenTriggered(trigger, watched, ...)` observes the watched circle/box center and does not apply physical response;
- `game.flipper(id, spec)`: two compile-time capsule poses (`restAngle` and `activeAngle`) around a static pivot. `activeWhen` selects the capsule used by `game.whenColliding(...)`.

Flipper is deliberately DSL sugar rather than a new physical-simulation action. The DSL computes its rest and active endpoints while building the IR, then lowers collision to an ordinary condition plus `if_circle_capsule`. The game continues to own velocity/impulse changes in the collision callback. This keeps the runtime deterministic and makes both vanilla and any compatibility backend consume the same bounded semantics.

Capsule endpoints are static numeric logic coordinates bounded to `-64..64`; capsule radius is bounded to `0..16`, and the combined circle/capsule radius is bounded to 16 logic units. The vanilla compiler quantizes collision coordinates to approximately 0.01 logic units, performs a coarse expanded-AABB rejection, and then uses dot products, endpoint squared-distance tests, and a bounded cross-product comparison. These constraints keep intermediate Minecraft scoreboard arithmetic within signed 32-bit range. The Java reference state machine uses the same quantized geometry and coarse bounds.

`game.whenColliding` in v6 therefore accepts box/box, circle/circle, circle/segment, circle/capsule, and circle/flipper pairs (the latter three in either argument order). Segment/segment, capsule/capsule, dynamic endpoints, continuously rotating geometry, swept collision, restitution/friction, and 3D rigid-body physics remain out of scope.

## Reference acceptance game

`examples/portable-pinball-core` is the v6 acceptance game. It contains:

- one dynamic ball;
- three circle bumpers;
- static segment/capsule walls and sloped guides;
- two input-controlled two-pose flippers;
- a drain trigger;
- score, three-ball/lives state, fixed camera, actionbar HUD, particle and sound feedback.

The generated datapack is the deployment artifact and must pass on Minecraft 26.1 with `loader=vanilla`, `mods=[]`, and no installed runtime JAR.

## Consequences

Positive:

- ADR 0013's pinball retirement gate can be tested without introducing a general physics subsystem;
- table geometry stays compile-time bounded and deterministic;
- trigger semantics are explicit and separate from physical collision response;
- flipper control remains ordinary portable input/state rather than a Fabric-only moving-entity capability;
- the vanilla compiler can implement all new collision logic with scoreboards/functions only.

Tradeoffs:

- flippers snap between two declared collision poses rather than simulating angular motion;
- trigger zones observe a collider center, not arbitrary shape overlap;
- static capsule geometry cannot follow portable state;
- visual flipper articulation is authored separately with conditionally visible projections;
- collision response is intentionally game-authored and may be approximate/arcade-like.

This ADR extends ADR 0013. It does not change the retirement requirement that remaining game-facing Fabric capabilities either gain portable mappings or be explicitly removed from the supported API before the mod is deleted.
