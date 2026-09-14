# Architecture

## Goal

Minecraft Game Engine is a TypeScript-to-vanilla-datapack game compiler. Minecraft owns the world, rendering, player entities/input, audio, particles, networking, and client. Portable game logic is authored with `portableDsl`, lowered to versioned Portable IR, then compiled to ordinary Minecraft 26.1 datapack resources.

The canonical workflow is:

```text
edit main.ts -> npm run compile:portable -> deploy/reload datapack -> play/test/capture -> edit main.ts
```

There is no Java/Fabric runtime in the repository. ADR 0021 records the compiler migration and retirement order.

## Responsibility boundaries

### TypeScript game source

Owns game-specific state, rules, collision response, progression, UI values, and declarative presentation. Source must stay inside the portable API if it is expected to compile.

### Node portable compiler

Owns build-time TypeScript transpilation, `portableDsl` evaluation, Portable IR validation, and datapack generation. The implementation lives under `tools/portable-compiler/`.

The compiler accepts one TypeScript source, namespace, and output directory. Module/import resolution is not implemented; portable sources are currently single-file programs.

### Portable IR

Portable IR is the versioned semantic contract between authoring and vanilla lowering. It contains deterministic fixed-point values, bounded actions, collision primitives, declarative presentation/world resources, input mappings, and lifecycle metadata. Arbitrary JavaScript callbacks are not an IR feature.

IR versions 1 through 16 are implemented. ADR 0020 defines the multiplayer v12 contract, ADR 0022 defines the procedural grid/RNG v13 contract, ADR 0023 defines team-backed PlayerSets and partitioned player audiences in v14, ADR 0024 defines team-bound logical sessions in v15, and ADR 0025 defines session-local GridWorld projection in v16.

### Generated datapack

The generated directory is the deployment artifact. It owns namespace-derived scoreboards, functions, predicates, generated entities, optional ownership-region force-loads, HUD/sidebar resources, and `portable/cleanup`.

The target Minecraft server needs no compiler, Node.js, TypeScript, Java, Fabric, or mod.

### Minecraft 26.1

Minecraft executes generated mcfunctions and supplies vanilla-observable player input, entities, Displays, terrain, particles, sounds, camera observation, scoreboards, and networking.

### mc-mcp

`mc-mcp` is the development/test control plane for deploying datapacks, issuing commands, driving test clients, inspecting state, and capturing evidence. It is not a runtime dependency of a deployed game.

## Compiler pipeline

`tools/portable-compiler/cli.mjs` performs:

1. read `main.ts`, with a 1 MB source limit;
2. transpile through bundled TypeScript 5.9.2 targeting ES2022;
3. create an isolated Node `vm` context;
4. install the bundled `portableDsl` frontend plus registration-only host stubs;
5. evaluate initialization and capture exactly one `portable.define(...)` result;
6. parse and validate Portable IR for the declared version;
7. lower the IR to a standalone datapack;
8. write `.mcgame-portable-generated` so later compiler runs may safely replace the generated directory.

Live Minecraft host capabilities are unavailable during extraction. A source that calls runtime-only host inspection APIs cannot compile; `game.players()` in v12 is a declarative `PlayerSet` constructor, not live player enumeration during compilation. The `vm` boundary is a build-tool containment measure and has not been audited as a hostile-code security boundary.

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
- mannequin actors with state-backed position/yaw and optional lifetime condition; zombie/skeleton semantic appearances use mannequin carriers with vanilla mob heads;
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
        └── predicate/portable/input/*.json   # when held input is used
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

## Planned capability roadmap after v16

ADR 0026 establishes a capability-first roadmap: prioritize portable semantics that current game source cannot reproduce safely with existing primitives before automation or infrastructure that already has a workable explicit fallback. This is planning policy, not an implemented API contract; each capability requires its own ADR and Portable IR version decision before implementation.

The planned order is:

1. **bounded player/session reductions** — deterministic count/sum/min/max/any/all-style aggregation over a `PlayerSet` without weakening the existing rule that multi-player `forEachPlayer` cannot arbitrarily mutate shared/session-shared state;
2. **persistent portable state** — selected progression/state that survives `/reload` and pack replacement, with explicit schema, reset, migration, cleanup, and offline-player semantics;
3. **interactive selection UI** — bounded vanilla-client choices for dialogue, shops, menus, and confirmations rather than forcing passive HUD text plus key-binding conventions;
4. **mannequin/actor presentation expansion** — richer bounded character appearance such as mannequin appearance/profile or skin controls supported by vanilla, equipment, and pose/transform controls, while preserving compiler-owned lifecycle and declaration bounds. Item/model projections or attachment relationships require the same ownership discipline and are design-time candidates rather than current features.

The existing v7 actor contract remains current until item 4 lands: actor carriers are mannequins with state-backed position/yaw/lifetime, with zombie/skeleton intents represented by mob heads. ADR 0015's richer-presentation items were non-goals for v7; ADR 0026 intentionally promotes mannequin/actor expression to planned work without introducing runtime-created or unbounded entity collections.

Automatic arena allocation, per-session ownership/dynamic chunk leasing, dynamic matchmaking, session-local presentation declarations, per-player vanilla sidebars, and module/import support remain useful but lower priority because current prototypes have explicit workarounds. Client-private scene visibility is still a genuine missing isolation feature, but spatially separate footprints are sufficient for current acceptance games, so privacy work is also behind the four capability priorities unless a retained game makes it a blocker.

After those priorities, additional capability gaps include 3D/swept collision, deliberately scoped Minecraft world/entity queries, pathfinding/topology helpers, and generic runtime collections where existing Grid/fixed-slot patterns prove insufficient.

## Current limitations

- single-file TypeScript; no import/module resolution;
- v1-v11 remain single-controller-oriented for compatibility; v12 is the multiplayer model;
- fixed-point arithmetic relies on Minecraft scoreboard 32-bit behavior; generated commands do not add generic overflow guards;
- no runtime generic arrays/collections, arbitrary packet-event dispatch, clickable inventory/dialog UI, persistent game storage, or arbitrary Minecraft queries; v13 provides bounded grid/RNG topology primitives but not generic collections or pathfinding;
- one server-global sidebar; v14 permits up to eight camera declarations only for disjoint external-team audiences;
- bounded 2D logic collision only, not Minecraft hitbox queries or 3D/swept physics;
- v8 world projection is compile-time declared and persistent; v13 additionally provides bounded incremental runtime grid projection, also persistent;
- v15 adds independent team-bound logical sessions; v16 adds explicit session-local Grid-to-world footprints inside one shared ownership rectangle. Automatic arena allocation, per-session ownership/private visibility scenes, dynamic matchmaking, independent per-player vanilla sidebars, persistent saves, and cross-player/session reductions are not implemented.

## Validation baseline

Portable v1-v16 compiler behavior is covered by the Node regression suite; generated milestone behavior has focused mod-free Minecraft 26.1 acceptance where the relevant semantics require it. The strongest acceptance path is generated-pack validation on the vanilla `second` environment with a real client where visual/input semantics matter.

Node migration ADR 0021 additionally established byte-for-byte output parity with the retired Java compiler for representative v1, v9, v10, and v11 programs including Bounce, Pinball, Breakout, Presentation, UI, World, JRPG, and spectate-camera cases. Node compiler regression tests are now the maintained build-time acceptance suite.


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
