# ADR 0008: Allow inert Mob appearances for script actors

Status: accepted

## Context

The initial actor capability always projected a `minecraft:mannequin`. That is useful for player-like protagonists but makes enemy roles visually ambiguous in prototypes that should reuse Minecraft's existing creature silhouettes. Game scripts still need to own combat, health, movement, collision, and AI rather than delegating those rules to vanilla entities.

## Decision

Extend `actors.spawn(id, options)` with optional `entityType`. The default remains `minecraft:mannequin`. When a different type is requested, the runtime resolves it through the entity registry and accepts only Minecraft `Mob` types. The spawned Mob is presentation-only: AI, gravity, collision physics, ordinary damage, ambient sounds, daylight fire, and vanilla despawn are suppressed, while position and rotation remain controlled by `actors.move`. The runtime marks actor entities with an internal ownership tag and bypasses `Mob.checkDespawn` only for those actors, including Peaceful difficulty's hostile-mob discard. Script ownership tags and deterministic cleanup are unchanged.

`texture` remains specific to mannequin actors. Arbitrary non-Mob entity types are rejected so the actor capability cannot be used to spawn projectiles, explosives, vehicles, or other simulation-bearing entities.

## Consequences

- games can reuse recognizable vanilla silhouettes such as zombies and skeletons without a client mod or resource pack
- TypeScript remains authoritative for gameplay state and turn resolution
- actor movement/removal stays on direct server APIs
- the runtime must maintain inert Mob state each tick, including suppressing daylight fire and difficulty-driven despawn
- adding specialized Mob equipment, poses, or animation controls remains a future capability rather than exposing raw entity access
