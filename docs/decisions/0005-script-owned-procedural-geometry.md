# ADR 0005: Keep procedural dungeon topology in game scripts and amortize world projection

Status: accepted

## Context

ADR 0002 keeps hand-authored static level construction outside gameplay TypeScript so `/reload` does not rebuild a large arena and the runtime does not need a broad world-edit API solely for static content.

A procedural roguelike has a different ownership requirement: the generated topology is gameplay state. Room placement, corridor connectivity, spawn positions, exit selection, collision, and the generation seed must agree exactly with the game rules. Treating the Minecraft blocks as the source of truth would duplicate or invert that ownership.

The runtime originally exposed only `world.setBlock`. ADR 0007 now adds bounded bulk projection APIs that reduce host-boundary and neighbor-update overhead while retaining synchronous chunk acquisition.

## Decision

Procedural dungeon topology is owned by the TypeScript game script. The script first generates an in-memory tile map and validates its gameplay invariants, then projects that map into a fixed Minecraft world footprint.

The example projects through bounded `world.setBlocks` calls and still amortizes larger jobs across ticks:

- queue the required block writes after dungeon generation
- execute only a bounded number of writes per server tick, grouped into one bulk call
- keep gameplay input disabled until the queue is complete
- rewrite the same fixed footprint on every floor/reload so stale generated geometry is reconciled deterministically
- keep generation seed-based so tests can reproduce a floor exactly

`examples/topdown-roguelike` uses this pattern. Its optional `topdown_ts:arena/build` function is cleanup/setup tooling only and is not the generated level's source of truth.

## Consequences

- dungeon topology, collision, enemy placement, loot placement, and exit reachability have one gameplay-authoritative representation
- procedural generation can be tested without inspecting Minecraft blocks
- `/reload` no longer depends on a hand-authored arena matching duplicated collision rectangles
- world projection takes multiple ticks, so the example exposes a short generating state before play begins
- generated blocks are persistent world geometry rather than runtime-owned entities; removing the datapack does not automatically restore prior terrain
- `world.setBlocks` is the projection adapter; the dungeon generator and turn rules remain independent of Minecraft block-write mechanics
- ADR 0002 remains the rule for hand-authored static geometry; this ADR supersedes only its example-specific assumption that the top-down roguelike itself is static
