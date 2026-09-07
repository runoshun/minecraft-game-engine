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
2. derives rising-edge values for jump/sneak/sprint
3. calls registered `game.onTick` callbacks
4. stores current button state for edge detection on the next tick

Minecraft remains the clock source, nominally 20 TPS / 50 ms per tick.

A soft warning is logged for a script tick over 10 ms. Normal game ticks retain a 100 ms hard watchdog. Runtime 0.2.1+ gives cold script evaluation and `game.onStart` a separate 1000 ms startup budget so GraalJS/class initialization does not falsely disable a game immediately after a server restart. The watchdog is a PoC safety measure, not yet a fully validated resource-governance mechanism.

## Public script API

### game

- `game.onStart(fn)`
- `game.onTick(fn)`; receives `{ tick }`
- `game.log(...)`

### input

- `input.players()`
- `input.get(uuidOrName)`

Player snapshots currently expose:

- identity: `id`, `name`
- Minecraft location: `dimension`, `x`, `y`, `z`
- held input: `forward`, `backward`, `left`, `right`, `jump`, `sneak`, `sprint`
- rising edges: `jumpPressed`, `sneakPressed`, `sprintPressed`

### actors

- `actors.spawn(id, options)`
- `actors.move(id, options)`
- `actors.remove(id)`

Actors are currently implemented as `minecraft:mannequin` entities. The default mannequin path is backed by direct server Entity APIs: the runtime keeps a Java reference per script actor, applies movement directly, and discards the entity directly on removal/reload. Custom resource-pack textures still use the command-backed spawn/move fallback until mannequin profile construction is moved to the direct path. The mannequin implementation remains an internal detail and may change.

### render

- `render.spawn(id, options)`
- `render.update(id, options)`
- `render.remove(id)`
- `render.attach(childId, parentId, offset)`
- `render.detach(childId)`

`render` is the generic presentation projection API. It maps `character` to mannequins and Display projections. Display projections support scale, offset, roll, billboard constraints, position/rotation interpolation, and transformation interpolation. Private Display setters are invoked through runtime Mixins rather than exposing Java objects to scripts.

`render.attach` is a translation-follow relationship for labels, overhead bars, and simple child projections. Attached children are repositioned from their parent each tick, follow dimension transfers, and are recursively removed when the parent is removed. It is not a full hierarchical rotation/scale transform graph.

### ui

- `ui.panel(player, { title, rows })`
- `ui.panel(player, null)`

The current persistent HUD capability is a per-player informational panel rendered as the vanilla scoreboard sidebar. The runtime sends scoreboard packets directly to that player instead of creating objectives in the authoritative server scoreboard, so game HUD values remain presentation-only. Up to 15 rows are supported, row identity is stable through `row.id`, and updates send only changed/removed rows.

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
- `effects.particle(options)`
- `effects.sound(options)`

`world.setBlock` resolves the block through the server registry and calls the ServerLevel block API directly; it no longer invokes the command parser. This preserves the small capability surface while removing command parsing from block-write hot paths. Individual writes still perform normal block updates and can synchronously obtain target chunks, so large map generation should use a future batched/fill capability rather than thousands of per-tick `setBlock` calls. Until such a capability exists, script-owned procedural geometry may amortize a bounded number of writes across multiple ticks and keep gameplay disabled until projection completes; the grid roguelike example uses that pattern. Effects remain command-backed in the current PoC.

The initial API intentionally stays small. New capabilities should be added deliberately rather than exposing raw command execution or raw Minecraft Java objects.

Presentation follows ADR 0004 and `docs/presentation-api.md`. Game Core TypeScript should not depend on Minecraft primitives such as scoreboards, dialogs, mannequins, or Display entities. A game-owned presentation interface maps semantic appearance/panel/menu/audio/FX intent into the Minecraft adapter. Runtime 0.2.0 implements broad `render`, `ui.panel`, and `menu` capability families rather than one Mod API per Minecraft feature.

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

Only explicitly installed proxy objects (`game`, `input`, `actors`, `render`, `ui`, `menu`, `camera`, `world`, `effects`) are visible as Minecraft capabilities.

The intended security boundary is capability-based: scripts should never receive a `MinecraftServer`, entity Java object, arbitrary command executor, filesystem handle, or network client.

This PoC has not been security-audited and should not yet be treated as safe for untrusted hostile scripts.

## Embedded dependencies

The mod JAR embeds the GraalJS runtime through Fabric Jar-in-Jar metadata. TypeScript's `typescript.js` is also bundled as a mod resource. Therefore a production server only needs the runtime mod, Fabric API, and Java 25; Node.js is not required.

## External bridge

An earlier external TCP/JSONL bridge PoC exists separately. The long-term design may retain an optional remote bridge for Python/Rust/AI/external tooling, but the embedded TypeScript runtime is the preferred default prototyping path. Remote execution is not part of this repository's current implemented API.

## Known PoC limitations

- single-file TypeScript only
- no stable versioned script API yet
- no persistent script storage API
- no generic runtime-level player HP/combat abstraction; game scripts currently own gameplay HP/damage state themselves
- no collision/query abstraction
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
- `mc-mcp` TestBot input has now been validated end-to-end: a `playtest_scenario` forward move sets `ServerPlayer.getLastClientInput().forward()`, `input.players().forward` becomes true in TypeScript, and script logic can move a runtime actor in response. This makes mc-mcp suitable for automated input-driven E2E tests of script games.
- actor spawning still requires a usable target level/chunk context; `world.setBlock` now uses `ServerLevel.setBlock` directly, which may synchronously obtain the target chunk. Avoid distant/high-volume per-tick writes and prefer a future batched world-edit API for map generation
- a standalone 0.1.1 smoke test verified direct actor spawn/move/remove, exact final actor transform `[2.5, 101, 0.5]` / yaw `60`, and direct gold/diamond block writes. After compiler warmup and `/reload`, that smoke run produced no script-tick warning above the 10 ms threshold.
- the ADR 0005 grid/turn-based procedural roguelike rewrite has strict TypeScript compile coverage plus an off-server deterministic harness covering incremental map projection, one-action turn accounting, potion/bomb turn consumption, and 500 generated seeds across multiple floor difficulties; every tested exit was reachable and no tested enemy/loot spawn landed in a wall. Main-server mc-mcp E2E validation of the rewritten loop is still pending.

## Full game-loop example

`examples/topdown-roguelike` is now a grid-based, turn-based procedural roguelike. TypeScript is authoritative for dungeon topology, grid collision, turn resolution, player HP/death/restart, bump combat, enemy BFS movement, inventory/loot, floor progression, and the deterministic dungeon seed. The script projects its generated 29 x 37 tile map into a fixed world footprint in small `world.setBlock` batches over multiple ticks, with gameplay disabled until projection finishes. `topdown_ts:arena/build` remains optional cleanup/setup tooling rather than the level source of truth. Hand-authored static maps still follow ADR 0002; script-owned procedural maps follow ADR 0005.
