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

IR versions 1 through 13 are implemented. ADR 0020 defines the multiplayer v12 contract; ADR 0022 defines the procedural grid/RNG v13 contract.

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

## Planned portable team PlayerSets v14

ADR 0023 is accepted for implementation but is not yet current runtime behavior. The planned v14 membership slice keeps `game.players()` as all online players and adds `game.teamPlayers(name)` for externally managed vanilla scoreboard teams. Team-backed sets are intended to drive `forEachPlayer`, `forSinglePlayer`, player-local HUD audiences, and multiple disjoint camera audiences without compiler-owned player tags or fixed names/UUIDs.

This milestone deliberately stops at membership/audience partitioning. Team/session-local shared state, grids/RNG, private world projection, team-local sidebars, reductions, and compiler-owned matchmaking remain future work. Until v14 implementation and the ADR 0023 two-real-client acceptance gate pass, v13 remains the latest implemented Portable IR version.

## Current limitations

- single-file TypeScript; no import/module resolution;
- v1-v11 remain single-controller-oriented for compatibility; v12 is the multiplayer model;
- fixed-point arithmetic relies on Minecraft scoreboard 32-bit behavior; generated commands do not add generic overflow guards;
- no runtime generic arrays/collections, arbitrary packet-event dispatch, clickable inventory/dialog UI, persistent game storage, or arbitrary Minecraft queries; v13 provides bounded grid/RNG topology primitives but not generic collections or pathfinding;
- one server-global sidebar and one shared camera declaration;
- bounded 2D logic collision only, not Minecraft hitbox queries or 3D/swept physics;
- v8 world projection is compile-time declared and persistent; v13 additionally provides bounded incremental runtime grid projection, also persistent;
- v12 currently has one shared game instance whose participant set is all online players; filtered teams/lobbies, simultaneous sessions, private world scenes, independent per-player vanilla sidebars, distinct per-player cameras, and cross-player reductions are not implemented.

## Validation baseline

Portable v1-v13 compiler behavior is covered by the Node regression suite; generated v1-v11 gameplay has been exercised on mod-free Minecraft 26.1. The strongest acceptance path is generated-pack validation on the vanilla `second` environment with a real client where visual/input semantics matter.

Node migration ADR 0021 additionally established byte-for-byte output parity with the retired Java compiler for representative v1, v9, v10, and v11 programs including Bounce, Pinball, Breakout, Presentation, UI, World, JRPG, and spectate-camera cases. Node compiler regression tests are now the maintained build-time acceptance suite.


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
