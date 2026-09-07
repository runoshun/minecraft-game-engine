# ADR 0007: Add bounded bulk world projection APIs

Status: accepted

## Context

`world.setBlock` already bypasses Brigadier, but one Graal-to-Java call and normal neighbor updates per block are still expensive for procedural terrain projection. The top-down roguelike must replace thousands of blocks when rebuilding a floor.

## Decision

Preserve `world.setBlock` with normal `Block.UPDATE_ALL` semantics and add two projection-oriented operations:

- `world.setBlocks({ dimension?, blocks })` for heterogeneous block writes
- `world.fill(...)` for one rectangular block state

Both operations are capped at 32,768 writes per call. They execute the loop in Java, cache registry resolution within a batch where useful, notify clients, suppress drops, and mark shapes known while intentionally skipping neighbor updates.

These APIs are for terrain/presentation projection, not simulation-sensitive redstone, gravity, or neighbor-dependent block mechanics. Large jobs may still be spread across ticks because chunk acquisition remains synchronous.

## Consequences

- procedural games avoid thousands of host-boundary calls
- projection writes avoid the cost of ordinary neighbor propagation
- `world.setBlock` remains available when normal Minecraft update semantics matter
- bulk calls are bounded to prevent a script from requesting an unbounded edit in one host call
