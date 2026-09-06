# ADR 0003: Direct server APIs for hot-path actor and block operations

## Status

Accepted.

## Context

The first PoC implemented most capabilities by formatting Minecraft commands and sending them through the command dispatcher. This was convenient for validating the API surface, but the top-down roguelike produced a 45.6 ms script-tick warning with only a handful of actors. Actor transforms happen every tick, and block writes will become a similar bottleneck for dynamic/procedural worlds.

## Decision

Keep the TypeScript capability API unchanged, but move hot-path implementation behind it to direct server APIs:

- default `actors.spawn` constructs a mannequin entity directly and stores its Java reference per script
- `actors.move` mutates the tracked entity directly, including direct cross-dimension transfer
- `actors.remove` and script cleanup discard tracked actor entities directly
- `world.setBlock` resolves the block registry entry and calls `ServerLevel.setBlock` directly

Custom-texture mannequin spawning remains command-backed temporarily because profile/skin construction is not yet on the direct path. Camera and effects are also still command-backed and can be migrated independently without changing game scripts.

## Consequences

Per-tick actor movement and block writes no longer pay Brigadier command parsing and selector lookup costs. Runtime code must now own entity references carefully and clear them during reload/disable. `world.setBlock` performs normal server block updates and can synchronously obtain chunks, so this change does not make large unbounded world-edit loops free; a batched `world.fill`/bulk edit API remains the appropriate future primitive for map generation.
