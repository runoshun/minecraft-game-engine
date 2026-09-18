# Architecture

## Purpose and authority

Minecraft Game Engine is a TypeScript-to-vanilla-datapack game compiler. Game logic is authored with `portableDsl`, lowered to versioned Portable IR, then compiled to ordinary Minecraft 26.1 datapack resources.

The normal workflow is:

```text
edit TypeScript -> compile portable source -> deploy/reload datapack -> play/test/capture
```

This file is the source of truth for the **current** design, public semantics, ownership, and lifecycle. Historical rationale and version-by-version evolution live in [the ADR index](decisions/README.md). Compile/deploy/acceptance procedures live in [operations.md](operations.md).

There is no Java/Fabric runtime in the repository and none is required by a deployed game.

## Responsibility boundaries

| Component | Responsibility |
| --- | --- |
| TypeScript game source | Game-specific state, rules, collision response, progression, UI values, and declarative presentation, expressed only through the portable API. |
| Node portable compiler | TypeScript loading/transpilation, isolated DSL evaluation, Portable IR validation, and deterministic datapack generation. |
| Portable IR | Versioned bounded semantic contract between authoring and vanilla lowering. Current version: **v28**. |
| Generated datapack | Runtime functions, scoreboards/storage, predicates, generated entities/resources, lifecycle functions, and optional persistent data. |
| Minecraft 26.1 | Executes mcfunctions and supplies vanilla world state, player input, entities/Displays, dialogs, sound, particles, scoreboards, and networking. |
| mc-mcp | Development/test/deployment control plane only; never gameplay logic or a deployment dependency. |

## Compiler and source model

The compiler entry point is `tools/portable-compiler/cli.mjs`. It accepts one TypeScript entry source, namespace, and output directory.

Static relative TypeScript imports/re-exports are allowed under the entry source directory. The source graph is limited to 64 modules and 1,000,000 aggregate source bytes. Node built-ins, npm/bare packages, non-TypeScript modules, dynamic import, authored `require`, cycles, and real-path/symlink escapes are rejected.

Accepted modules are transpiled with bundled TypeScript 5.9.2 to ES2022/CommonJS-shaped output and evaluated inside a compiler-owned Node `vm` context. The context exposes the bundled `portableDsl` frontend and registration-only stubs, not filesystem, network, package resolution, host `require`, or live Minecraft state. Exactly one portable program is captured, parsed, validated, and lowered.

The `vm` boundary is build-tool containment; it is not specified as a hostile-code security sandbox.

Portable IR is deliberately narrower than JavaScript. Ordinary runtime JavaScript callbacks, dynamic collections, host objects, and arbitrary commands are not IR semantics. Build-time helpers such as local functions, modules, and `game.repeat(...)` may expand declarations/actions, but runtime behavior must still lower to bounded Portable IR.

## Portable execution model

### Numbers and scalar state

Portable numbers are signed 32-bit fixed-point integers; `fixedPoint` defaults to 1000.

Mutable scalar state exists in global, session, player-local, persistent, session-persistent, and placeable-local scopes as applicable. Mutable state supports:

```ts
state.set(value)
state.add(value)
state.sub(value)
state.negate()
state.mul(constantNumber)
state.div(constantNumber)
```

`mul` and `div` accept compile-time numbers only. The compiler quantizes the coefficient to the program fixed-point scale, reduces the resulting ratio by GCD, and lowers it to scoreboard arithmetic. A divisor that quantizes to zero is rejected. Generic state-by-state multiplication/division and arbitrary expression trees are not supported.

Minecraft scoreboard arithmetic remains signed 32-bit and generated code does not provide generic overflow protection.

### Rules and conditions

`game.tick(fn)` captures the ordered runtime action tree. `game.when(condition, then, else?)` is the primitive branch.

Authoring helpers `unless`, ordered first-match `choose`, and equality-dispatch `match` expand to the same branch IR. Branch selection is stable: if a chosen branch mutates values used by its condition, the sibling `else` path cannot subsequently run in the same decision.

Conditions support scalar comparisons plus bounded recursive composition through:

```ts
game.condition.all(...)
game.condition.any(...)
game.condition.not(...)
```

Compound conditions may guard actions, reductions, and supported declarative `when` fields. They are bounded to 16 children per `all`/`any`, depth 8, and 64 total nodes.

`game.repeat(count, fn)` is declaration-time expansion, not a runtime loop.

### Player, team, and session scopes

`game.players()` denotes all online participants. `game.teamPlayers(name)` denotes online members of an externally managed vanilla scoreboard team. The compiler never owns team creation or membership.

`game.forEachPlayer(players, player => ...)` creates a lexical `PlayerContext`. Player-local references cannot escape it. `player.state(...)` is stored independently per real player, and `player.input` samples:

- `hotbarSlot`
- `forward`, `backward`, `left`, `right`
- `jump`, `sneak`, `sprint`

Multi-player `forEachPlayer` may mutate player-local state but may not arbitrarily mutate shared/session-shared state. `forSinglePlayer` executes only when the selected `PlayerSet` contains exactly one online player and may perform deterministic shared mutation from that exact player.

Disconnect preserves player-local active-instance state; reload/replacement resets it. Cleanup removes the complete compiler-owned player objective banks, including offline entries.

`game.session(id, teamPlayers, session => ...)` binds one compile-time logical session to one team-backed `PlayerSet`. A session has independent scalar state, Grid, RNG, persistent state/Grid, reductions, player iteration, and optional GridWorld projection. Session references are lexical and may not escape into another session or global scope.

Sessions may reuse the same local names because lowering qualifies storage by session slot. An empty team does not delete the logical session. Session state is active-instance state unless explicitly persistent.

The compiler does not provide runtime matchmaking, arbitrary player identity values, UUID/name lookup, or dynamic session allocation.

## Structured runtime data

### Grid and RNG

`game.grid` and `session.grid` declare fixed-size 2D integer-coordinate grids whose cell values use the program fixed-point representation. Supported operations include `fill`, `get`, `set`, and clipped `fillRect`; out-of-bounds reads return the declared `outside` value and writes are ignored.

Dynamic grid indexing lowers through compiler-private Minecraft function macros/storage. Raw macro/storage access is not exposed to game source.

`game.rng` and `session.rng` declare deterministic versioned random streams with bounded integer sampling and reset. RNG state is active-instance state.

### GridWorld

`game.gridWorld` and `session.gridWorld` project one Grid cell per Minecraft block into an explicit fixed footprint. Projection is incremental, exposes read-only `ready`, and advances in bounded `cellsPerTick` slices after authored rules.

Session GridWorld footprints must lie inside the program ownership rectangle and may not overlap another session-local footprint at the same dimension/Y. Separate footprints isolate terrain state, not client visibility.

Projected terrain is persistent Minecraft world state. Reload may deterministically rebuild it; `portable/cleanup` does **not** restore blocks.

### Reductions

Global and session reductions support `count`, `sum`, `min`, `max`, `any`, and `all` over a `PlayerSet`.

Reduction selector callbacks are read-only lexical PlayerContexts. Empty-set results are:

| Reduction | Empty result |
| --- | --- |
| `count` | 0 |
| `sum` | 0 |
| `any` | false / 0 |
| `all` | true / 1 |
| `min`, `max` | explicit author-supplied fallback |

Results use normal fixed-point state.

### Persistent state

`game.persistentState` / `session.persistentState` store fixed-point scalars that survive reload, ordinary cleanup, and same-namespace pack replacement.

`game.persistentGrid` / `session.persistentGrid` provide the same persistence model for bounded Grids, stored in compiler-private namespace command storage.

Every persistent declaration has an integer schema and `onSchemaMismatch: "reset" | "preserve"`. Scalar preserve keeps the value while advancing the schema marker. Persistent Grid preserve applies only when width/height still match; shape changes always reset.

Lifecycle is explicit:

```text
portable/cleanup            preserve persistent data
portable/reset_persistent   restore current declared defaults/schema
portable/purge_persistent   destructively remove persistent data/infrastructure
```

There are no migration callbacks, cross-namespace persistent references, persistent arbitrary collections, or persistent player/offline identity.

## Collision

Collision is deterministic **logic-space** collision, not Minecraft hitbox/world querying. Supported primitives are:

- inclusive 2D AABB/AABB overlap;
- quantized circle/circle overlap;
- circle/static-segment and circle/static-capsule overlap;
- AABB center-point trigger zones;
- two-pose flippers represented by condition-selected static capsules.

Collision only detects overlap. The game owns response such as velocity changes, scoring, damage, sound, and state transitions.

## Presentation, world, and UI

### Displays and actors

The compiler supports bounded declarative block Displays and text Displays with state-backed coordinates, transforms, visibility conditions, and bounded text tokens.

`game.actor` owns static mannequin declarations with state-backed position/yaw/pitch and optional lifetime condition. Actor presentation may include resource-backed wide/slim profile, hidden skin layers, pose, main-hand preference, and item-id equipment. Zombie/skeleton semantic appearances use mannequin carriers with vanilla mob-head fallback.

Actor profiles are resource-backed, not player-identity lookup. Runtime actor creation, arbitrary entity NBT, arbitrary limb animation, and generic entity mutation are not part of the API.

### World projection

`worldBatch` and `worldFill` declare bounded block writes. Generated writes are chunk-grouped and may use temporary force-loads. Written terrain intentionally survives compiler cleanup.

### HUD and sidebar

The engine supports one shared actionbar HUD, up to eight player-local HUD declarations, and one server-global vanilla scoreboard sidebar with up to 15 rows.

Independent per-player vanilla sidebars are not supported.

### Camera

A camera is compiler-owned presentation; it never owns player gamemode.

`position_lock` teleports matching non-Spectator audience players to an owned carrier each tick. `spectate` targets audience players already in Spectator; entering/leaving Spectator remains external lifecycle.

Static camera audiences use a `PlayerSet`. Up to eight cameras may be declared when their static team audiences are disjoint.

Exactly one controller-backed `position_lock` camera may instead use an `InteractionController` as its dynamic audience. Controller-backed spectate, multiple dynamic controller cameras, and arbitration between competing dynamic camera owners are unsupported.

### Native dialog UI

Static selection/confirmation/form surfaces lower to Minecraft native dialogs.

Selections support bounded static option lists and cancel results. Confirmations return authored yes/no values. Forms support exactly one boolean, single-option, or integer-range input. Handles are player-local, `open()` is idempotent while pending, a resolved result remains readable until `clear()`, and opening another generated surface rearms/replaces the previous pending generated surface.

Dialog return transport is compiler-owned `/trigger` state. Game source cannot supply arbitrary commands, objective names, registry ids, dynamic click handlers, free-form text input, or generic multi-field forms.

Generated dialog definitions are registry resources. Adding/changing/removing them requires the restart workflow documented in `docs/operations.md`; ordinary reload is valid after registry bootstrap.

## Interactions, controllers, and placeables

### World interaction

`game.interaction(id, spec)` declares a compiler-owned `minecraft:interaction` hitbox with bounded position/size/response and optional lifetime condition.

Its single root-tick `onUse(player => ...)` callback executes as the exact player recorded by Minecraft. The interaction record is consumed after dispatch, so a use is edge-like rather than replayed every tick. The API does not promise queuing if multiple vanilla interaction records collapse before one compiler tick.

### Interaction controller

An interaction exposes an active-instance controller:

```ts
interaction.controller.claim(player)
interaction.controller.forPlayer(player => ...)
interaction.controller.returnToInteraction(player)
```

Claim binds the exact clicker through compiler-private generation tokens, not names, UUIDs, public tags, or arbitrary identity values. A newer claim invalidates older tokens. Disconnect/reconnect resumes control only while no newer claim advanced the generation.

Controller state is intentionally reload-scoped. Reload resets generations/tokens for online and offline players; cleanup removes the entire controller bank.

`returnToInteraction` returns the exact current controller to the source interaction when it still exists and advances generation so the same tick cannot recapture that player.

### Item templates and placeable objects

`game.item` declares compiler-known item appearance metadata. Supported appearance is either a player-head texture URL under `textures.minecraft.net` or a static `minecraft:item_model` resource id. These are item templates, not registration of new native Minecraft item types.

`game.placeable(id, { item, maxInstances, orientation: "cardinal" }, instance => ...)` expands a fixed slot pool. Placement uses a compiler-controlled marker carrier, records an anchor/cardinal orientation, and creates bounded local presentation/state/interactions. Full-capacity, wrong-dimension, and outside-ownership placements are rejected and refunded.

Each active slot may own local scalar state, block/text/item Displays, interactions/controllers, collision declarations, and tick rules. Child interaction controller generations are slot-qualified so stale tokens cannot revive after slot reuse.

Placeables are active-instance state: pickup/removal frees the slot; reload clears pending/active instances and controller tokens. Persistent placed furniture and native block semantics are not implemented.

## Generated lifecycle

Programs that own generated entities may declare one ownership rectangle covering at most 64 chunks.

Load/reload converges namespace-owned resources:

1. initialize compiler-owned objectives/state and set readiness false;
2. force-load the bounded ownership region when required;
3. cancel/remove stale namespace-owned entities;
4. recreate declared runtime entities/resources;
5. mark readiness true before authored tick logic proceeds.

Dynamic generated entity X/Z coordinates are clamped to the ownership rectangle.

`portable/cleanup` cancels pending initialization, removes compiler-owned entities/objectives/HUD/sidebar/controller/placeable state and owned force-loads, and leaves player gamemode and externally managed teams untouched. Persistent state/Grid storage is preserved unless explicit reset/purge functions are used. World terrain written by projection APIs is also preserved.

Historical v1-v9 generated packs retain their older cleanup layout for compatibility; newly compiled current sources use the current lifecycle rules implied by the features they declare.

## Generated output

A generated pack contains at least:

```text
<output>/
├── .mcgame-portable-generated
├── pack.mcmeta
└── data/
    ├── minecraft/tags/function/{load,tick}.json
    └── <namespace>/
        ├── function/portable/*.mcfunction
        ├── predicate/portable/input/*.json       # when held input is used
        ├── dialog/portable/selection/*.json      # when selection/confirmation is used
        └── dialog/portable/form/*.json           # when typed forms are used
```

Generated artifacts belong under `build/` and are not committed.

## Compiler-enforced bounds

The compiler owns the exact validation. These are the principal current limits:

| Resource | Limit |
| --- | ---: |
| Global scalar states / inputs | 128 states / 32 inputs |
| Player-local states | 32 |
| Team PlayerSets / sessions | 8 / 8 |
| Session scalar states | 64 per session |
| Global Grids / RNG streams / GridWorlds | 4 / 4 / 4 |
| Grid dimensions / cells | max 64 × 64, max 2,048 cells per Grid |
| Session Grid cells | 16,384 aggregate |
| Session GridWorlds | 4 per session, 16 aggregate, 16,384 projected cells aggregate |
| Persistent scalar states | 64 aggregate |
| Persistent Grids | 8 aggregate, 16,384 cells aggregate |
| Reductions | 64 |
| Block projections / text / actors / interactions | 64 each |
| World batches / writes | 32 batches / 32,768 writes |
| Cameras / player HUDs | 8 / 8 |
| Shared HUD / sidebar | 1 / 1; sidebar max 15 rows |
| Selections / options | 8 surfaces, max 16 options |
| Forms / form options | 8 forms, max 16 option values |
| Item templates / placeable types | 32 / 8 |
| Placeable instances | 16 per type, 32 aggregate |
| Placeable state | 16 fields per type, 256 expanded cells aggregate |
| Placeable child presentation | 256 expanded declarations |
| Ownership region | 64 chunks |
| Runtime actions / nesting | 2,048 actions / depth 16 |
| Compound conditions | 16 children, depth 8, 64 nodes |

Other field-specific bounds are enforced by the parser/DSL and should remain implementation-aligned with these architectural limits.

## Current limitations

The engine intentionally does not provide arbitrary JavaScript-at-runtime semantics, generic arrays/maps/sets, arbitrary command/NBT/storage escape hatches, generic Minecraft entity/world queries, runtime-created actors/interactions/placeables, arbitrary player identity values, dynamic matchmaking, or unrestricted UI/event dispatch.

Notable capability gaps include persistent player/offline identity, persistent placed furniture, native custom block semantics, standalone/general custom-item behavior, free-form or generic multi-field forms, independent per-player vanilla sidebars, private client-only world scenes, per-player camera coordinates, multiple/dynamic controller-camera arbitration, 3D/swept collision, pathfinding/topology helpers, and generic runtime collections beyond the bounded Grid/fixed-slot models.

## Examples and validation

`examples/` is a human-facing reference surface, not a version archive. The retained examples are documented in `examples/README.md`. Narrow version-gating and lowering behavior belongs in `tools/portable-compiler/test/`.

Compiler changes must keep the Node regression suite green. Behavior that depends on Minecraft semantics requires focused mod-free Minecraft 26.1 validation according to `docs/operations.md`.

Historical rationale and acceptance evidence belong in the ADRs; use `docs/decisions/README.md` to find the relevant decision.
