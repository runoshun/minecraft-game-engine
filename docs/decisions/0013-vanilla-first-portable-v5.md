# ADR 0013: Make generated vanilla datapacks the primary backend and add portable IR v5

Status: accepted as experimental architecture

## Context

The original runtime treated the Fabric mod as the primary execution environment: TypeScript was transpiled and executed by GraalJS inside the server, and Minecraft capabilities were exposed through host APIs. Portable IR began as a restricted compatibility path, but v4 demonstrated that ordinary arcade requirements—held input, fixed camera, deterministic fixed-point rules, Display projection, particles, sound, actionbar HUD, and AABB collision—can be compiled into a standalone Minecraft 26.1 datapack.

Keeping Fabric as the mandatory deployment path now imposes a substantial maintenance surface (GraalJS lifecycle, Mixins, direct Minecraft Java APIs, entity-reference recovery, watchdogs, and runtime script isolation) on games that no longer need those capabilities. The project should therefore optimize toward removing the server mod rather than expanding it indefinitely.

A complete brick-breaker also exposes two gaps in v4: declarations need a bounded way to create many similar static objects, and projections need state-controlled visibility so a brick can disappear without Fabric `render.remove`. Pinball additionally needs circular collision primitives.

## Decision

The generated vanilla datapack backend is the **primary deployment target** for new portable games. `portableDsl` and versioned Portable IR are the product boundary. The Fabric runtime remains available as an optional development/compatibility backend while capability gaps still exist; new gameplay features should be added to the portable IR/vanilla compiler first unless they are inherently impossible in vanilla.

Portable IR version 5 adds:

- `game.repeat(count, builder)`, a TypeScript-DSL compile-time unrolling helper for bounded static collections. It does not add a runtime loop or dynamic collection to the IR;
- conditional `game.block(..., { when })` and `game.text(..., { when })` projection visibility. The vanilla backend keeps the owned Display entity and changes `transformation.scale` between its declared scale and zero; the Fabric adapter spawns/removes the corresponding render node;
- `game.circle(id, { x, y, radius })` and circle/circle `game.whenColliding(...)`;
- low-level `if_circle` IR actions for deterministic circle overlap branches.

Circle collision is performed in bounded logic-space coordinates. To avoid overflowing Minecraft's 32-bit scoreboard arithmetic when squaring fixed-point deltas, both backends quantize circle distance to approximately 0.01-block units before squaring. This is an arcade collision primitive, not a general physics engine or a Minecraft entity-hitbox query.

`game.whenColliding` in v5 accepts box/box or circle/circle pairs. Mixed box/circle, segment/capsule, swept collision, rotation, and physical response remain future primitives rather than implicit behavior.

The reference `portable-breakout-core` uses compile-time expansion for its brick field. Each brick owns a scalar alive state, static AABB, and conditionally visible block projection. The output is ordinary scoreboard/mcfunction/Display logic and does not require Fabric at deployment time.

## Fabric retirement target

The Fabric server runtime may be removed when all of these gates are satisfied:

1. the reference brick-breaker runs end-to-end from DSL-generated vanilla datapack output, including brick destruction/reset, score, lives, input, camera, HUD, sound, and effects;
2. a representative pinball prototype runs from generated vanilla output, including the collision/trigger primitives needed for bumpers and flippers;
3. required game-facing UI/input capabilities have portable vanilla mappings, or have been explicitly declared out of scope;
4. generated-resource ownership, reload, and cleanup are reliable enough that the mod is not needed as a lifecycle safety net;
5. the normal development workflow no longer relies on arbitrary runtime TypeScript callbacks or Fabric-only host capabilities.

Until those gates are met, Fabric is a compatibility and rapid-iteration backend, not the architectural source of truth for new game capabilities.

## Consequences

Positive:

- deployment of supported games requires only vanilla Minecraft 26.1 plus the generated datapack;
- game APIs are forced toward deterministic, backend-neutral semantics rather than Minecraft Java implementation details;
- static object fields such as brick grids no longer require hand-written declarations;
- state-controlled presentation can represent destruction/activation without runtime entity APIs;
- circle collision establishes the first pinball-oriented physics primitive;
- deleting the Fabric runtime becomes a measurable engineering goal rather than a hypothetical future rewrite.

Tradeoffs:

- the DSL is intentionally not arbitrary TypeScript at runtime; compile-time loops may generate many IR states/actions/functions;
- generated datapacks can become large, so compiler optimization and bounded declaration limits remain important;
- visibility is currently implemented by zero-scaling owned Displays rather than despawning them;
- circle collision is quantized and circle/circle only in v5;
- Fabric-only menus, sidebar panels, generic render/actors, world mutation APIs, dynamic collections, persistence, and arbitrary callbacks still block immediate mod removal for games that depend on them.

This ADR extends ADR 0009 through ADR 0012. Where older documents describe Fabric as the preferred/default deployment backend, this decision supersedes that preference for portable games.
