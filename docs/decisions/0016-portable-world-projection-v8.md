# ADR 0016: Add bounded declarative world projection in Portable IR v8

Status: accepted as experimental architecture

## Context

ADR 0013 makes generated vanilla datapacks the primary deployment target. After portable presentation v7, world mutation is the next Fabric-only capability family used by retained examples. The transitional Fabric API exposes mutable `world.setBlock`, `world.setBlocks`, and `world.fill`; copying those calls directly into arbitrary runtime callbacks would preserve the dependency on runtime TypeScript rather than remove it.

The portable compiler can represent a smaller and deterministic subset well: a bounded collection of compile-time block writes, optionally guarded by portable scalar/input state. Minecraft datapacks can apply that projection directly with `setblock` commands. This covers finite arena/setup/state projection without making Minecraft blocks the gameplay source of truth.

The current top-down roguelike is harder: its 29 x 37 dungeon topology is generated at runtime from arrays, loops, and seeded randomness, then projected in 512-write chunks. Encoding that generator as thousands of fixed scalar rules would violate the current Portable IR bounds and would be the wrong abstraction. That runtime procedural-generation problem belongs to the later arbitrary-TypeScript/dynamic-collection retirement work, not to this bounded projection primitive.

## Decision

Portable IR version 8 adds `vanilla.worldBatches`. `portableDsl` exposes two build-time declarations:

```ts
game.worldBatch("floor", {
  dimension: "minecraft:overworld",
  blocks: [
    { x: 10, y: 64, z: 10, block: "minecraft:stone" },
    { x: 11, y: 64, z: 10, block: "minecraft:gold_block" },
  ],
});

game.worldFill("door_open", {
  fromX: 20, fromY: 64, fromZ: 20,
  toX: 20, toY: 66, toZ: 20,
  block: "minecraft:air",
  when: doorOpen.eq(1),
});
```

`worldFill` is DSL sugar: it expands the inclusive cuboid to ordinary block writes while the program is being built. It is not a runtime fill operation in Portable IR.

Bounds:

- at most 32 declared world batches;
- at most 32,768 block writes total across all batches;
- integer block coordinates only;
- x/z in `-30,000,000..30,000,000` and y in `-2048..2048`;
- block values are Minecraft resource identifiers;
- `when`, when present, is an ordinary portable scalar/input comparison.

An unconditional batch executes once from the generated load function. A conditional batch executes on every tick for which its condition is true. Games that need edge-triggered application should express the edge as portable scalar state/input rules rather than adding hidden event semantics to world projection.

The vanilla compiler emits one generated function per batch. Writes are grouped by target chunk; each chunk is temporarily force-loaded, its `setblock` commands are executed, then that force-load is removed before the next chunk. Grouping this way avoids depending on Minecraft's global force-load chunk limit for large bounded batches.

The Fabric compatibility adapter lowers unconditional batches to `world.setBlocks` during `game.onStart` and conditional batches to the same host call during `game.onTick` while the condition is true.

## Ownership and cleanup

World batches mutate persistent Minecraft terrain. `portable/cleanup` **does not restore previous block states**. This matches ADR 0005's existing rule for script-owned projected terrain: generated entities/HUD/camera/scoreboards are runtime-owned resources, while projected blocks are persistent world geometry.

Tests and examples must therefore explicitly restore or clear any temporary footprint after acceptance testing.

## Non-goals

v8 does not make arbitrary `world.setBlock/setBlocks/fill` callback calls portable. It also does not add:

- runtime-created block-write arrays;
- dynamic block coordinates or dynamic block-state strings;
- block/entity queries;
- neighbor-update/redstone/gravity simulation semantics;
- rollback/snapshot of replaced terrain;
- runtime procedural generation, random topology, or unbounded loops.

The current procedural roguelike remains a gate-5 migration task because its topology generator depends on runtime collections/randomness/arbitrary TypeScript. v8 provides the target projection primitive that a future portable generator can feed, but does not itself solve that generator.

## Consequences

Positive:

- finite world setup/state projection can deploy as a normal vanilla datapack;
- batch size and coordinates are statically validated;
- generated commands have deterministic chunk loading around each chunk group;
- the compatibility backend uses the already-tested bounded `world.setBlocks` capability;
- world projection semantics no longer require a generic mutable host API for bounded scenes.

Tradeoffs:

- a held condition may rewrite the same blocks every tick; authors should use small batches or explicit edge/pulse state when repeated writes matter;
- terrain persists after datapack cleanup/removal;
- procedural retained games still need a later rewrite of their generator/control flow before Fabric can be deleted.

This decision extends ADR 0013, ADR 0005, and ADR 0007 while narrowing their mutable Fabric host API into a portable declarative subset.
