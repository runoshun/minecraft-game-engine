# Architecture Decision Index

The repository has many ADRs because Portable evolved incrementally. **Do not read them in numeric order to understand the current engine.** The current design/API contract is `docs/architecture.md`; operational procedure is `docs/operations.md`. Use this index when you need the rationale or acceptance history behind a specific part of that contract.

## Recommended reading

For the current architecture, start with this small set:

1. [ADR 0009 — portable fixed-point IR](0009-portable-fixed-point-ir.md): the bounded deterministic IR model. The old Fabric-backend discussion is historical; the fixed-point/IR boundary remains foundational.
2. [ADR 0010 — portable TypeScript DSL](0010-portable-typescript-dsl.md): build-time TypeScript authoring over Portable IR. Fabric-adapter passages are historical.
3. [ADR 0013 — vanilla-first Portable](0013-vanilla-first-portable-v5.md): generated datapacks became the primary deployment target; the Fabric-retirement goal described there has since been completed.
4. [ADR 0018 — lifecycle v10](0018-portable-lifecycle-v10.md): generated ownership, reload, cleanup, and current position-lock camera lifecycle.
5. [ADR 0020 — multiplayer v12](0020-portable-multiplayer-v12.md): PlayerSet, PlayerContext, and player-local state/input semantics.
6. [ADR 0021 — Node portable compiler](0021-node-portable-compiler.md): current compiler/toolchain boundary and retirement of Java/Fabric.
7. [ADR 0033 — bounded local TypeScript modules](0033-bounded-local-typescript-modules.md): current source-module boundary.
8. [ADR 0038](0038-condition-authoring-sugar.md), [0039](0039-stable-if-else-dispatch.md), and [0040](0040-portable-compound-conditions-v27.md): current condition/control-flow authoring semantics.
9. [ADR 0041 — constant scalar arithmetic v28](0041-portable-constant-scalar-arithmetic-v28.md): current fixed-point constant multiplication/division semantics.

Everything else is primarily a capability-specific decision or historical context.

## Current capability decisions

These decisions describe capabilities that remain part of the current Portable model. Later ADRs may extend an earlier capability without replacing its base semantics.

### Rules, input, collision, and lifecycle

| ADR | Capability | Current role |
| --- | --- | --- |
| [0009](0009-portable-fixed-point-ir.md) | Fixed-point Portable IR | **Core.** Bounded state/rule semantics; Fabric backend passages are historical. |
| [0010](0010-portable-typescript-dsl.md) | TypeScript DSL frontend | **Core.** Build-time authoring model; Fabric adapter passages are historical. |
| [0011](0011-portable-camera-input-particles.md) | Held input, camera declaration, particles | **Partial.** Held input/camera declaration remain; its vanilla spectator-camera implementation was superseded by ADR 0018. |
| [0012](0012-portable-sound-text-hud-collision.md) | Sound, text, HUD, AABB collision | Active base capability. |
| [0013](0013-vanilla-first-portable-v5.md) | Vanilla-first deployment, repeat/visibility/circle collision | **Core strategy.** Fabric-retirement target is now completed. |
| [0014](0014-portable-pinball-v6.md) | Segment/capsule/trigger/flipper collision | Active arcade-collision capability. |
| [0018](0018-portable-lifecycle-v10.md) | Ownership/reload/cleanup, position-lock camera | **Core lifecycle.** Supersedes ADR 0011's vanilla spectator-camera implementation. |
| [0019](0019-portable-spectate-camera-v11.md) | Opt-in spectate camera | Active opt-in camera mode. |
| [0038](0038-condition-authoring-sugar.md) | `unless`, `choose`, `match` authoring sugar | Active authoring surface; no new IR version. |
| [0039](0039-stable-if-else-dispatch.md) | Stable if/else branch choice | Active control-flow semantic guarantee. |
| [0040](0040-portable-compound-conditions-v27.md) | `all` / `any` / `not` conditions | Active condition IR. |
| [0041](0041-portable-constant-scalar-arithmetic-v28.md) | Constant scalar `mul` / `div` | Active fixed-point arithmetic extension. |

### Presentation, world, and UI

| ADR | Capability | Current role |
| --- | --- | --- |
| [0015](0015-portable-presentation-v7.md) | Bounded actors and dynamic world text | Active base presentation model; actor fields later expanded by ADR 0032. |
| [0016](0016-portable-world-projection-v8.md) | Declarative world projection | Active bounded world-write model. |
| [0017](0017-portable-ui-input-v9.md) | Sidebar and held-input edge policy | Active bounded sidebar/input recipe. |
| [0030](0030-portable-selection-ui-v20.md) | Native selection UI | Active UI base; expanded by ADR 0031. |
| [0031](0031-portable-dialog-ui-v21.md) | Rich confirmation and typed forms | Active native-dialog UI. |
| [0032](0032-portable-actor-presentation-v22.md) | Mannequin profile/pose/equipment/pitch | Active actor-presentation extension. |

### Multiplayer, sessions, grids, and persistence

| ADR | Capability | Current role |
| --- | --- | --- |
| [0020](0020-portable-multiplayer-v12.md) | PlayerSet / PlayerContext / player-local state | **Core multiplayer model.** |
| [0022](0022-portable-procedural-grid-v13.md) | Runtime Grid, deterministic RNG, GridWorld | Active procedural-state model. |
| [0023](0023-portable-team-player-sets-v14.md) | External-team PlayerSets and audiences | Active team-membership model. |
| [0024](0024-portable-session-local-v15.md) | Session-local scalar/Grid/RNG | Active logical-session model. |
| [0025](0025-portable-session-grid-world-v16.md) | Session-local GridWorld projection | Active session projection model. |
| [0027](0027-portable-player-session-reductions-v17.md) | Player/session reductions | Active aggregation model. |
| [0028](0028-portable-persistent-state-v18.md) | Persistent scalar state | Active persistence model. |
| [0029](0029-portable-persistent-grid-v19.md) | Persistent Grid state | Active persistent-grid model. |

### Source composition, interaction, and placeables

| ADR | Capability | Current role |
| --- | --- | --- |
| [0021](0021-node-portable-compiler.md) | Node portable compiler | **Current toolchain.** Java/Fabric compiler/runtime is retired. |
| [0033](0033-bounded-local-typescript-modules.md) | Local TypeScript modules | Active source-composition boundary. |
| [0034](0034-portable-interaction-use-v23.md) | World interaction use | Active interaction primitive. |
| [0035](0035-portable-interaction-controller-v24.md) | Exact-player active-instance controller | Active controller-binding model. |
| [0036](0036-bounded-items-placeable-objects-v25.md) | Item templates and placeable objects | Active bounded placeable model. |
| [0037](0037-interaction-controller-camera-v26.md) | Controller-backed camera and return | Active controller-camera model. |

## Historical and transition decisions

These files are retained for rationale and project history. They are **not the place to learn the current implementation contract**.

| ADR | Historical role | Why it is not a current entry point |
| --- | --- | --- |
| [0001](0001-embedded-typescript-runtime.md) | Embedded GraalJS/TypeScript Fabric runtime | The Fabric/Java runtime has been retired; current compilation is Node-to-datapack. |
| [0002](0002-static-level-geometry.md) | Early static-geometry split | Predates the current Portable world/Grid projection model. |
| [0003](0003-direct-hot-path-apis.md) | Direct Java hot-path APIs | Fabric/Java host implementation is retired. |
| [0004](0004-presentation-boundary.md) | Early presentation-intent boundary | The conceptual boundary influenced Portable presentation, but its runtime implementation is historical. |
| [0005](0005-script-owned-procedural-geometry.md) | Procedural geometry in runtime TypeScript | Current procedural topology is expressed through bounded Grid/RNG semantics instead. |
| [0006](0006-server-observable-input-actions.md) | Fabric-era semantic input actions | Current input semantics live in Portable DSL/IR and generated datapacks. |
| [0007](0007-bounded-bulk-world-projection.md) | Java bulk world projection | Current world projection is compiler-generated datapack behavior. |
| [0008](0008-inert-mob-actor-appearances.md) | Fabric actor appearances | Current presentation uses bounded Portable actor/mannequin semantics. |
| [0026](0026-post-v16-capability-priority.md) | Post-v16 implementation roadmap | Most listed priorities were subsequently implemented in v17-v26; retain as planning history. |

## Version map

When diagnosing compatibility or generated IR, this is the compact version-to-decision map:

| Portable version | Primary ADR |
| --- | --- |
| v1 | [0009](0009-portable-fixed-point-ir.md) |
| v2 | [0010](0010-portable-typescript-dsl.md) |
| v3 | [0011](0011-portable-camera-input-particles.md) |
| v4 | [0012](0012-portable-sound-text-hud-collision.md) |
| v5 | [0013](0013-vanilla-first-portable-v5.md) |
| v6 | [0014](0014-portable-pinball-v6.md) |
| v7 | [0015](0015-portable-presentation-v7.md) |
| v8 | [0016](0016-portable-world-projection-v8.md) |
| v9 | [0017](0017-portable-ui-input-v9.md) |
| v10 | [0018](0018-portable-lifecycle-v10.md) |
| v11 | [0019](0019-portable-spectate-camera-v11.md) |
| v12 | [0020](0020-portable-multiplayer-v12.md) |
| v13 | [0022](0022-portable-procedural-grid-v13.md) |
| v14 | [0023](0023-portable-team-player-sets-v14.md) |
| v15 | [0024](0024-portable-session-local-v15.md) |
| v16 | [0025](0025-portable-session-grid-world-v16.md) |
| v17 | [0027](0027-portable-player-session-reductions-v17.md) |
| v18 | [0028](0028-portable-persistent-state-v18.md) |
| v19 | [0029](0029-portable-persistent-grid-v19.md) |
| v20 | [0030](0030-portable-selection-ui-v20.md) |
| v21 | [0031](0031-portable-dialog-ui-v21.md) |
| v22 | [0032](0032-portable-actor-presentation-v22.md) |
| v23 | [0034](0034-portable-interaction-use-v23.md) |
| v24 | [0035](0035-portable-interaction-controller-v24.md) |
| v25 | [0036](0036-bounded-items-placeable-objects-v25.md) |
| v26 | [0037](0037-interaction-controller-camera-v26.md) |
| v27 | [0040](0040-portable-compound-conditions-v27.md) |
| v28 | [0041](0041-portable-constant-scalar-arithmetic-v28.md) |

ADR 0038 and ADR 0039 change authoring/control-flow semantics without introducing a Portable version. ADR 0021 and ADR 0033 define compiler/source architecture rather than game IR versions.

## Maintenance rule

When adding a new ADR:

- update this index in the same change;
- put current API/semantic truth in `docs/architecture.md`, not only in the ADR;
- use the ADR for rationale, rejected alternatives, compatibility, and acceptance evidence;
- if a later decision supersedes all or part of an older ADR, mark that relationship here and in the affected ADR where practical;
- avoid creating an ADR for routine implementation detail that does not establish a durable architectural or semantic decision.
