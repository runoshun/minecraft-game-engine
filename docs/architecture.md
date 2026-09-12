# Architecture

## Goal

MC Game Runtime is evolving into a TypeScript-to-vanilla-datapack game compiler. Minecraft supplies rendering, player input, world geometry, entities, particles, audio, networking, and a convenient level editor. Portable gameplay is authored with `portableDsl`, lowered to versioned IR, and compiled to ordinary datapack resources.

The primary portable loop is:

```text
edit main.ts -> compilePortable -> copy/reload generated datapack -> play/test/capture -> edit main.ts
```

The Fabric runtime keeps the older `/reload`-direct TypeScript loop as an optional development/compatibility backend while the retirement gates in ADR 0013 remain open.

## Responsibility boundaries

### Minecraft / Fabric server

Owns the authoritative Minecraft world and networking. Vanilla clients connect normally.

### Portable compiler / vanilla backend

This is the primary backend for new portable games. It transpiles TypeScript for build-time DSL evaluation, captures versioned Portable IR, validates bounded declarations, and emits standalone Minecraft datapack resources. The generated pack owns its scoreboards, functions, predicates, Display/marker/camera entities, HUD projection, and cleanup function. The target server does not need the runtime mod.

### MC Game Runtime Fabric backend (transitional)

The Fabric mod remains an optional development/compatibility backend. It discovers `mcgame/main.ts`, executes TypeScript/GraalJS, interprets the same portable IR, and exposes legacy host capabilities such as generic render, actors, menus, panels, and world mutation that are not all portable yet. New game-facing semantics should be added to Portable IR and the vanilla compiler first unless vanilla cannot represent them.

The Fabric backend should not become the place where new individual game rules are implemented; ADR 0013 defines explicit gates for retiring it.

### TypeScript game scripts

Own game-specific state and rules: movement, combat, AI, rooms, loot, procedural generation, win/loss state, and similar mechanics.

### mc-mcp

Acts as the development/test control plane. It can edit datapacks/worlds, execute commands, drive test clients, inspect state, and capture screenshots. It should not be a required runtime dependency for a player to play a script game.

## Script resource model

PoC discovery scans server data resources and loads paths ending in `mcgame/main.ts`. A typical pack is:

```text
world/datapacks/my_game/
├── pack.mcmeta
└── data/my_game/mcgame/main.ts
```

Each discovered `main.ts` becomes an independent script instance and JavaScript context.

Current limitation: TypeScript module/import resolution is not implemented. Scripts are single-file programs.

A `main.ts` may declare one experimental portable program either directly with `portable.define(...)` or through the `portableDsl(...)` authoring frontend. The DSL is bundled by the runtime/compiler and lowers to the same versioned portable IR; it is not a second execution engine. The IR can be interpreted by the Fabric runtime or extracted at build time and compiled to a standalone vanilla datapack.

## Reload lifecycle

At server start and after a successful datapack reload:

1. discover `mcgame/main.ts` resources
2. read source with a 1 MB PoC limit
3. transpile with bundled TypeScript 5.9.2 targeting ES2022
4. instantiate a sandboxed GraalJS context
5. evaluate top-level script code, which registers callbacks
6. close old script instances and clean their owned entities/cameras
7. invoke `game.onStart` callbacks for the new instances

If datapack reload itself fails, existing scripts are kept. Script compilation/start failures are logged and the failing script is not activated.

## Tick model

The runtime runs from Fabric's end-of-server-tick event. For each active script it:

1. snapshots all online players and `ServerPlayer.getLastClientInput()`
2. folds server-observable vanilla action packets into per-player semantic actions and derives rising edges for held movement buttons
3. snapshots the selected hotbar slot and detects slot changes
4. calls registered `game.onBeforeTick` callbacks so host input adapters can update portable input registers
5. executes the script's `portable` fixed-point rule list, if declared
6. calls registered `game.onTick` callbacks
7. advances per-script input baselines for the next tick

Minecraft remains the clock source, nominally 20 TPS / 50 ms per tick.

A soft warning is logged for a script tick over 10 ms. Normal game ticks retain a 100 ms hard watchdog. Runtime 0.2.1+ gives cold script evaluation and `game.onStart` a separate 1000 ms startup budget so GraalJS/class initialization does not falsely disable a game immediately after a server restart. The watchdog is a PoC safety measure, not yet a fully validated resource-governance mechanism.

## Public script API

### portable / portableDsl (experimental)

Low-level IR API:

- `portable.define(spec)`; initialization-only, at most once per script
- `portable.get(state)` / `portable.raw(state)`
- `portable.setInput(input, value)` / `portable.input(input)`

Authoring frontend:

- `portableDsl(options?, builder)`
- `builder.state(name, initial)` returns a mutable fixed-point state reference with `set/add/sub/negate` and comparison helpers
- `builder.input(name, initial?, binding?)` returns a read-only input reference
- `builder.tick(fn)` records deterministic per-tick rules
- `builder.repeat(count, fn)` executes only while building the DSL and statically expands bounded repeated declarations
- `builder.when(condition, thenFn, elseFn?)` records nested branches
- `builder.at(state, base?)` binds a state value to a projected coordinate
- `builder.block(id, spec)` declares a block-display projection supported by both backends; v5 `when` controls visibility from portable state
- `builder.camera(id, spec)` declares the single portable controller camera
- `builder.particle(id, spec)` declares a per-tick particle emitter, optionally guarded by a portable condition
- `builder.sound(id, spec)` declares a conditional sound emitter
- `builder.text(id, spec)` declares world text with fixed/state-backed position; v7 text may be a bounded literal/state/input token list and v5 `when` controls visibility
- `builder.actor(id, spec)` declares a bounded character projection with state-backed position/yaw and optional `when`; v7 supports mannequin/zombie/skeleton semantic appearances
- `builder.worldBatch(id, spec)` declares bounded compile-time block writes; an unconditional batch applies on load and `when`-guarded batches apply while their condition is true
- `builder.worldFill(id, spec)` is build-time sugar that expands an inclusive cuboid into a bounded world batch
- `builder.hud(id, spec)` declares the single-line actionbar HUD
- `builder.box(id, spec)` and box/box `builder.whenColliding(...)` declare deterministic logic-space 2D AABB collision
- `builder.circle(id, spec)` and circle/circle `builder.whenColliding(...)` declare bounded deterministic circle collision
- `builder.segment(id, spec)` / `builder.capsule(id, spec)` declare static line/capsule geometry; circle/segment and circle/capsule `builder.whenColliding(...)` use deterministic quantized tests
- `builder.trigger(id, boxSpec)` plus `builder.whenTriggered(...)` declare an AABB sensor that observes the watched collider center without implicit physical response
- `builder.flipper(id, spec)` declares two compile-time capsule poses selected by `activeWhen`; collision response remains authored by the game

ADR 0009 defines the IR and ADR 0010 defines the DSL as a pure frontend to that IR. Version 1 remains compatible with fixed-point scalar state and basic arithmetic/conditions. Version 2 adds fixed-point input registers, `first_player_hotbar_slot`, and bounded block-display projection metadata. Version 3 adds held player-input bindings (`forward/backward/left/right/jump/sneak/sprint`), one portable spectator camera, and bounded declarative particle emitters. Version 4 adds conditional sounds, static-content world text, one actionbar HUD, and deterministic 2D AABB collision. Version 5 adds compile-time static collection expansion, conditional block/text visibility, and quantized deterministic circle/circle collision. Version 6 adds bounded static segment/capsule collision, center-point trigger zones, and two-pose flippers lowered to ordinary conditions plus circle/capsule tests. Version 7 adds bounded declarative actor projections with state-backed position/yaw/conditional lifetime plus bounded dynamic world-text scalar tokens. Version 8 adds bounded compile-time world-write batches and build-time `worldFill` expansion with optional portable conditions. Version 9 adds one bounded declarative sidebar with static title and dynamic literal/state/input rows; input action edges remain ordinary held-input plus state logic rather than a new event channel. Values may be numeric constants, state references, or input references. The portable rule machine itself still does not execute arbitrary TypeScript. ADR 0011 defines v3, ADR 0012 defines v4, ADR 0013 defines v5 plus the vanilla-first backend direction, ADR 0014 defines the v6 pinball primitives, ADR 0015 defines v7 presentation, ADR 0016 defines v8 bounded world projection, and ADR 0017 defines v9 sidebar/input semantics.

The bundled DSL prelude also registers equivalent Fabric host adapters for supported portable declarations, but this is now the secondary compatibility path. The normal deployment artifact for a portable game is the generated vanilla Minecraft 26.1 datapack. Menus, sidebar panels, arbitrary runtime-created `render` nodes, model/item projections, attachment graphs, and other undeclared host capabilities remain Fabric-only until explicitly mapped or retired.

### game

- `game.onStart(fn)`
- `game.onBeforeTick(fn)`; receives `{ tick }` and runs after input snapshotting but before portable rules
- `game.onTick(fn)`; receives `{ tick }`
- `game.log(...)`

### input

- `input.players()`
- `input.get(uuidOrName)`
- `input.pressed(uuidOrName, action)`

Player snapshots expose:

- identity: `id`, `name`
- Minecraft location: `dimension`, `x`, `y`, `z`
- held input: `forward`, `backward`, `left`, `right`, `jump`, `sneak`, `sprint`
- compatibility rising edges: `jumpPressed`, `sneakPressed`, `sprintPressed`
- hotbar state: zero-based `hotbarSlot` and `hotbarChanged`
- `pressedActions`, containing semantic rising-edge/action names for the current tick

The semantic action model is deliberately server-observable rather than physical-key based. It includes movement rising edges plus `attack`, `swing`, `use`, `swap_offhand`, `drop`, `drop_stack`, use-release/block-destroy phases, pick, stab, vehicle inventory, riding jump, fall-flying start, and `hotbar_changed`. This lets scripts use vanilla actions commonly bound to F, Q, mouse buttons, and hotbar selection without a client mod and continues to work when players rebind keys. A server-only mod cannot observe client-local keys such as ordinary E inventory open, Esc, Tab, F1, or F5. Hotbar slot changes are observable, but the server cannot distinguish number-key selection from mouse-wheel selection, nor detect pressing the already-selected number key.

### actors

- `actors.spawn(id, options)`
- `actors.move(id, options)`
- `actors.remove(id)`

Actors are script-owned inert presentation entities. `actors.spawn(id, options)` defaults to `minecraft:mannequin`, and `options.entityType` may select a Minecraft `Mob` such as `minecraft:zombie` or `minecraft:skeleton`. The runtime disables Mob AI, gravity, collision physics, normal damage, sounds, and daylight fire so gameplay state remains authoritative in TypeScript rather than leaking into vanilla Mob simulation. Script-owned Mob actors also bypass vanilla `Mob.checkDespawn`, including the hostile-mob removal performed in Peaceful difficulty, so actor presentation does not depend on the server difficulty. Actor movement/removal uses tracked Java references and Minecraft's teleport synchronization path so same-dimension movement is propagated to vanilla clients. `texture` remains mannequin-only; custom resource-pack mannequin textures still use the command-backed spawn/move fallback until profile construction is moved to the direct path. Non-Mob entity types are rejected.

### render

- `render.spawn(id, options)`
- `render.update(id, options)`
- `render.remove(id)`
- `render.attach(childId, parentId, offset)`
- `render.detach(childId)`

`render` is the generic presentation projection API. It maps `character` to mannequins and Display projections. Display projections support scale, offset, roll, billboard constraints, position/rotation interpolation, and transformation interpolation. Position/rotation updates use Minecraft's teleport synchronization path so high-frequency script motion reaches vanilla clients while preserving Display teleport interpolation. Private Display setters are invoked through runtime Mixins rather than exposing Java objects to scripts.

`render.attach` is a translation-follow relationship for labels, overhead bars, and simple child projections. Attached children are repositioned from their parent each tick, follow dimension transfers, and are recursively removed when the parent is removed. It is not a full hierarchical rotation/scale transform graph.

### ui

- `ui.panel(player, { title, rows })`
- `ui.panel(player, null)`
- `ui.hud(player, text)` / `ui.hud(player, null)`

`ui.panel` is a per-player informational panel rendered as the vanilla scoreboard sidebar. The runtime sends scoreboard packets directly to that player instead of creating objectives in the authoritative server scoreboard, so game HUD values remain presentation-only. Up to 15 rows are supported, row identity is stable through `row.id`, and updates send only changed/removed rows. `ui.hud` is the lightweight actionbar channel used by the portable v4 HUD adapter; it accepts the same `UiText` form and is cleared when its owning script unloads.

### menu

- `menu.onAction(callback)`
- `menu.open(player, spec)`
- `menu.update(player, spec)`
- `menu.close(player, menuId?)`

`kind: "items"` uses a virtual vanilla chest menu and converts UI-slot clicks into semantic `actionId` events without transferring the displayed ItemStacks. `kind: "choice"` uses Minecraft 26.1 Dialog buttons backed by runtime-owned custom-click tokens; a server packet hook validates the player/token and emits the same `menu.onAction` event shape. `menu.update` currently replaces/reopens the active menu rather than diffing widgets in place.

### camera

- `camera.attach(player, options)`
- `camera.move(player, options)`
- `camera.detach(player)`

The PoC camera uses an invisible marker armor stand observed by a spectator player. This avoids the severe jitter caused by teleporting the real player every tick.

Current detach behavior switches the player to Adventure mode; original gamemode restoration is not yet implemented.

### world / effects

- `world.setBlock(options)`
- `world.setBlocks({ dimension?, blocks })`
- `world.fill(options)`
- `effects.particle(options)`
- `effects.sound(options)`

`world.setBlock` preserves normal server block-update semantics through `ServerLevel.setBlock(..., Block.UPDATE_ALL)`. `world.setBlocks` and `world.fill` are bounded bulk projection primitives (maximum 32,768 writes per call) that cross the Graal/Java boundary once and use client-visible fast update flags without neighbor updates or block drops. They are intended for script-owned terrain/render projection such as floors, walls, and air clearing; redstone, gravity, or other neighbor-dependent mechanics should use normal updates instead. Bulk calls may still synchronously obtain chunks, so scripts should keep edits spatially bounded and may amortize large projections across ticks. Effects remain command-backed in the current PoC. `effects.particle` accepts optional `delta`, `speed`, `count`, and `force` parameters in addition to particle id and position; portable DSL particle emitters lower to the same shape on the Fabric adapter.

The initial API intentionally stays small. New capabilities should be added deliberately rather than exposing raw command execution or raw Minecraft Java objects.

Presentation follows ADR 0004 and `docs/presentation-api.md`. Game Core TypeScript should not depend on Minecraft primitives such as scoreboards, dialogs, mannequins, or Display entities. A game-owned presentation interface maps semantic appearance/panel/menu/audio/FX intent into the Minecraft adapter. Runtime 0.2.0 implements broad `render`, `ui.panel`, and `menu` capability families rather than one Mod API per Minecraft feature.


## Portable vanilla-datapack compilation

ADR 0009 adds the vanilla backend for the restricted portable IR, ADR 0010 adds `portableDsl` as its TypeScript authoring frontend, ADR 0011 defines v3 held-input/camera/particle mappings, ADR 0012 defines v4 sound/text/HUD/collision mappings, ADR 0013 makes this backend primary while defining v5 static collections/visibility/circle collision, ADR 0014 defines the bounded v6 pinball primitives, ADR 0015 adds bounded v7 presentation projections, ADR 0016 adds bounded v8 world projection, and ADR 0017 adds the bounded v9 sidebar plus the input-action portability policy. `./gradlew compilePortable` transpiles the selected `main.ts`, installs the same bundled DSL prelude used by the Fabric runtime, evaluates top-level initialization in a sandbox with registration-only host stubs, captures the resulting `portable.define`, and emits a standalone datapack. The current backend maps:

- fixed-point state and input registers -> fake scoreboard players on a namespace-derived objective;
- program initialization -> a `minecraft:load`-tagged function;
- per-tick actions -> a `minecraft:tick`-tagged function;
- state arithmetic -> scoreboard set/add/remove/operation commands;
- conditions -> `execute if/unless score`;
- multi-action branches -> generated branch functions;
- `first_player_hotbar_slot` -> `SelectedItemSlot` sampled from the controller;
- v3 held input bindings -> Minecraft 26.1 `minecraft:entity_properties` player `type_specific.input` predicates evaluated every tick;
- `builder.block(...)` -> owned-tag `block_display` entities whose dynamic coordinates are updated from scoreboard state; v5 `when` toggles the Display scale between its declaration and zero;
- `builder.camera(...)` -> one owned invisible marker armor stand plus `gamemode spectator` / `spectate`; while a camera is active, that tagged spectator remains the portable input controller;
- `builder.particle(...)` -> vanilla `particle` commands; dynamic emitter coordinates use owned marker entities whose positions are updated from scoreboard state;
- `builder.sound(...)` -> vanilla `playsound`; dynamic emitter coordinates use owned marker entities;
- `builder.text(...)` -> owned `text_display` entities with fixed/state-backed coordinates; v7 bounded literal/state/input tokens are projected through scratch scoreboard values, while v5 `when` controls visibility;
- `builder.actor(...)` -> owned tagged `minecraft:mannequin` entities with fixed/state-backed position and yaw; zombie/skeleton intents map to a mannequin wearing the corresponding vanilla mob head so the mapping remains valid on Peaceful difficulty; `when` removes/recreates the bounded actor;
- `builder.worldBatch(...)` / `builder.worldFill(...)` -> generated chunk-grouped `setblock` functions; unconditional batches run once from load, conditional batches run while their portable condition is true, and each touched chunk is temporarily force-loaded only around its writes;
- `builder.hud(...)` -> per-tick actionbar JSON composed from literals and scratch scoreboard values divided back to logical integers;
- `builder.sidebar(...)` -> one generated vanilla scoreboard sidebar with a static title and 1..15 stable rows; row text is composed per tick from bounded literal/state/input tokens, numeric row scores are hidden, and the generated auxiliary objective is removed by `portable/cleanup`; the vanilla display slot is server-global under the current single-controller contract;
- box/box `builder.whenColliding(...)` -> scoreboard-computed inclusive 2D AABB edge tests followed by generated branch functions;
- circle/circle `builder.whenColliding(...)` -> scoreboard squared-distance tests after bounded fixed-point quantization to approximately 0.01-block units;
- circle/segment and circle/capsule `builder.whenColliding(...)` -> static endpoint geometry, coarse expanded-AABB rejection, then bounded dot/endpoint/cross-product scoreboard tests on the same quantized grid;
- `builder.trigger(...)` / `builder.whenTriggered(...)` -> inclusive AABB center-point sensor tests with no implicit response;
- `builder.flipper(...)` -> two compile-time capsule poses selected by an ordinary portable condition; the game callback owns the resulting velocity/score/FX response;
- `builder.repeat(...)` -> build-time declaration expansion only; no runtime loop is emitted;
- generated entity initialization -> temporary chunk force-loading for deterministic replacement, plus a generated `portable/cleanup` function that clears the HUD, detaches the camera, returns its controller to Adventure mode, removes generated entities, removes the owned sidebar objective when present, and removes the main objective.

Ordinary arbitrary callback bodies and Minecraft host APIs are still not compiled. A DSL-only program using only supported portable primitives does not need the Fabric mod on the deployment server; the compiler/build environment still needs this repository's Java/Graal toolchain. `examples/portable-breakout-core` is the reference brick-breaker, `examples/portable-pinball-core` covers v6 pinball, `examples/portable-presentation-core` covers v7 bounded actors/dynamic labels, `examples/portable-world-core` is the v8 bounded world-projection acceptance example, and `examples/portable-ui-core` covers the v9 sidebar plus held-input rising-edge recipe.

## Entity ownership

Every runtime-created actor, render projection, and camera receives script ownership metadata/tags. Display projections retain their logical node metadata so runtime 0.2.1+ can reacquire the live Minecraft entity after a chunk unload/reload invalidates the previous Java object reference. Runtime 0.2.2 also explicitly loads the target chunk before direct actor/render spawn and clears any persisted projection with the same logical id before recreating it. When a script unloads, owned actors/render nodes are discarded, command-fallback/camera entities with the owner tag are killed, attached spectator views are detached, per-player panels are cleared, open menu state is closed where possible, and Dialog custom-click tokens are invalidated.

This is important for `/reload`: old runtime entities, UI, and action tokens must not leak into the newly loaded script instance.

## Sandbox

Both the compiler context and game-script contexts currently disable:

- host object/class access
- filesystem/network IO
- guest-created threads
- native access
- polyglot access

Only explicitly installed proxy objects (`portable`, `game`, `input`, `actors`, `render`, `ui`, `menu`, `camera`, `world`, `effects`) are visible. `portable` is a deterministic rule/state capability; the remaining objects are Minecraft host capabilities.

The intended security boundary is capability-based: scripts should never receive a `MinecraftServer`, entity Java object, arbitrary command executor, filesystem handle, or network client.

This PoC has not been security-audited and should not yet be treated as safe for untrusted hostile scripts.

## Embedded dependencies

The mod JAR embeds the GraalJS runtime through Fabric Jar-in-Jar metadata. TypeScript's `typescript.js` and the portable DSL prelude are bundled as mod resources. For the embedded-TypeScript execution path, a production server needs the runtime mod, Fabric API, and Java 25; Node.js is not required. A generated portable vanilla datapack is different: its target server needs only compatible vanilla Minecraft because GraalJS/TypeScript/DSL execution happened at build time.

## External bridge

An earlier external TCP/JSONL bridge PoC exists separately. The long-term design may retain an optional remote bridge for Python/Rust/AI/external tooling, but the embedded TypeScript runtime is the preferred default prototyping path. Remote execution is not part of this repository's current implemented API.

## Known PoC limitations

- single-file TypeScript only
- portable IR v9 covers fixed-point scalar state/input, hotbar and held input, state-authored rising-edge actions, block/text projections with conditional visibility and bounded dynamic scalar text tokens, bounded mannequin/zombie/skeleton actor projections, bounded compile-time world batches/fills, one spectator camera, particle/sound emitters, one actionbar HUD, one bounded 15-row sidebar, 2D AABB, circle/circle, and circle/static-capsule collision, center-point AABB triggers, two-pose flippers, plus compile-time static collection expansion; dynamic segment endpoints, continuously rotating geometry, swept/3D collision, runtime dynamic collections/randomness/procedural topology, generic packet-event dispatch, clickable chest/dialog menus, and per-player portable sidebars remain out of scope
- generated vanilla play remains single-controller-oriented: without a camera it chooses the first non-spectator player; with a camera it tags that first controller and continues reading that player's input while spectating
- generated dynamic projections are designed around bounded arcade scenes; cleanup/reload guarantees are strongest for their declared initial chunks and do not yet form a general moving-entity ownership system
- ordinary arbitrary TypeScript callbacks and Minecraft host capabilities remain mod-only; only semantics represented in portable IR are emitted to vanilla datapacks; v8 world batches do not compile arbitrary callback-time `world.*` calls
- no stable versioned script API yet
- no persistent script storage API
- no generic runtime-level player HP/combat abstraction; game scripts currently own gameplay HP/damage state themselves
- portable collision is deterministic logic-space AABB/circle/static-capsule only; circle/capsule geometry is quantized and bounded for scoreboard-safe arithmetic, triggers currently observe collider centers, and there is still no Minecraft block/entity query abstraction
- legacy `actors` remains a Fabric compatibility API; portable v7 covers only bounded mannequin/zombie/skeleton declarative actors and does not make the mutable host API portable
- `render.attach` currently follows translation only; it does not compose parent rotation/scale into child transforms
- Fabric `ui.panel` is packet-local per player, while portable v9 `game.sidebar` owns the real vanilla global sidebar objective/display slot; another datapack can replace that display slot, and independent per-player portable sidebars are not supported
- runtime 0.2.0/0.2.1 main-server smoke testing exposed lifecycle differences hidden by the local spawn-chunk test: cold `onStart` needed a separate startup budget, Display Java references can become stale across chunk unload/reload, and direct spawn must load its target chunk first; runtime 0.2.2 addresses all three and requires repeat main-server validation
- menu/Dialog/container click behavior has compile-time coverage; open/render behavior is covered by main-server smoke testing, while semantic click delivery still needs a tool/client path that can click those GUI controls
- camera detach does not restore the player's prior gamemode
- camera operations, effects, and custom-texture actor fallback still translate through Minecraft commands; default actor transforms/removal and `world.setBlock` now use direct server APIs
- watchdog/resource limits need more validation
- no multiplayer game-session ownership abstraction beyond per-script entity tags

## Validation notes

Validated on the `main` development server with Minecraft 26.1, Fabric Loader 0.19.5, Java 25, and Fabric API 0.155.2+26.1.2:

- a datapack resource at `data/<namespace>/mcgame/main.ts` is discovered on `/reload`
- embedded TypeScript compilation succeeds and `game.onStart()` executes
- `actors.spawn()` creates a mannequin projection in-world
- `game.onTick()` executes while the server is actively ticking
- editing `main.ts` and running `/reload` replaces the old script instance, cleans up its owned actor, and starts the new instance
- removing the datapack and reloading returns the runtime to zero active scripts and cleans up owned entities

Testing caveats:

- the development server pauses ticking when it has been empty for 60 seconds, so `onTick()` tests need an online player/bot or another reason for the server to tick
- portable v3 camera/input was validated on `main` with a pure smoke datapack: a player spectating an invisible armor stand continued to report `left`, `jump`, and `right` through Minecraft 26.1 player-input predicates. The generated DSL Breakout was then validated on the mod-free `second` server (`loader=vanilla`, no installed jars): A/D moved the paddle, Space launched the ball, the generated spectator camera remained fixed, and generated particle commands loaded alongside the display projection.
- portable v4 was validated on a fresh mod-free `second` world with the generated Breakout datapack: `text_display` title and actionbar HUD rendered on a real 26.1 client, generated `playsound`/particle commands loaded without datapack errors, A/D and Space advanced portable state, and the score reached 2 through actual paddle overlaps. A frozen-tick deterministic check then produced score `1` for a known overlapping ball/paddle AABB and `0` for a known horizontal miss.
- portable v5 was validated on a fresh mod-free `second` world. The generated smoke datapack covered circle overlap/miss and `when`-controlled Display visibility. The full 40-brick reference Breakout was then compiled to a standalone vanilla datapack (53 scalar states, 43 block projections) and played with the real 26.1 render client: A/D moved the paddle, Space launched the ball while using the generated fixed camera, an actual brick collision changed `brick38` from 1 to 0, reduced `bricksLeft` from 40 to 39, increased score from 0 to 1, zero-scaled that brick Display, and updated the actionbar HUD. A later drain reduced lives from 3 to 2 and returned to serve; an all-clear tick restored all 40 brick states/Displays and returned to serve. Particle/sound commands loaded and executed from the same hit condition. A text-display E2E check also caught and fixed double-encoded component SNBT so world text now renders as `PORTABLE BREAKOUT` rather than a literal JSON object. This satisfies ADR 0013 retirement gate 1; the representative pinball gate was subsequently satisfied by portable v6 as recorded below.
- portable v6 was validated on the same mod-free `second` environment with generated `portable_pinball`: reload reported no datapack errors; a real 26.1 client rendered the board/title/HUD and stayed on the generated spectator camera; deterministic tests hit a static capsule rail (`ballVx -0.10 -> 0.18`), drained through the trigger (`lives 3 -> 2`, `playing -> 0`), and hit a circle bumper (`score +10`, bumper response velocity). Real A and D input each selected the corresponding active flipper pose and produced the expected one-hit flipper response (`score +5`, `ballVx +0.24` on left and `-0.24` on right). Space launched normal play, a proof recording showed the table/flippers in motion, and the generated state remained live with score/ball position updates. This satisfies ADR 0013 retirement gate 2. During repeated load/restart testing, persisted Display/camera entities could briefly duplicate until their chunks were force-loaded and cleanup rerun; gate 4 therefore remains open and must harden generated ownership/reload semantics before Fabric deletion.
- portable v7 presentation was validated on the mod-free `second` server with generated `portable_presentation`: a real client rendered a normal mannequin plus zombie-head and skeleton-skull variants; A/D input changed portable `heroX`/`heroYaw` and the owned mannequin `Pos`/`Rotation` in lockstep; the state-backed hero label moved with the actor and changed its text component from `HERO YAW 0` to `HERO YAW -90`; conditional actor removal/re-spawn restored the zombie-head appearance. Direct hostile-Mob summon was separately confirmed to be rejected by Peaceful difficulty, which is why the vanilla mapping uses mannequin carriers. Reconnecting the Camera player also exposed a stale controller tag from the already-cleaned pinball pack while that player had been offline, adding an offline-player ownership case to gate 4. This closes the required bounded P1 `render`/`actors` presentation slice; generic runtime-created render nodes, model/item projections and attachment graphs are intentionally out of scope.
- `mc-mcp` TestBot input has now been validated end-to-end: a `playtest_scenario` forward move sets `ServerPlayer.getLastClientInput().forward()`, `input.players().forward` becomes true in TypeScript, and script logic can move a runtime actor in response. This makes mc-mcp suitable for automated input-driven E2E tests of script games.
- legacy Fabric actor spawning and world edits still require usable target chunks. Portable v8 world batches instead generate chunk-grouped force-load/setblock/unload functions; terrain writes persist after `portable/cleanup` and acceptance teardown must restore temporary footprints explicitly
- a standalone 0.1.1 smoke test verified direct actor spawn/move/remove, exact final actor transform `[2.5, 101, 0.5]` / yaw `60`, and direct gold/diamond block writes. After compiler warmup and `/reload`, that smoke run produced no script-tick warning above the 10 ms threshold.
- the ADR 0005 grid/turn-based procedural roguelike rewrite has strict TypeScript compile coverage plus an off-server deterministic harness covering incremental map projection, one-action turn accounting, potion/bomb turn consumption, and 500 generated seeds across multiple floor difficulties; every tested exit was reachable and no tested enemy/loot spawn landed in a wall. Main-server mc-mcp E2E validation of the rewritten loop is still pending.

## Full game-loop example

`examples/topdown-roguelike` is now a grid-based, turn-based procedural roguelike. TypeScript is authoritative for dungeon topology, grid collision, turn resolution, player HP/death/restart, bump combat, enemy BFS movement, inventory/loot, floor progression, and the deterministic dungeon seed. The script currently projects its runtime-generated 29 x 37 tile map into a fixed world footprint with Fabric `world.setBlocks` calls over multiple ticks, with gameplay disabled until projection finishes. Portable v8 supplies bounded declarative world projection but does not yet make this runtime array/randomness-driven generator portable; that rewrite remains part of gate 5. `topdown_ts:arena/build` remains optional cleanup/setup tooling rather than the level source of truth. Hand-authored static maps still follow ADR 0002; script-owned procedural maps follow ADR 0005.
