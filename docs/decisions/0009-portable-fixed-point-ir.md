# ADR 0009: Add a portable fixed-point rule IR with runtime and vanilla-datapack backends

Status: accepted as experimental API

## Context

The embedded TypeScript path is productive because game code can use ordinary functions, objects, loops, and the Fabric runtime's Minecraft capabilities. It is not directly compilable to a pure vanilla datapack: JavaScript numbers are floating point, arbitrary TypeScript control flow has no bounded mcfunction translation, and host capabilities such as semantic input and camera ownership rely on the server mod.

Trying to translate unrestricted TypeScript directly into mcfunction would make the compiler responsible for most of JavaScript/TypeScript semantics and would couple game code to scoreboard implementation details. At the same time, small deterministic parts of arcade games such as counters, fixed-point positions, velocities, state machines, and threshold tests map naturally to scoreboards and functions.

## Decision

Introduce an experimental `portable` capability as a deliberately restricted backend-neutral rule IR embedded in `main.ts`:

- `portable.define(spec)` declares versioned fixed-point state and a deterministic per-tick action list.
- Version 1 supports numeric state, state/constant references, `set`, `add`, `sub`, `negate`, and nested `if` with `eq/ne/lt/lte/gt/gte` comparisons.
- Authored numbers are converted to signed 32-bit fixed-point integers using the program's `fixedPoint` scale (default 1000).
- State names and program size/nesting are bounded so the same program can be validated before either backend executes it.
- The Fabric runtime interprets the portable action list before ordinary `game.onTick` callbacks. `portable.get(name)` exposes the logical floating-point value to the TypeScript presentation/host adapter; `portable.raw(name)` exposes the exact fixed-point integer for diagnostics.
- The build-time portable compiler transpiles the same `main.ts`, evaluates only initialization against sandboxed registration-only host stubs, captures `portable.define`, and emits a standalone vanilla datapack. State becomes a pack-specific scoreboard objective, tick rules become mcfunctions, and `if` bodies become generated branch functions.

The existing `game`, `input`, `render`, `ui`, `menu`, `camera`, `world`, and `effects` capabilities remain the Fabric-host API. They are not implicitly compiled to vanilla commands. A script can therefore migrate incrementally: portable deterministic rules can live in `portable.define`, while runtime-only presentation/input stays in ordinary callbacks. Version 2 subsequently extended this same IR with bounded input registers and vanilla adapter metadata; ADR 0010 adds an ergonomic DSL frontend without changing this semantic boundary. ADR 0011 extends the portable metadata surface again in version 3 with held player input, one spectator camera, and bounded particle emitters.

The compiler is invoked through the Gradle `compilePortable` task with explicit source, namespace, and output directory. Generated directories contain a marker file and the CLI refuses to overwrite an unrelated non-generated directory.

## Consequences

Positive:

- one authored fixed-point state machine can execute in the Fabric runtime or as pure vanilla scoreboard/functions;
- the compiler has a small explicit semantic surface rather than attempting arbitrary TypeScript translation;
- game Core and Minecraft presentation become easier to separate incrementally;
- generated objective names are isolated per namespace and generated datapacks can coexist;
- the IR is suitable for deterministic off-server tests and future alternative backends.

Tradeoffs and limitations:

- version 1 is intentionally small; version 2 adds bounded input registers plus a hotbar adapter and block-display projections; version 3 adds held input, one camera, and particle emitters, while sound, collision primitives, functions/loops, random numbers, events, and dynamic entity collections remain outside the portable IR;
- vanilla compilation covers semantics represented in portable IR rather than arbitrary host callbacks; DSL-only programs can now produce a full simple arcade input/physics/display loop, while richer host capabilities still require explicit portable primitives;
- fixed-point state must remain within signed 32-bit scoreboard range; the Fabric interpreter throws on arithmetic overflow while generated vanilla scoreboards do not yet insert overflow guards;
- `portable.define` is initialization-only and may appear only once per script;
- build-time extraction executes top-level initialization in a Graal sandbox with registration-only host stubs; scripts whose portable definition depends on live Minecraft state are intentionally not compilable.

This ADR adds a second backend for a constrained game-logic subset. It does not supersede ADR 0001: embedded TypeScript remains the default prototyping runtime.
