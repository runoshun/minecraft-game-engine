# ADR 0018: Bound generated entity ownership in portable v10

Status: accepted as experimental API

## Context

ADR 0013 gate 4 requires generated-resource ownership, reload, and cleanup to be reliable without Fabric acting as a lifecycle safety net. Repeated vanilla acceptance runs exposed two concrete weaknesses in the v3-v9 backend.

First, Display/camera/marker entities can persist in unloaded chunks. The legacy compiler briefly `forceload add`ed an entity's declared initial chunk, immediately selected/killed the old entity, summoned its replacement, and removed the force-load in the same function. Chunk activation is not a useful synchronous ownership guarantee, and state-backed entities can later move away from that initial chunk. Repeated reloads could therefore leave a persisted old entity long enough to duplicate.

Second, the portable camera used persistent player state as part of ownership: it tagged the controller, changed that player to Spectator, and attached the spectator view to an armor stand. A player who was offline when `portable/cleanup` ran could not be selected, so the namespace tag and Spectator state could survive after the datapack had otherwise been cleaned.

## Decision

Portable IR v10 adds an optional bounded vanilla ownership region:

```ts
portableDsl({
  fixedPoint: 1000,
  ownership: {
    dimension: "minecraft:overworld",
    minX: 80,
    minZ: -24,
    maxX: 96,
    maxZ: 4,
  },
}, game => { /* ... */ });
```

The region is an inclusive block-coordinate rectangle in one dimension and may cover at most 64 chunks. Supplying it advances DSL output to portable v10. Programs without it retain the existing v9 output contract.

For v10 programs with an ownership region, the vanilla compiler applies these lifecycle rules:

- load initializes scalar state immediately, sets an internal `#ready` flag to zero, and force-loads the complete ownership region;
- persistent entity initialization is scheduled two ticks later, after the region has had time to become active;
- the scheduled initializer first kills every entity carrying the namespace-stable owner tag, then recreates all declared Display, actor, camera, and dynamic effect-anchor entities, and finally sets `#ready` to one;
- the regular tick function returns before game logic while `#ready` is zero;
- every v10 persistent entity receives both its resource-specific tag and the namespace-stable owner tag, so resources deleted or renamed between two v10 builds are still removed on reload;
- state-backed X/Z entity projection is clamped to the declared ownership rectangle before writing entity position, so a bad scalar value cannot move a generated entity outside the region whose chunks are kept loaded;
- `portable/cleanup` cancels pending initialization, disables tick execution, removes all namespace-owned entities in one selection, removes owned UI objectives, removes the ownership force-load, and finally removes the main state objective.

World batches are intentionally separate. They are persistent terrain mutations and retain the v8 chunk-grouped transient force-load/write/unload behavior from ADR 0016. The v10 ownership region exists for generated persistent entities, not for rolling back terrain.

The vanilla portable camera is also changed for all newly compiled programs. It no longer tags the controller, changes gamemode, or uses `spectate`. The owned armor stand remains the camera-position carrier, but each tick the first non-spectator controller is teleported to that carrier after input has been sampled. A real Minecraft 26.1 client remains fixed at the declared view while Adventure-mode A/D/Jump predicates continue to report input. Because the datapack no longer mutates persistent player gamemode or tags, an offline player no longer creates cleanup debt.

The current retained entity-heavy acceptance examples declare v10 ownership regions. Low-level IR v1-v9 remains readable/compilable for compatibility, but its legacy per-entity initial-chunk lifecycle is not the gate-4 guarantee.

## Consequences

Positive:

- reload replacement is namespace-wide rather than limited to the resource IDs present in the new build;
- generated entity selection is performed after the entire bounded scene region is force-loaded;
- moving generated entities remain inside the region where deterministic cleanup can select them;
- camera ownership no longer writes persistent state into a player, eliminating the offline-controller tag/gamemode failure mode;
- lifecycle acceptance can assert a stable owner-entity count across repeated reloads and zero owned entities/force-loads/objectives after cleanup.

Tradeoffs and limitations:

- an entity-heavy v10 scene must reserve one bounded ownership rectangle and keeps those chunks force-loaded while the pack is active;
- only one ownership dimension/rectangle is supported per portable program today;
- 64 chunks is a deliberate prototype bound, not a promise that large persistent worlds should be expressed as generated entity scenes;
- a controller is position-locked by teleport while a portable camera is active, so ordinary player movement is presentation input rather than physical movement;
- v1-v9 generated packs retain their old lifecycle semantics for compatibility and should not be used as evidence for ADR 0013 gate 4;
- terrain written by `worldBatch`/`worldFill` still persists after cleanup by design.

ADR 0018 supersedes ADR 0011's vanilla spectator-camera implementation while retaining ADR 0011's held-input and camera declaration APIs.