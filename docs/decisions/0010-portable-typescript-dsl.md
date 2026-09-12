# ADR 0010: Use a bundled TypeScript DSL as the ergonomic frontend for portable IR

Status: accepted as experimental API

## Context

ADR 0009 intentionally made the portable semantic surface data-like. That keeps the runtime interpreter and vanilla mcfunction backend small and deterministic, but authoring nested `{ op, target, condition, then }` objects becomes noisy as arcade logic grows. Translating unrestricted TypeScript control flow directly would reintroduce the original problem: the compiler would need to implement broad JavaScript semantics.

The project also needs one source form that can remain productive under the Fabric runtime while producing a deployment artifact that can run on vanilla Minecraft when it stays inside portable capabilities.

## Decision

Add a bundled global `portableDsl(options?, builder)` frontend. The DSL executes only during script initialization and records the current versioned `PortableProgram` consumed by ADR 0009. It does not add a second gameplay runtime and it is not an AST-to-mcfunction compiler.

The initial DSL exposes:

- `state(name, initial)` -> mutable fixed-point state reference;
- `input(name, initial?, binding?)` -> read-only portable input reference;
- `tick(fn)` -> one deterministic action body;
- state operations `set`, `add`, `sub`, and `negate`;
- comparisons `eq`, `ne`, `lt`, `lte`, `gt`, and `gte`;
- `when(condition, thenFn, elseFn?)` -> nested IR branch;
- `at(state, base?)` -> dynamic projection coordinate;
- `block(id, spec)` -> bounded block-display projection;
- `camera(id, spec)` -> the portable single-controller camera;
- `particle(id, spec)` -> a declarative per-tick particle emitter;
- portable input bindings including hotbar and v3 held player input.

The same bundled JavaScript prelude is installed in both execution paths:

1. Fabric script contexts: the DSL calls `portable.define` and also registers small host adapters. Declared inputs are copied into portable registers before rules execute; blocks use `render`, the portable camera uses `camera`, and particle emitters use `effects.particle`.
2. Build-time extraction: host callback registration functions are no-ops, so the callbacks are never executed. The DSL still calls `portable.define`, and the existing vanilla compiler consumes the resulting IR and adapter metadata.

A DSL-only source therefore has two deployment modes without changing game rules. The Fabric runtime remains useful for hot reload and richer unsupported capabilities. A generated datapack using only implemented portable primitives runs on vanilla Minecraft 26.1 without Fabric or MC Game Runtime installed.

## Consequences

Positive:

- authors write normal-looking TypeScript method calls instead of manually constructing IR objects;
- the compiler semantic surface remains the versioned portable IR, not arbitrary JavaScript;
- Fabric and vanilla backends consume the same game rules;
- adding DSL sugar does not require adding backend semantics unless it lowers to an existing IR primitive;
- `examples/portable-breakout-core` can contain no hand-written `game.onTick`, `render`, or `portable.define` glue while still working in both paths.

Tradeoffs and limitations:

- DSL callbacks execute at initialization to record rules; they are not per-tick JavaScript closures;
- normal JavaScript `if`, `for`, mutable arrays, classes, and arbitrary function calls inside `tick(...)` do not automatically become portable semantics. Authors must use DSL operations for code intended for vanilla compilation;
- current v4 auto-adapters cover hotbar/held input, block/text-display projections, one camera, particle/sound emitters, one actionbar HUD, and 2D AABB collision;
- generated vanilla ownership/input is still single-controller-oriented and not a general multiplayer session model;
- the portable camera changes the controller to spectator and cleanup returns that player to Adventure rather than restoring an arbitrary prior gamemode;
- richer physics, collections, events, UI, and sound need explicit IR/backend primitives before DSL sugar can expose them portably.

ADR 0010 supplements ADR 0009. ADR 0009 remains the semantic/backend contract; this ADR defines the preferred authoring frontend.
