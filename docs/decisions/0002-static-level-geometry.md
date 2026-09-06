# ADR 0002: Keep static level geometry separate from gameplay TypeScript

Status: accepted

## Context

The embedded TypeScript runtime is optimized for gameplay iteration with `/reload`. Rebuilding a large arena from script code on every reload is slow, destroys useful world state, and would require broad bulk-world-edit APIs in the runtime before those APIs are otherwise justified.

## Decision

Gameplay-authoritative state and rules live in TypeScript. Static map construction may remain a datapack function or be performed by mc-mcp/world-edit tooling. TypeScript may mutate dynamic world elements such as gates through the capability API.

The top-down roguelike example therefore provides `topdown_ts:arena/build` as a static level build function while movement, collision, combat, enemy AI, room progression, and camera transitions are TypeScript-owned.

## Consequences

- `/reload` can reset game logic without rebuilding the arena.
- mc-mcp remains useful as the level setup/test control plane.
- the runtime does not need a bulk `fill` API solely for this example.
- collision rules duplicated from static geometry must be kept aligned until a future query/map-description API replaces that duplication.
