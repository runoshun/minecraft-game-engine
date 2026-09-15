# Architecture

## Goal

Minecraft Game Engine is a TypeScript-to-vanilla-datapack game compiler. Minecraft owns the world, rendering, player entities/input, audio, particles, networking, and client. Portable game logic is authored with `portableDsl`, lowered to versioned Portable IR, then compiled to ordinary Minecraft 26.1 datapack resources.

The canonical workflow is:

```text
edit main.ts/local .ts modules -> npm run compile:portable -> deploy/reload datapack -> play/test/capture -> edit source
```

There is no Java/Fabric runtime in the repository. ADR 0021 records the compiler migration and retirement order.

## Responsibility boundaries

### TypeScript game source

Owns game-specific state, rules, collision response, progression, UI values, and declarative presentation. Source must stay inside the portable API if it is expected to compile.

### Node portable compiler

Owns build-time TypeScript transpilation, `portableDsl` evaluation, Portable IR validation, and datapack generation. The implementation lives under `tools/portable-compiler/`.

The compiler accepts one entry TypeScript source, namespace, and output directory. ADR 0033 adds bounded local module authoring: static relative imports/re-exports may resolve `.ts` files inside the entry source directory, while host/package/dynamic module access remains unavailable.

### Portable IR

Portable IR is the versioned semantic contract between authoring and vanilla lowering. It contains deterministic fixed-point values, bounded actions, collision primitives, declarative presentation/world resources, input mappings, and lifecycle metadata. Arbitrary JavaScript callbacks are not an IR feature.

IR versions 1 through 23 are implemented. ADR 0020 defines the multiplayer v12 contract, ADR 0022 defines the procedural grid/RNG v13 contract, ADR 0023 defines team-backed PlayerSets and partitioned player audiences in v14, ADR 0024 defines team-bound logical sessions in v15, ADR 0025 defines session-local GridWorld projection in v16, ADR 0027 defines bounded player/session reductions in v17, ADR 0028 defines bounded persistent scalar state in v18, ADR 0029 defines bounded persistent Grid state in v19, ADR 0030 defines bounded native-dialog selection UI in v20, ADR 0031 defines bounded rich/typed native-dialog UI in v21, ADR 0032 defines bounded expanded mannequin actor presentation in v22, and ADR 0034 defines bounded world right-click interaction input in v23.

### Generated datapack

The generated directory is the deployment artifact. It owns namespace-derived scoreboards, functions, predicates, generated entities, optional ownership-region force-loads, HUD/sidebar resources, v20+ dialog registry resources and selection/form objectives when declared, compiler-private persistent storage/objectives when declared, and `portable/cleanup` / persistence lifecycle functions.

The target Minecraft server needs no compiler, Node.js, TypeScript, Java, Fabric, or mod.

### Minecraft 26.1

Minecraft executes generated mcfunctions and supplies vanilla-observable player input, entities, Displays, terrain, particles, sounds, camera observation, scoreboards, and networking.

### mc-mcp

`mc-mcp` is the development/test control plane for deploying datapacks, issuing commands, driving test clients, inspecting state, and capturing evidence. It is not a runtime dependency of a deployed game.

## Compiler pipeline

`tools/portable-compiler/cli.mjs` performs:

1. resolve the entry `main.ts` plus static local TypeScript imports/re-exports, bounded to 64 modules and 1,000,000 aggregate source bytes;
2. reject non-relative/package/host/non-TypeScript/dynamic/cyclic or source-root-escaping module dependencies, including real-path symlink escapes;
3. transpile each accepted module through bundled TypeScript 5.9.2 targeting ES2022 with CommonJS-shaped module output;
4. create an isolated Node `vm` context and install the bundled `portableDsl` frontend plus registration-only host stubs;
5. evaluate the validated module graph with a compiler-owned in-context loader that has no host `require`, package resolver, filesystem, or network access;
6. capture exactly one `portable.define(...)` result;
7. parse and validate Portable IR for the declared version;
8. lower the IR to a standalone datapack;
9. write `.mcgame-portable-generated` so later compiler runs may safely replace the generated directory.

Live Minecraft host capabilities are unavailable during extraction. A source that calls runtime-only host inspection APIs cannot compile; `game.players()` in v12 is a declarative `PlayerSet` constructor, not live player enumeration during compilation. Local modules are build inputs only: game source cannot call Node `require`, resolve npm packages, dynamically import files, or access arbitrary filesystem/network APIs. The host compiler reads only the validated `.ts` graph below the entry source directory. The `vm` boundary is a build-tool containment measure and has not been audited as a hostile-code security boundary.

Compiler assets live under `tools/portable-compiler/assets/`:

- `typescript.cjs` — bundled TypeScript 5.9.2;
- `portable-dsl.js` — authoring frontend that lowers DSL declarations to `portable.define(...)`.

## Portable IR v1-v11

### Values and state

Portable numbers use signed 32-bit fixed-point integers. `fixedPoint` defaults to 1000. Values are constants, shared state references, or shared input references.

`game.state(name, initial)` returns a mutable state reference with `set`, `add`, `sub`, `negate`, and comparison helpers. `game.input(...)` returns a read-only input reference. State/input names and collection counts are bounded by compiler validation.

### Tick rules

`game.tick(fn)` records the ordered action tree. Mutations and `game.when(...)` are valid only while an action sink is being captured. Multi-action branches become generated branch functions and comparisons lower to scoreboard `execute if/unless score` conditions.

`game.repeat(count, fn)` is build-time declaration expansion; no runtime loop is emitted.

### Input

v1-v11 use global `first_player_*` bindings. Supported sources are hotbar slot plus held `forward`, `backward`, `left`, `right`, `jump`, `sneak`, and `sprint`.

Held inputs lower to Minecraft 26.1 `minecraft:entity_properties` player predicates. The current controller is the first non-spectator player for ordinary `position_lock` programs and the first spectator player when the v11 camera uses `spectate`.

Rising edges are authored from ordinary state, e.g. storing the previous held value and testing `current == 1 && previous == 0`.

### Collision and rule primitives

Implemented deterministic logic-space primitives include:

- inclusive 2D AABB/AABB overlap;
- quantized circle/circle overlap;
- circle/static-segment and circle/static-capsule overlap;
- AABB center-point trigger zones;
- two-pose flippers represented by condition-selected static capsules.

Collision detects overlap only. The game owns velocity, score, damage, sound, and other response.

### Presentation

The compiler supports bounded declarative:

- block Displays with state-backed coordinates, scale/translation, and optional visibility condition;
- text Displays with literal/state/input tokens, state-backed coordinates, scale, billboard, and optional visibility;
- mannequin actors with state-backed position/yaw/pitch and optional lifetime condition; v22 adds bounded static profile/skin-layer/pose/hand/equipment presentation, while zombie/skeleton semantic appearances still use mannequin carriers with vanilla mob-head fallback;
- v23 compiler-owned `minecraft:interaction` hitboxes with state-backed position, optional lifetime condition, static width/height/response, and right-click dispatch to the recorded player;
- particle and sound emitters with optional conditions;
- one actionbar HUD;
- one global vanilla scoreboard sidebar with 1..15 rows;
- one camera carrier.

Player-private world scenes and independent per-player sidebars are not v11 features.

### World projection

`worldBatch` and `worldFill` produce bounded compile-time block writes. Writes are grouped by chunk and emitted as `setblock` functions with temporary force-loads. Terrain writes intentionally persist after `portable/cleanup`; acceptance teardown must restore temporary footprints explicitly.

### Camera

v10 default `position_lock` owns one invisible armor-stand carrier and teleports the selected non-spectator controller to it each tick. It does not change player gamemode or create persistent controller tags.

v11 `mode: "spectate"` instead selects the first player already in Spectator and issues `spectate` against the same owned carrier. Entering/leaving Spectator remains external session lifecycle. Cleanup does not change gamemode.

## Generated lifecycle

### Shared scoreboard state

Load creates one namespace-derived objective and initializes declared state/input holders plus compiler scratch constants. Cleanup removes the objective.

### Entity ownership v10+

Programs may declare one bounded ownership rectangle, maximum 64 chunks. While active, those chunks remain force-loaded. Load sets `#ready=0`, schedules owned entity initialization two ticks later, removes all entities carrying the namespace-stable owner tag, recreates declarations, then sets `#ready=1`. Tick logic is gated on readiness.

Dynamic generated entity X/Z positions are clamped to the ownership rectangle. Namespace replacement therefore converges to one owned entity set instead of accumulating duplicates across reloads.

`portable/cleanup` cancels pending initialization, kills the owner tag, removes the force-load, removes generated sidebar/objective state, and leaves player gamemode unchanged.

Legacy v1-v9 generated packs retain their older per-resource cleanup behavior for compatibility.

## Output layout

A generated pack contains at least:

```text
<output>/
├── .mcgame-portable-generated
├── pack.mcmeta
└── data/
    ├── minecraft/tags/function/{load,tick}.json
    └── <namespace>/
        ├── function/portable/*.mcfunction
        ├── predicate/portable/input/*.json   # when held input is used
        ├── dialog/portable/selection/*.json  # when v20+ selection/confirmation UI is declared
        └── dialog/portable/form/*.json       # when v21 typed forms are declared
```

Generated content belongs under `build/` and is not committed.

## Portable multiplayer v12

ADR 0020 is the implemented design contract. v12 provides one shared game instance with N online participants:

- `game.players()` returns an opaque `PlayerSet` representing all online participants in the shared game;
- `game.forEachPlayer(players, player => ...)` is a `game.tick(...)`-scoped compiler primitive lowered through `execute as`;
- `PlayerContext` is lexical, player-local references may not escape it, and nested player contexts are initially rejected;
- in v12 `forEachPlayer`, `game.state(...)` remains shared and read-only and shared mutations are rejected; v13 adds the exact-cardinality `forSinglePlayer` exception described below;
- `player.state(...)` is independently mutable per participant. The compiler exposes 32 player-state slots backed by namespace-stable scoreboard objectives and rejects larger programs;
- `player.input.*` samples `hotbarSlot`, `forward`, `backward`, `left`, `right`, `jump`, `sneak`, and `sprint` independently for each online participant into eight fixed namespace-stable objectives before authored rules run;
- missing player-local state is initialized before input/rules; disconnect preserves state for the active game instance; reload/replacement resets the instance; cleanup removes the full player-local objective bank, including offline entries;
- player-local references may drive player-context logic and `player.hud(...)`. Per-player HUD numeric values use a 32-objective namespace-stable scratch bank; player-local values may not drive shared block/text/actor/world projection, global sidebar, or shared camera coordinates;
- one shared camera carrier targets a `PlayerSet`; `spectate` applies only to audience members already in Spectator and `position_lock` to audience members not in Spectator; the compiler never owns gamemode;
- multiple concurrent sessions, private world scenes, independent per-player vanilla sidebars, distinct per-player camera positions, and implicit cross-player reductions are deferred.

v12 exists only in the Node compiler/generated-datapack backend; there is no compatibility backend to update. Objective names use namespace-derived short hashes and fixed slot suffixes so the complete possible bank can be removed on reload/cleanup even after declarations are renamed or deleted.

## Portable procedural grid v13 core

ADR 0022 is the implemented and accepted contract for portable v13. It adds bounded shared runtime topology without restoring arbitrary JavaScript runtime collections; the 29 x 37 procedural roguelike is the completed reference acceptance game:

- `game.forSinglePlayer(game.players(), player => ...)` executes only when exactly one online participant exists and, unlike multi-player `forEachPlayer`, may deterministically mutate shared state/grid/RNG/projection state from that sole player's input;
- `game.grid(id, { width, height, initial, outside })` declares a fixed-size shared 2D grid, initially limited to 4 grids and 2,048 cells per grid;
- runtime `fill`, `get`, `set`, and clipped `fillRect` actions provide dynamic indexed access while remaining compiler-bounded; `fillRect` lowers through row dispatch so large procedural generation does not scan every grid cell for every rectangle;
- grid values use the normal portable fixed-point representation, while runtime coordinates are interpreted as integer cell units;
- `game.rng(id, { seed })` declares a deterministic shared random stream with `int(target, min, max)` and `reset()` actions;
- the v13 RNG algorithm is versioned and deterministic, using a fixed 32-bit LCG step lowered to scoreboard arithmetic;
- `game.gridWorld(...)` declares an incremental fixed-footprint projection from grid cell values to one block per Minecraft cell, with `rebuild()` and read-only `ready`;
- projection runs after authored rules in bounded `cellsPerTick` slices and projected terrain remains persistent after cleanup;
- grid/RNG/world-grid mutations are shared, rejected in multi-player `forEachPlayer`, and allowed in exact-cardinality `forSinglePlayer`;
- rooms, enemies, and loot remain fixed compile-time slot pools built from existing `game.repeat`, scalar state, and presentation primitives rather than generic runtime arrays.

Minecraft 26.1 function macros are the intended internal lowering for dynamic grid indexes. A mod-free probe on `second` verified dynamic scoreboard holders of the form `g$(i)` can be written and read using namespace-owned command storage. Raw macros/storage are not exposed through the portable API.

The accepted v13 reference is a regenerated top-down procedural roguelike with runtime room/corridor generation on a 29 x 37 grid, deterministic seed replay, floor-to-floor regeneration, grid-authoritative movement collision, bounded enemy/loot slots, and incremental terrain projection. Generic arrays/maps/sets, BFS/A*, runtime-created actors, persistent saves, player-local grids/RNG, and multi-layer cell templates remain out of scope for v13.

## Portable team PlayerSets v14

ADR 0023 is the implemented and accepted v14 membership/audience contract. `game.players()` keeps its v12 meaning of all online players, while `game.teamPlayers(name)` denotes online members of an externally managed vanilla scoreboard team. Team-backed sets may drive `forEachPlayer`, `forSinglePlayer`, player-local HUDs, and camera audiences without compiler-owned player tags or fixed names/UUIDs. Team names are compile-time literals restricted to `[A-Za-z0-9_.-]{1,16}`, and at most eight distinct team PlayerSets may be declared.

For v14 programs, player initialization and held-input sampling target the union of PlayerSets referenced by player execution, player HUDs, and cameras. If `all_online` is referenced the union collapses to all online players; otherwise unrelated online players outside every referenced team remain untouched. Player-local state is still attached to the real player and therefore follows that player across external team changes within the active portable instance.

V14 permits up to eight player HUD declarations and eight cameras when their audiences are disjoint team PlayerSets. An `all_online` HUD/camera audience may not coexist with another of the same presentation kind, and duplicate team audiences are rejected. Camera mode still does not own player gamemode. The compiler owns generated camera carriers and portable objective state only; team creation, membership, and teardown are external server/session responsibilities.

V14 itself stops at membership/audience partitioning. V15 builds on that membership boundary with independent logical session state; private world projection, team-local sidebars, reductions, and compiler-owned matchmaking remain future work.

## Session-local logical matches v15

ADR 0024 is the implemented and accepted v15 logical-session contract. V15 binds compile-time session slots one-to-one to team-backed PlayerSets and gives each session independent shared scalar state, Grid objectives, and deterministic RNG holders. The authoring shape is `game.session(id, teamPlayers, session => ...)`, with `session.state`, `session.grid`, `session.rng`, `session.forEachPlayer`, and `session.forSinglePlayer`. Session callbacks execute once per portable tick even when their team is empty; player iteration remains cardinality-driven by online team members.

Session-local references are lexical: they may not escape to global rules or another session. Global shared values may be read inside a session, but global mutation from SessionContext is rejected. Multi-player session callbacks may not mutate session-shared state/Grid/RNG, while exact-cardinality `session.forSinglePlayer` may. Player-local state remains player-owned and follows the player across externally managed team changes. Session ids and team bindings are compile-time declarations; there is no runtime selector/string lookup or compiler-owned matchmaking.

Each session may reuse the same local scalar, Grid, and RNG names as another session because lowering qualifies holders/objectives by session slot. Session Grids keep the v13 per-grid bounds and are additionally subject to a bounded aggregate session-grid budget. `/reload` or generated-pack replacement resets every session to its declarations. An empty team does not delete/reset its logical session, and `portable/cleanup` removes compiler-owned session state while leaving external vanilla teams and membership untouched.

V15 is logic isolation, not private world isolation. Existing `gridWorld`, block/entity projection, ownership regions, and vanilla sidebar remain global. V16 adds the first session-local world boundary described below; automatic arena allocation/private scenes, dynamic matchmaking, session-local player state, cross-session reductions, and persistent saves remain deferred.

## Session-local GridWorld projection v16

ADR 0025 is the implemented and accepted v16 contract. V16 adds `session.gridWorld(id, spec)`, which projects a Grid declared by the same SessionContext into an explicit fixed block footprint. The API mirrors the v13 global GridWorld shape (`grid`, optional `dimension`, `originX`, `y`, `originZ`, `palette`, optional `cellsPerTick`) and exposes session-qualified `rebuild()` plus read-only `ready`. The same local Grid and GridWorld ids may be reused by another session because Grid objectives and projection ready/active/cursor holders are qualified by session slot.

Every session GridWorld must lie completely inside the program's one declared `vanilla.ownership` rectangle and use that ownership dimension. This is the chunk-lifecycle boundary: the existing ownership startup force-loads the bounded rectangle, reaches staged `#ready=1`, and only then permits authored tick logic and session projections. V16 does not add transient per-session chunk leasing, per-session ownership rectangles, or automatic arena allocation.

If either side is session-local, two GridWorld footprints may not overlap at the same dimension and Y level; session-vs-session and session-vs-global overlaps are compile-time errors. Existing global-vs-global semantics are unchanged for compatibility. Distinct footprints provide independent terrain state but are not visibility-private scenes.

A session projection owns independent `ready`, `active`, and `cursor` state. After authored rules, each active session projection may advance one bounded `cellsPerTick` slice per tick, so one session does not consume another session's projection budget. The legacy global GridWorld scheduler is unchanged. `rebuild()` is a session-shared mutation: it is allowed at session scope and inside exact-cardinality `session.forSinglePlayer`, but rejected in multi-player `session.forEachPlayer`. `ready` is lexical and may not escape its SessionContext.

V16 permits at most four GridWorld projections per session, sixteen session GridWorld projections in aggregate, and 16,384 aggregate projected session cells; `cellsPerTick` remains bounded to 1..256. Projected blocks are persistent world state: `/reload` deterministically resets/rebuilds them, while `portable/cleanup` removes generated objective/storage/force-load state but does not restore terrain.

## Bounded player/session reductions v17

ADR 0027 is the implemented and accepted v17 aggregation contract. V17 adds explicit deterministic `count`, `sum`, `min`, `max`, `any`, and `all` reductions over a `PlayerSet` without weakening the existing rule that arbitrary shared/session-shared mutation is rejected inside multi-player `forEachPlayer`. Global authoring uses `game.reduce.*(players, target, ...)`; inside a SessionContext, `session.reduce.*(target, ...)` implicitly uses that session's team PlayerSet and requires a target state from the same session.

Reduction selector callbacks are read-only lexical PlayerContexts. They may read/declare player-local state, read sampled player input, and compare readable portable values, but they cannot emit mutations, HUD declarations, nested player iteration, or other actions. A PlayerSet referenced only by a reduction still participates in the v12 initialization/input prelude before authored reduction actions execute.

All reduction results use normal fixed-point representation. Empty-set results are `count=0`, `sum=0`, `any=0`, and `all=1`; `min` and `max` require an explicit author-supplied empty value. A v17 program may contain at most 64 reduction actions. `sum` follows Minecraft signed 32-bit scoreboard arithmetic and does not add an overflow guard.

V17 reductions introduce no new persistent resource type: they update existing shared/session state holders and reuse the existing player objective lifecycle. `/reload` resets active-instance state and player state before reductions recompute from current participants; `portable/cleanup` removes generated objectives while externally managed vanilla teams remain untouched.

## Persistent scalar state v18

ADR 0028 defines the implemented v18 persistence boundary. V18 adds `game.persistentState(name, initial, options?)` and `session.persistentState(...)` for global and session-shared fixed-point scalars that survive `/reload`, ordinary `portable/cleanup`, and same-namespace generated-pack replacement. Persistent values use a dedicated namespace-derived scoreboard objective and stable semantic-key holders rather than the active-instance objective. The complete program is bounded to 64 persistent scalar declarations.

Each declaration has an integer `schema` (default `1`) and `onSchemaMismatch: "reset" | "preserve"` (default `"reset"`). Reset policy reinitializes that declaration when its stored schema differs; preserve policy keeps the numeric value and advances the stored schema marker. V18 does not run arbitrary migration callbacks. Newly introduced keys initialize from their declaration. Renaming a key creates a new persistent identity; historical holders remain until explicit purge.

Lifecycle is intentionally split. `portable/cleanup` preserves persistent data while removing active-instance resources. `portable/reset_persistent` restores all currently declared persistent values/schema markers to declarations. `portable/purge_persistent` destructively removes the persistent objective and initialization metadata. Normal pack replacement should therefore run cleanup, replace the same namespace, and reload; purge is only for explicit data reset/final teardown.

V18 itself remains global/session scalar persistence only. Portable v19 adds bounded persistent Grid collections as described below. Player-persistent/offline-player identity, persistent RNG/generic collections, structural migration callbacks, and cross-namespace storage remain deferred.

## Persistent Grid state v19

ADR 0029 defines the v19 bounded persistent-collection boundary. V19 adds `game.persistentGrid(id, spec)` and `session.persistentGrid(...)` with the same `fill/get/set/fillRect` operational semantics as ordinary Grid plus `schema` and `onSchemaMismatch` persistence policy. Persistent Grids use normal portable fixed-point values; runtime X/Z are integer cell coordinates, out-of-bounds reads return `outside`, out-of-bounds writes are ignored, and rectangle writes clip to declared bounds.

Persistent Grid cells live in compiler-private namespace command storage as bounded integer arrays rather than one scoreboard holder per cell. Stable semantic identity is derived from global/session scope plus Grid id; function macros provide dynamic indexed element access internally. Raw command-storage paths and NBT operations are not exposed through Portable IR or `portableDsl`. The compiler may use ordinary scoreboard scratch values while evaluating coordinates and transferring the selected cell, but the complete persistent collection is not mirrored into scoreboard state.

V19 permits at most 8 persistent Grids, 2,048 cells per Grid, dimensions up to 64 x 64 subject to that per-Grid limit, and 16,384 persistent cells in aggregate. Global/session mutation follows the same shared-state cardinality rules as ordinary Grid: multi-player `forEachPlayer` mutation is rejected, while exact-cardinality `forSinglePlayer` may mutate deterministically.

Persistent Grid schema policy matches v18 scalars for same-shape data: reset-policy schema mismatch restores all cells to the current `initial` value; preserve policy keeps cells and advances the schema. Width/height mismatch is structural and always resets the Grid to its current declaration regardless of schema policy. `portable/cleanup` preserves persistent Grid storage, `portable/reset_persistent` restores currently declared scalar/Grid defaults, and `portable/purge_persistent` destructively removes namespace persistent Grid storage plus scalar persistence infrastructure when present.

V19 does not expose arbitrary storage, runtime-created collections, persistent player/offline identity, persistent RNG, migration callbacks, or direct persistent-Grid-to-GridWorld projection. Ordinary v18 persistent scalars remain the preferred representation for small counters/flags; ordinary scoreboard-backed Grid remains the preferred high-frequency runtime scratch topology.

## Interactive selection UI v20

ADR 0030 defines the implemented v20 interactive UI boundary. `game.selection(id, spec)` declares one static bounded choice surface and `player.selection(selection)` returns a lexical player-local comparable handle with `open()` and `clear()`. Selection declarations contain a static title, optional static body, 1..16 labeled option values, optional cancel label/value, and 1..4 columns. Programs may declare at most eight selections. Dynamic text/form inputs and arbitrary dialog JSON are not part of v20.

The player-local selection result uses normal portable fixed-point values but reserves compiler-private raw states: `-2147483648` means idle/rearmed and raw `0` means pending. Option and cancel values must therefore be distinct non-zero values after fixed-point scaling and may not equal the idle sentinel. `open()` only transitions idle to pending, so an authored level-triggered `open()` may safely run every tick without replacing an already-open dialog. A resolved non-zero result remains readable until `clear()` rearms the handle. Opening one selection also rearms any other pending selection for that player because Minecraft exposes one current dialog screen.

Lowering uses Minecraft's native `minecraft:multi_action` dialog registry. Each selection receives a stable namespace-derived `trigger` objective selected from a complete eight-slot bank sorted by selection id. Generated buttons execute only a compiler-authored permission-0 `trigger <objective> set <raw-result>` action; portable source cannot supply command strings, objective names, registry ids, or arbitrary click actions. The generated resource is `data/<namespace>/dialog/portable/selection/<id>.json`, and PlayerContext lowering performs `scoreboard players enable` plus `dialog show @s ...` only on idle-to-pending transition.

Selection resources are active-instance compiler ownership. Player initialization/reload rearms every selection, and `portable/cleanup` clears a visible dialog only for players whose generated selection is pending before removing the complete eight-objective bank. External teams and gamemode remain outside compiler ownership.

Minecraft 26.1 treats dialog definitions as registry bootstrap data. Focused acceptance proved that copying a new v20 dialog pack into an already-running world and using only `/reload` does not make the new dialog id available while functions are parsed. Installation, replacement, or removal that changes generated dialog resources must therefore run cleanup where applicable, replace/remove files, then restart the server/world. Once a pack's dialog registry entries were bootstrapped at server start, ordinary `/reload` succeeded and reset v20 active-instance state as specified.

V20 does not expose text/number/boolean form controls, dynamic dialog text, arbitrary click events/commands, inventory/container GUI ownership, quick-action or pause-screen registration, runtime-created menu graphs, custom packets, or persistent selection state. Portable v21 expands this boundary as described below.

## Rich/typed native dialog UI v21

ADR 0031 defines the implemented v21 dialog expansion. Static dialog-facing text may use a bounded `RichText` value made from strings and style spans (color, bold, italic, underline, strikethrough). Selection, confirmation, and form bodies may contain bounded static text elements plus presentation-only item elements with item id/count, optional description, tooltip/decorations flags, and bounded dimensions. Dynamic score/selector/NBT components, click/hover events, arbitrary component objects, custom fonts, and item NBT/components remain outside Portable IR.

`game.confirmation(id, spec)` lowers to native `minecraft:confirmation` and reuses the v20 player-selection handle/lifecycle. Its yes/no actions return distinct non-zero authored fixed-point values through the existing stable selection trigger bank; native Escape follows the confirmation no action. Selection and confirmation declarations share the v20 eight-slot declaration bound.

`game.form(id, spec)` plus `player.form(form)` adds one compiler-owned input per generated native form. V21 supports boolean, single-option, and integer `number_range` inputs. Boolean defaults to logical `1/0`; option labels map to bounded authored numeric values; range start/end/step/initial are integers. Each form owns a stable `trigger` transport objective plus a dummy fixed-point result objective from complete eight-slot banks sorted by form id. Submit uses compiler-authored permission-0 `minecraft:dynamic/run_command` to issue `trigger <transport> set $(v)`, then the tick prelude validates/maps that transport to the authored fixed-point result. Logical zero remains a valid resolved result because result idle state uses a separate signed-int sentinel.

Form `open()` is idempotent while already pending. A resolved result remains readable until `clear()`. Opening a different generated selection/confirmation/form first rearms any other pending generated dialog surface for that player, matching Minecraft's one-current-dialog-per-client model. Form cancel uses a reserved compiler-private transport code and resolves to the declared cancel value (default logical `-1`). Player initialization, `/reload`, and `portable/cleanup` treat these as active-instance state; cleanup removes complete selection/form banks while leaving externally managed teams and gamemode untouched.

The vanilla return channel intentionally bounds the feature: v21 exposes exactly one typed input because a permission-0 client can safely return one integer through `/trigger`. Free-form text cannot be returned through that channel, and generic multi-field packing, arbitrary commands/events, custom packet handlers, inventory/container GUI ownership, runtime-created dialog graphs, and persistent form state remain unsupported. Generated `minecraft:dialog` resources follow the same registry-bootstrap lifecycle established by v20: add/change/remove requires cleanup where applicable, file replacement/removal, then server/world restart; ordinary `/reload` remains valid after startup bootstrap.

## Expanded mannequin actor presentation v22

ADR 0032 defines the implemented v22 actor expansion. `game.actor(...)` keeps the existing maximum of 64 statically declared compiler-owned mannequin carriers and the v7 `x`/`y`/`z`/`yaw`/`when` lifecycle, while adding state-backed `pitch` plus bounded static character presentation: profile texture/cape/elytra resource ids with `wide`/`slim` model override, hidden player skin layers, mannequin pose, main-hand preference, and item-resource-id equipment for head/chest/legs/feet/mainhand/offhand.

Profile input is deliberately resource-backed rather than identity-backed. Portable source cannot request a player name/UUID lookup, provide signed/raw profile properties or arbitrary base64 texture payloads, or depend on compiler network access. Custom namespaced profile assets may be referenced but must be delivered through normal Minecraft resource-pack mechanisms; built-in `minecraft:` assets need no custom client mod. Equipment is presentation-only and carries item ids only: item components/NBT, counts, enchantments, inventory mutation, and runtime equipment changes are not part of v22.

The vanilla backend still always owns a `minecraft:mannequin`. V22-presented actors add `immovable:1b` while retaining compiler-authored position/rotation projection. Existing zombie/skeleton semantic intents continue to map to mob heads; on v22 actors that head is inserted into the static equipment map unless explicit `equipment.head` overrides it. Old v1-v21 actor declarations retain their historical lowering path byte-for-byte. Pose/profile/layers/hand/equipment are static declarations; position/yaw/pitch may follow shared portable state. Arbitrary limb rotations, roll/scale animation, `/swing` authoring, runtime-created actors, attachment/passenger graphs, arbitrary entity NBT, and generic item/model-display actors remain outside the boundary.

Actor replacement/reload/cleanup semantics do not change. A false `when` removes the owned mannequin and a later true condition recreates it with the full declaration. V22 introduces no registry-bootstrap resource; ordinary datapack `/reload` remains sufficient unless another declared capability such as v20+ dialogs independently requires restart for changed registry entries.

## World interaction use v23

ADR 0034 adds a bounded vanilla right-click input primitive backed by compiler-owned `minecraft:interaction` entities. `game.interaction(id, spec)` declares at most 64 static hitboxes. Coordinates use the existing shared/state-backed coordinate model; width/height are static `0.01..64` values, `response` is a static boolean defaulting to `true`, and optional `when` owns the entity lifetime. Interactions participate in the existing ownership rectangle, staged initialization, stable tagging, reload replacement, and cleanup lifecycle.

A handle's single `onUse(player => ...)` handler is declared directly in the root `game.tick(...)` scope. The backend executes the callback through vanilla `execute ... on target`, so `player` is the actual player whose right click Minecraft recorded. The callback uses an exact mutable PlayerContext subset: player-local state/input and selection/form operations are available, and shared state mutation is allowed under the existing single-player mutation rule. `player.hud(...)` is excluded because HUD declarations require a static PlayerSet audience.

After dispatch, generated code removes the interaction entity's `interaction` compound. A right click is therefore an edge-like event rather than a persistent level and cannot replay every tick. Vanilla stores only the latest interaction record, so v23 deliberately does not promise a queued stream if multiple uses are collapsed before one compiler tick. Left-click/attack handling, arbitrary entity/NBT queries, dynamic hitbox shape/response, runtime-created interactions, session-local interaction declarations, and durable binding of the clicking player as a later controller are not part of v23. The feature adds no registry resource; ordinary `/reload` is sufficient.

## Planned capability roadmap after v16

ADR 0026 establishes a capability-first roadmap: prioritize portable semantics that current game source cannot reproduce safely with existing primitives before automation or infrastructure that already has a workable explicit fallback. This is planning policy, not an implemented API contract; each capability requires its own ADR and Portable IR version decision before implementation.

The roadmap order is:

1. **bounded player/session reductions** — completed by Portable v17 / ADR 0027;
2. **persistent portable state** — completed for bounded global/session scalar state by Portable v18 / ADR 0028 and bounded persistent Grid state by Portable v19 / ADR 0029; player/offline persistence remains deferred;
3. **interactive dialog UI** — completed for bounded selections by Portable v20 / ADR 0030 and expanded in Portable v21 / ADR 0031 with static rich text/item bodies, native confirmation, and boolean/option/integer-range single-input forms;
4. **mannequin/actor presentation expansion** — completed by Portable v22 / ADR 0032 with bounded static profile/skin-layer/pose/hand/equipment presentation and state-backed pitch while preserving compiler-owned lifecycle and the 64-actor declaration bound. Item/model projections and attachment relationships remain separate future capabilities.

ADR 0032 completes item 4 by extending rather than replacing the v7 lifecycle: actor carriers remain bounded compiler-owned mannequins with state-backed transforms/lifetime and zombie/skeleton mob-head intents, now with the v22 presentation fields described above. Runtime-created or unbounded entity collections remain out of scope.

Automatic arena allocation, per-session ownership/dynamic chunk leasing, dynamic matchmaking, session-local presentation declarations, and per-player vanilla sidebars remain useful but lower priority because current prototypes have explicit workarounds. Bounded local TypeScript module/import authoring is implemented by ADR 0033 without changing Portable IR. Bounded world-object right-click input is implemented by Portable v23 / ADR 0034 without opening a generic Minecraft query/event API. Client-private scene visibility is still a genuine missing isolation feature, but spatially separate footprints are sufficient for current acceptance games, so privacy work is also behind the four capability priorities unless a retained game makes it a blocker.

After those priorities, additional capability gaps include 3D/swept collision, deliberately scoped Minecraft world/entity queries, pathfinding/topology helpers, and generic runtime collections where existing Grid/fixed-slot patterns prove insufficient.

## Current limitations

- TypeScript modules are local build-time composition only: at most 64 `.ts` files / 1,000,000 aggregate source bytes under the entry directory; Node built-ins, npm/bare packages, non-TypeScript assets, dynamic import, authored `require`, and circular imports are unsupported;
- v1-v11 remain single-controller-oriented for compatibility; v12 is the multiplayer model;
- fixed-point arithmetic relies on Minecraft scoreboard 32-bit behavior; generated commands do not add generic overflow guards;
- no runtime generic arrays/collections, arbitrary packet-event dispatch, arbitrary inventory/form/dialog API, arbitrary NBT/storage API, or arbitrary Minecraft queries; v21 provides bounded static rich native-dialog content, v22 provides bounded static mannequin profile/pose/equipment presentation, and v23 provides bounded right-click/use events through compiler-owned interaction entities; free-form text input, generic multi-field/dynamic forms, arbitrary click/attack events or commands, inventory GUI ownership, generic entity mutation, durable interaction-controller identity, and runtime entity collections remain unsupported;
- one server-global sidebar; v14 permits up to eight camera declarations only for disjoint external-team audiences;
- bounded 2D logic collision only, not Minecraft hitbox queries or 3D/swept physics;
- v8 world projection is compile-time declared and persistent; v13 additionally provides bounded incremental runtime grid projection, also persistent;
- v15 adds independent team-bound logical sessions; v16 adds explicit session-local Grid-to-world footprints inside one shared ownership rectangle; v17 adds bounded cross-player/session reductions; v18 adds persistent scalars, v19 adds persistent Grids, v20 adds player-local native-dialog selection, v21 adds bounded rich/typed native-dialog UI, v22 expands bounded mannequin actor presentation, and v23 adds bounded compiler-owned world interaction/right-click input. Automatic arena allocation, per-session ownership/private visibility scenes, dynamic matchmaking, independent per-player vanilla sidebars, player/offline persistent state, richer generic persistent collections, free-form/multi-field forms, and inventory UI are not implemented.

## Validation baseline

### Bounded local TypeScript module validation

ADR 0033 adds compiler-frontend module composition without changing Portable IR or vanilla lowering. Node coverage exercises relative extensionless/explicit `.ts` imports, nested imports, named/default exports and re-exports, plus rejection of Node built-ins, npm packages, non-TypeScript files, dynamic import, authored/CommonJS `require`, source-root/symlink escape, cycles, and graph bounds. `examples/portable-breakout-core` imports its brick-field builder from `./bricks` and generates byte-for-byte identical output to the former single-file source. The full regression suite is 45/45 green, and all 18 retained example datapacks are byte-for-byte identical to pre-change commit `d091570`.

Because this feature changes only build-time source loading, Minecraft runtime acceptance is inherited from the unchanged generated datapack semantics; compiler regression and byte-parity validation are the acceptance evidence.

Portable v1-v23 compiler behavior is covered by the Node regression suite; generated milestone behavior has focused mod-free Minecraft 26.1 acceptance where the relevant semantics require it. The strongest acceptance path is generated-pack validation on the vanilla `second` environment with a real client where visual/input semantics matter.

Node migration ADR 0021 additionally established byte-for-byte output parity with the retired Java compiler for representative v1, v9, v10, and v11 programs including Bounce, Pinball, Breakout, Presentation, UI, World, JRPG, and spectate-camera cases. Node compiler regression tests are now the maintained build-time acceptance suite.

### v23 world interaction/use validation

Portable v23 passed focused mod-free Minecraft 26.1 acceptance on `second` using real client `Camera` and checked-in `examples/portable-interaction`. The generated cabinet owned exactly one `minecraft:interaction` with authored `width=1.8f`, `height=2.2f`, `response=1b`, the stable declaration tag, and the normal namespace owner tag. The accompanying block/text Displays rendered the visible cabinet while the interaction entity remained the invisible use hitbox.

The first real right click changed shared raw `totalUses` and Camera's player-local raw `cabinetUses` from `0` to `1000`. Generated event consumption removed the entity's `interaction` compound after dispatch. A second distinct real right click changed both values to `2000`, proving separate uses dispatch separately without replaying the prior record. Ordinary `/reload` reset both active-instance states to `0`, recreated exactly one interaction entity, and left no stale pending use.

The Node regression suite was 50/50 green. All 18 pre-existing retained v1-v22 examples were compiled with v23 and parent commit `ed4673e`, with byte-for-byte identical generated output. Cleanup removed every generated objective and owned entity and reduced the four acceptance ownership force-loaded chunks to zero. Final pack removal plus `/reload` left only vanilla enabled; the two pre-existing video packs remained disabled/available.

### v22 expanded mannequin actor validation

Portable v22 passed focused mod-free Minecraft 26.1 acceptance on `second` using real client `Camera` and checked-in `examples/portable-actor-presentation`. The rendered scene contained a slim Alex-profile crouching hero with diamond chest/boots, sword and shield; a wide Steve-profile guard in iron equipment; and a crouching zombie-intent mannequin with authored chest/main-hand equipment plus the compiler-supplied zombie-head fallback. Runtime entity data confirmed the authored `profile`, `hidden_layers`, `pose`, `main_hand`, and equipment maps.

With exactly one player in the `forSinglePlayer` scope, real A input changed shared `heroYaw` from raw `180000` to `204000` and the owned mannequin rotation followed at `204.0f`. Real Space input set `heroPitch=-20000` with entity pitch `-20.0f`; Shift then set raw `15000` with entity pitch `15.0f`. Ordinary `/reload` restored yaw/pitch to `180000/0`, recreated exactly three owned mannequin actors, and restored the hero profile/equipment and `[180.0f, 0.0f]` rotation.

The Node regression suite was 39/39 green. Seventeen retained v1-v21 checked-in examples were compiled against both v22 and pre-v22 commit `c7d3cc9`, with byte-for-byte identical generated output. Cleanup removed all generated objectives and owned entities and reduced the acceptance ownership rectangle from nine force-loaded chunks to zero. Final pack removal plus `/reload` left only vanilla enabled; the two pre-existing video packs remained disabled/available.

### v21 rich/typed native dialog UI validation

Portable v21 passed focused mod-free Minecraft 26.1 acceptance on `second` using real client `Camera` in externally managed team `v21_party`. The checked-in `examples/portable-dialog-ui` pack rendered a styled `Arcane Purchase` native confirmation with mixed-color text, a diamond-sword item body and tooltip, plus authored `Buy`/`Leave` actions. The confirmation `Leave` path resolved to logical `-10`. The same pack rendered boolean, single-option, and integer-range forms; real-client submit paths reached logical boolean `1`, option `Mage=3`, and range `3` in authored player-local fixed-point state. Option/range cancel paths resolved logical `-1`.

The acceptance source deliberately calls each surface's `open()` every tick while armed. Pending transport state remained stable across ticks. Replacing a pending `hints` form with `role` rearmed the old transport from pending to idle and left only the new form pending, proving cross-surface replacement does not leave a stale sentinel. `/reload` after startup bootstrap reset stage/results/transports while preserving external team membership. Running `portable/cleanup` from a pending confirmation removed every generated objective and left `v21_party` intact. Final teardown then removed the team and pack and restarted the server to remove registry entries; the server finished with zero objectives, zero teams, and only vanilla enabled (with the pre-existing disabled video packs merely available).

The Node regression suite was 35/35 green. Sixteen retained v1-v20 checked-in examples were recompiled against both v21 and pre-v21 commit `b000162`, with byte-for-byte identical generated output. Node coverage includes rich-text/body validation, item lowering, all three form kinds, logical-zero result mapping, cancel, replacement, bounds, and rejection of unsupported text input.

### v20 interactive selection UI validation

Portable v20 passed focused mod-free Minecraft 26.1 acceptance on `second` using real client `Camera` in externally managed team `v20_party`. The checked-in `examples/portable-selection-ui` pack generated one native `Portable Shop` multi-action dialog with Potion=`1`, Sword=`2`, and Cancel=`-1`, while intentionally calling `choice.open()` every tick while enabled. The rendered client showed the generated title, body, two option buttons, Cancel button, and tooltips. A pending selection remained raw `0` across multiple ticks despite repeated authored `open()`, proving the idle-to-pending guard kept the screen actionable.

In one real-client sequence, Jump opened the menu and a mouse click chose Potion, producing trigger raw `1000`, authored `lastChoice=1000`, `menuEnabled=0`, and the rearmed idle sentinel. A second sequence used Jump then Escape and produced `lastChoice=-1000`. These paths use a compiler-owned trigger objective and native dialog controls; no held-key convention selected the option itself.

Initial reload-only installation intentionally exposed the Minecraft 26.1 registry boundary: the new pack files were present, but function loading reported the dialog id missing from `minecraft:dialog`. Restarting the server with the pack present bootstrapped the registry and loaded cleanly. A later ordinary `/reload` of that already-bootstrapped pack succeeded with no problems, preserved `v20_party`, reset `lastChoice=0` and `menuEnabled=1000`, and reopened the selection to pending raw `0`. `portable/cleanup` removed all generated objectives and the pending dialog while preserving external team membership. Final removal used cleanup, pack deletion, and server restart; the server ended with zero objectives, zero teams, and only vanilla enabled.

The Node regression suite was 31/31 green. Fifteen retained v1-v19 examples were recompiled against both v20 and pre-v20 commit `a2d324c`, with byte-for-byte identical generated output.

### v19 persistent Grid validation

Portable v19 passed focused mod-free Minecraft 26.1 acceptance on `second` using real client `Camera` in externally managed team `v19_party`. The checked-in `examples/portable-persistent-grid` pack began with global reset-policy Grid `world` as twelve logical zero cells and session preserve-policy Grid `stash` as four logical `5` cells. Real A/left wrote `world[1,1]=7`; real D/right wrote `stash[0,0]=9`. Authored `get` operations then exposed raw fixed-point values `worldCell=7000`, `stashCell=9000`, and out-of-bounds `worldOutside=-1000`, while command storage showed the corresponding arrays with only those cells changed.

With the real client connected and the server ticking, `/reload`, ordinary cleanup/reload, and same-namespace same-schema replacement all preserved the Grid cells and external team membership. Cleanup removed all nine generated active-instance objectives while leaving persistent storage intact. A same-shape schema-2 replacement with new defaults `world=100` / reset and `stash=500` / preserve reset all world cells to raw `100000`, preserved stash as `[9000,5000,5000,5000]`, and advanced both schema markers. `reset_persistent` produced twelve `100000` world cells plus four `500000` stash cells; `purge_persistent` then removed the Grid storage.

Final teardown removed the acceptance pack and external team and left zero objectives, zero teams, empty v19 namespace persistence storage, and only vanilla enabled. The Node regression suite was 28/28 green. Fourteen retained v1-v18 checked-in examples were recompiled against both v19 and pre-v19 commit `d55cbbf`, with byte-for-byte identical generated output.

### v18 persistent scalar validation

Portable v18 passed focused mod-free Minecraft 26.1 acceptance on `second` using real client `Camera` in externally managed team `v18_party`. The checked-in `examples/portable-persistent-state` pack began with global `campaign=10`, global preserve-policy `legacy=5`, and session `wins=3`. Real A/left changed campaign to `11` and legacy to `15`; real D/right changed wins to `4`. `/reload` preserved all three persistent values and the external team membership while active-instance player/runtime objectives followed the normal reload lifecycle.

Normal `portable/cleanup` removed active-instance objectives but deliberately left the one persistent objective and values `11 / 15 / 4`. Same-namespace replacement with the same schema preserved those values. A schema-2 replacement with new defaults `campaign=100`, `legacy=500`, `wins=200` then proved both policies: campaign and wins reset to `100 / 200`, while legacy preserved `15`; all schema markers advanced to 2. `portable/reset_persistent` restored the current declaration defaults `100 / 500 / 200`. A subsequent cleanup again left only persistent data, and `portable/purge_persistent` removed the persistence objective and initialization marker. Final teardown removed the temporary team and pack and left zero objectives and zero teams.

The Node regression suite was 25/25 green. Retained v1-v17 generated examples were byte-for-byte identical to pre-v18 commit `a262bf1`.

### v17 player/session reduction validation

Portable v17 passed its mod-free Minecraft 26.1 acceptance on `second` using real clients `Camera` and `Camera2` as simultaneous members of externally managed team `v17_party`. The checked-in `examples/portable-player-reductions` pack stores identity-local `score` / `ready` values and recomputes one session's `count`, `sum`, `min`, `max`, `any`, and `all` every tick. With both clients initialized at zero, the aggregate reached `count=2000`, `sum=0`, `min=0`, `max=0`, `any=0`, and `all=0` at fixed point 1000.

Real A/left input on Camera changed only Camera's score to `1000`, producing `sum=1000`, `min=0`, `max=1000`. Real D/right input on Camera2 then changed only Camera2's score to `2000`, producing `sum=3000`, `min=1000`, `max=2000`. Jump on only Camera produced `any=1000` / `all=0`; after Camera2 also jumped, both became `1000`. This validates player-local source isolation plus deterministic numeric and boolean reduction lowering.

Removing both clients from `v17_party` while they remained online produced the defined empty-set values `count=0`, `sum=0`, `min=-1000`, `max=-1000`, `any=0`, `all=1000`, while the identity-local scores `1000` / `2000` and ready values `1000` / `1000` remained intact. Rejoining both clients immediately recomputed the previous non-empty aggregates from those retained values. `/reload` preserved external team membership but reset player-local active-instance values to zero, after which reductions recomputed `count=2000`, `sum=0`, `min=0`, `max=0`, `any=0`, `all=0`.

`portable/cleanup` removed every generated scoreboard objective while `v17_party` still retained both members. Test teardown then removed the team and acceptance datapack; final server state had zero objectives and zero teams, with only the pre-existing disabled video packs remaining. The Node regression suite was 22/22 green, and all retained v1-v16 generated examples were byte-for-byte identical to pre-v17 commit `4c485fd`.

### v16 session GridWorld validation

Portable v16 passed its mod-free Minecraft 26.1 acceptance on `second` using real clients `Camera` and `Camera2` in external teams `v16_red` and `v16_blue`. The checked-in `examples/portable-session-grid-world` pack deliberately reuses session-local Grid `map` and GridWorld `terrain` while projecting red at x=404..407 / z=4..7 / y=100 and blue at x=436..439 / z=4..7 / y=100 inside one ownership rectangle. Staged startup reached `#ready=1`, both session GridWorld ready values and session-local `readySeen` values reached `1000`, eight ownership chunks were force-loaded, and both 4 x 4 footprints initially contained 16 black-concrete blocks.

With both clients online simultaneously, real A input from Camera changed only red `hits` from `0 -> 1000` and rebuilt red terrain to 15 black + one red block at `(404,100,4)`; blue remained `hits=0` with 16 black blocks. Real D input from Camera2 then changed only blue `hits` to `1000` and rebuilt blue terrain to 15 black + one blue block at `(436,100,4)` while red state remained unchanged. This validates same-name Grid/GridWorld qualification, lexical readiness, independent rebuild state, and distinct fixed footprints.

`/reload` reset both hit counters to `0`, restored both readiness values to `1000`, returned both footprints to 16 black blocks, and preserved external team membership. Final `portable/cleanup` removed every scoreboard objective and all eight ownership force-loaded chunks while the teams still retained their members. Explicit teardown cleared all 32 persistent projected blocks, then removed the temporary teams and datapack; the final server state had zero objectives, zero force-loaded chunks, and zero teams. The Node regression suite was 19/19 green.

### v15 session-local logical-match validation

Portable v15 passed its mod-free Minecraft 26.1 acceptance on `second` using real clients `Camera` and `Camera2` in external teams `v15_red` and `v15_blue`. The checked-in acceptance pack deliberately reused local names `score`, `cell`, `sample`, Grid `map`, and RNG `run` in both sessions. Before player input, both identically seeded RNGs had state `1879724910` and first sample `31000`. With both clients online globally, real A input from Camera changed only red `score` / `cell` / `map[0,0]` from `0 -> 1000`, advanced red RNG state to `804324341` with sample `30000`, and left every blue value unchanged. Real D input from Camera2 then produced the same first transition in blue while red remained unchanged. This validates same-name scalar/Grid/RNG isolation and independent per-session exact-cardinality execution.

Real-client captures rendered session-local HUD values independently (`RED S 1 C 1 R 30` and `BLUE S 1 C 1 R 30`). Removing Camera from `v15_red` left red `score=1000`, Grid cell `1000`, sample `30000`, and RNG state `804324341` intact while the team was empty. Rejoining and pressing A resumed the existing instance (`score` / Grid `1000 -> 2000`, RNG `804324341 -> 372032720`) without changing blue. `/reload` then reset both sessions deterministically to `score/cell/Grid=0`, reproduced sample `31000` and RNG state `1879724910`, and preserved the externally managed team memberships.

Final `portable/cleanup` removed all portable/session objectives, eight ownership force-loaded chunks, and owner/camera entities while both external teams still retained their members. Test teardown then removed the temporary teams and acceptance datapack; the server datapack directory returned to its pre-test packs. The Node regression suite was 17/17 green, including deterministic compilation of all retained v1-v14 examples plus v15 lowering tests.

### v14 team PlayerSet validation

Portable v14 passed its mod-free Minecraft 26.1 acceptance on `second` using two real clients and one unrelated bot. External teams `v14_red` and `v14_blue` contained `Camera` and `Camera2` respectively. With both real clients online globally, real A input on Camera changed only its team-scoped player-local meter (`0 -> -14000`) and the red exact-cardinality edge counter (`0 -> 1000`), while Camera2 stayed `0` and the blue counter stayed `0`. Real D input on Camera2 then changed only its meter (`0 -> 13000`) and blue edge counter (`0 -> 1000`) while the red values remained unchanged. This proves that two one-member team `forSinglePlayer` scopes execute independently even though the global online count is two.

The red and blue position-lock cameras held the clients at distinct carriers `[248,140,8]` / yaw `0` and `[280,140,8]` / yaw `180`, both pitch `15`. Real-client captures rendered only the matching actionbars (`RED METER -14 HIT 1` and `BLUE METER 13 HIT 1`). With both clients still online, unrelated `Test_v14out` joined outside both teams; it received neither the player-init score nor the left/right input scores. Neither real client carried generated entity tags. Cleanup reduced eight ownership force-loaded chunks to zero, removed all objectives and both camera/owner entity sets, and left the external teams and their memberships intact. Test teardown then removed the temporary teams and datapack and reloaded cleanly. The Node regression suite was 15/15 green including deterministic compilation of all retained v1-v14 examples.

### v13 core validation

The v13 compiler core has focused mod-free Minecraft 26.1 validation on `second`. Runtime grid `fill`, clipped `fillRect`, dynamic macro-backed `get`/`set`, out-of-bounds fallback, deterministic RNG reset/reload behavior, and incremental `gridWorld` projection were exercised against a generated 4 x 3 smoke grid. The projection completed in three 5-cell slices, exposed `ready == 1` in portable fixed-point form, produced the expected 5 white / 7 black block footprint, and left no force-loaded chunks. `/reload` reproduced the same first RNG sample and grid result.

`forSinglePlayer` was validated at zero, one, and two participants. With only real client `Camera2` online, a real A input changed shared `inputHits` from `0` to `1000` through `player.input.left`; with a second participant simultaneously online, the same real A input left both `inputHits` and a shared singleton tick counter at `0`, proving exact-cardinality suppression rather than arbitrary first-player selection. Cleanup removed the complete grid bank, player-input objective, main objective, and force-loads; the 12-cell temporary terrain footprint was explicitly restored to air and the smoke pack removed. The current v13 compiler was also compared against `6dc6da7` for all eight retained v1-v12 examples (Bounce, Pinball, Breakout, Presentation, UI, World, JRPG, and Multiplayer), with byte-for-byte identical generated output.

### v13 procedural roguelike validation

The full v13 reference E2E passed on mod-free Minecraft 26.1 `second`. The generated 29 x 37 dungeon reached `projection.ready == 1` without embedding final topology at compile time. `/reload` reproduced the same first-floor RNG state and all six room coordinates. Consuming the stream produced a different second floor, including a projected floor-cell count change from 217 to 224. With the target Minecraft block deliberately replaced by black concrete while the corresponding grid cell remained floor, real `Camera2` D input still moved logical position `(19,5) -> (20,5)`, collected the generated loot slot, and changed score `0 -> 1`, directly validating grid-authoritative collision. A second real-input setup entered the generated enemy slot and changed score `1 -> 6`; stepping onto the generated exit advanced to floor 3 and completed another projection rebuild.

The first large-grid attempt exposed Minecraft's 65,536-command execution limit in the original all-cell `fillRect` lowering. Row-dispatch lowering removed that failure; repeated reload and floor generation produced no further command-limit event. Final teardown removed every generated objective, force-load, and owned/presentation entity, explicitly cleared the 1,073-cell projected footprint, deleted the reference datapack, and reloaded with no datapack problems.

### v12 multiplayer validation

Portable v12 was accepted on the mod-free `second` Minecraft 26.1 server with two simultaneous participants plus the real render client. `Test_v12a` holding Left changed only its own `meter` (`0 -> -10000`) while `Test_v12b` stayed `0`; then B holding Right changed only B (`0 -> 7000`) while A remained `-10000`. A held Jump for about 700 ms and its player-local rising-edge counter advanced only once (`0 -> 1000`), then advanced to `2000` only after release and a second press, while B remained `0`. Disconnect/reconnect in the same active instance preserved A's local values; `/reload` reset both participants to their declared initial values. The real 26.1 client remained position-locked to the shared camera and rendered its own actionbar (`METER -6  JUMP 0  ROUND 1`). Finally, cleanup was run with A offline: the player-state objective ceased to exist for both A and B and the ownership force-load returned to zero.

The v12 `spectate` audience path was subsequently accepted with two simultaneous real Minecraft 26.1 clients (`Camera` and `Camera2`) using the multi-render-client mc-mcp control path. Both clients were explicitly placed in Spectator and converged to the same owned camera carrier at `[240,100,0]` with rotation `[180,15]`. Real A input on `Camera` changed only its local `meter` (`0 -> -9000`) while `Camera2` stayed `0`; real D input on `Camera2` then changed only its local value (`0 -> 8000`) while `Camera` remained `-9000`. Opposite mouse-look attempts on the two clients both returned to the carrier position/rotation, demonstrating that both clients were actively spectating the shared carrier rather than merely being free spectators at the same coordinates. Neither player had generated tags. `portable/cleanup` left both players in Spectator, removed the complete player-objective bank, and returned force-loads to zero. This closes the v12 shared-spectate-camera multiplayer E2E gate.

After v12 landed, the v10 Breakout and Pinball reference packs were regenerated by the current compiler and re-tested on the same vanilla server. Breakout real A input moved `paddleX` from `0` to `-2240`; Space launched play, an actual brick collision changed `bricksLeft 40 -> 39` and `score 0 -> 1`, and a drain changed `lives 3 -> 2`. Pinball client A and D inputs hit deterministic active-flipper setups with mirrored responses (`score +5`, `ballVx +0.24` / `-0.24`), and real Space input launched normal play under the fixed camera. Both packs cleaned their objectives and force-loads back to zero.
