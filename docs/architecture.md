# Architecture

## Goal

MC Game Runtime turns a Minecraft Java server into a fast game-prototyping host. Minecraft supplies rendering, player input, world geometry, entities, particles, audio, networking, and a convenient level editor. Gameplay logic is written in TypeScript carried by datapacks.

The intended iteration loop is:

```text
edit main.ts -> /reload -> play -> inspect/capture/test -> edit main.ts
```

## Responsibility boundaries

### Minecraft / Fabric server

Owns the authoritative Minecraft world and networking. Vanilla clients connect normally.

### MC Game Runtime mod

Owns the script lifecycle and translation layer between scripts and Minecraft. Its responsibilities are:

- discover script resources during datapack load/reload
- transpile TypeScript to JavaScript
- create a sandboxed JavaScript context per script
- snapshot player input once per server tick
- invoke script lifecycle callbacks
- expose capability-style APIs for actors/rendering, per-player UI panels, interactive menus, camera, world, and effects; game rules should consume these through a TypeScript presentation adapter when portability matters
- validate and execute the experimental `portable` fixed-point rule IR before ordinary TypeScript tick callbacks
- tag runtime-created entities so they can be cleaned up deterministically
- disable failed scripts without deliberately terminating the whole server

The runtime should not become the place where individual game rules are implemented.

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
- `builder.when(condition, thenFn, elseFn?)` records nested branches
- `builder.at(state, base?)` binds a state value to a projected coordinate
- `builder.block(id, spec)` declares a block-display projection supported by both backends
- `builder.camera(id, spec)` declares the single portable controller camera
- `builder.particle(id, spec)` declares a per-tick particle emitter, optionally guarded by a portable condition
- `builder.sound(id, spec)` declares a conditional sound emitter
- `builder.text(id, spec)` declares static-content world text with fixed or state-backed position
- `builder.hud(id, spec)` declares the single-line actionbar HUD
- `builder.box(id, spec)` and `builder.whenColliding(a, b, ...)` declare deterministic logic-space 2D AABB collision

ADR 0009 defines the IR and ADR 0010 defines the DSL as a pure frontend to that IR. Version 1 remains compatible with fixed-point scalar state and basic arithmetic/conditions. Version 2 adds fixed-point input registers, `first_player_hotbar_slot`, and bounded block-display projection metadata. Version 3 adds held player-input bindings (`forward/backward/left/right/jump/sneak/sprint`), one portable spectator camera, and bounded declarative particle emitters. Version 4 adds conditional sounds, static-content world text, one actionbar HUD, and deterministic 2D AABB collision. Values may be numeric constants, state references, or input references. The portable rule machine itself still does not execute arbitrary TypeScript. ADR 0011 defines the v3 input/camera/particle semantics and ADR 0012 defines the v4 sound/text/HUD/collision semantics.

The bundled DSL prelude automatically registers equivalent Fabric host adapters for the currently supported portable declarations. Therefore a DSL-only source can be run under the Fabric runtime for rapid iteration, or compiled into a datapack whose deployment target is vanilla Minecraft 26.1 with no runtime mod. Menus, sidebar panels, dynamic world-text content, arbitrary `render` calls, and other undeclared host capabilities remain Fabric-only until an explicit portable primitive is added.

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

ADR 0009 adds the vanilla backend for the restricted portable IR, ADR 0010 adds `portableDsl` as an ergonomic TypeScript authoring frontend, ADR 0011 defines the v3 held-input/camera/particle mappings, and ADR 0012 defines the v4 sound/text/HUD/collision mappings. `./gradlew compilePortable` transpiles the selected `main.ts`, installs the same bundled DSL prelude used by the Fabric runtime, evaluates top-level initialization in a sandbox with registration-only host stubs, captures the resulting `portable.define`, and emits a standalone datapack. The current backend maps:

- fixed-point state and input registers -> fake scoreboard players on a namespace-derived objective;
- program initialization -> a `minecraft:load`-tagged function;
- per-tick actions -> a `minecraft:tick`-tagged function;
- state arithmetic -> scoreboard set/add/remove/operation commands;
- conditions -> `execute if/unless score`;
- multi-action branches -> generated branch functions;
- `first_player_hotbar_slot` -> `SelectedItemSlot` sampled from the controller;
- v3 held input bindings -> Minecraft 26.1 `minecraft:entity_properties` player `type_specific.input` predicates evaluated every tick;
- `builder.block(...)` -> owned-tag `block_display` entities whose dynamic coordinates are updated from scoreboard state;
- `builder.camera(...)` -> one owned invisible marker armor stand plus `gamemode spectator` / `spectate`; while a camera is active, that tagged spectator remains the portable input controller;
- `builder.particle(...)` -> vanilla `particle` commands; dynamic emitter coordinates use owned marker entities whose positions are updated from scoreboard state;
- `builder.sound(...)` -> vanilla `playsound`; dynamic emitter coordinates use owned marker entities;
- `builder.text(...)` -> owned `text_display` entities with static content and fixed/state-backed coordinates;
- `builder.hud(...)` -> per-tick actionbar JSON composed from literals and scratch scoreboard values divided back to logical integers;
- `builder.whenColliding(...)` -> scoreboard-computed inclusive 2D AABB edge tests followed by generated branch functions;
- generated entity initialization -> temporary chunk force-loading for deterministic replacement, plus a generated `portable/cleanup` function that clears the HUD, detaches the camera, returns its controller to Adventure mode, removes generated entities, and removes the objective.

Ordinary arbitrary callback bodies and Minecraft host APIs are still not compiled. A DSL-only program using only supported portable primitives does not need the Fabric mod on the deployment server; the compiler/build environment still needs this repository's Java/Graal toolchain. `examples/portable-breakout-core` is the reference held-input + fixed-point physics + AABB collision + camera + block/text display + actionbar HUD + particle + sound example.

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
- portable IR v4 covers fixed-point scalar state/input, hotbar and held player-input bindings, block/text projections, one spectator camera, particle/sound emitters, one actionbar HUD, and 2D AABB collision; swept/3D collision, dynamic collections, randomness, event dispatch, menus, and sidebar panels are not portable yet
- generated vanilla play remains single-controller-oriented: without a camera it chooses the first non-spectator player; with a camera it tags that first controller and continues reading that player's input while spectating
- generated dynamic projections are designed around bounded arcade scenes; cleanup/reload guarantees are strongest for their declared initial chunks and do not yet form a general moving-entity ownership system
- ordinary arbitrary TypeScript callbacks and Minecraft host capabilities remain mod-only; only semantics represented in portable IR are emitted to vanilla datapacks
- no stable versioned script API yet
- no persistent script storage API
- no generic runtime-level player HP/combat abstraction; game scripts currently own gameplay HP/damage state themselves
- portable collision is deterministic 2D AABB only; there is still no Minecraft block/entity query abstraction
- `actors` remains a mannequin-specific compatibility API; new presentation code should prefer `render`
- `render.attach` currently follows translation only; it does not compose parent rotation/scale into child transforms
- `ui.panel` owns the vanilla sidebar channel while active and can be visually replaced by another system sending sidebar scoreboard packets
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
- `mc-mcp` TestBot input has now been validated end-to-end: a `playtest_scenario` forward move sets `ServerPlayer.getLastClientInput().forward()`, `input.players().forward` becomes true in TypeScript, and script logic can move a runtime actor in response. This makes mc-mcp suitable for automated input-driven E2E tests of script games.
- actor spawning and world edits still require usable target chunks; `world.setBlocks`/`world.fill` reduce script-boundary and neighbor-update overhead but may synchronously obtain chunks, so avoid unbounded distant edits in one tick
- a standalone 0.1.1 smoke test verified direct actor spawn/move/remove, exact final actor transform `[2.5, 101, 0.5]` / yaw `60`, and direct gold/diamond block writes. After compiler warmup and `/reload`, that smoke run produced no script-tick warning above the 10 ms threshold.
- the ADR 0005 grid/turn-based procedural roguelike rewrite has strict TypeScript compile coverage plus an off-server deterministic harness covering incremental map projection, one-action turn accounting, potion/bomb turn consumption, and 500 generated seeds across multiple floor difficulties; every tested exit was reachable and no tested enemy/loot spawn landed in a wall. Main-server mc-mcp E2E validation of the rewritten loop is still pending.

## Full game-loop example

`examples/topdown-roguelike` is now a grid-based, turn-based procedural roguelike. TypeScript is authoritative for dungeon topology, grid collision, turn resolution, player HP/death/restart, bump combat, enemy BFS movement, inventory/loot, floor progression, and the deterministic dungeon seed. The script projects its generated 29 x 37 tile map into a fixed world footprint with bounded `world.setBlocks` calls over multiple ticks, with gameplay disabled until projection finishes. `topdown_ts:arena/build` remains optional cleanup/setup tooling rather than the level source of truth. Hand-authored static maps still follow ADR 0002; script-owned procedural maps follow ADR 0005.
