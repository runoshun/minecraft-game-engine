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
- expose capability-style APIs for projection/rendering, UI, camera, world, and effects; game rules should consume these through a TypeScript presentation adapter when portability matters
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

A soft warning is logged for a script tick over 10 ms. A hard watchdog currently attempts to cancel a script context after 100 ms of guest execution. The watchdog is a PoC safety measure, not yet a fully validated resource-governance mechanism.

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

`world.setBlock` resolves the block through the server registry and calls the ServerLevel block API directly; it no longer invokes the command parser. This preserves the small capability surface while removing command parsing from block-write hot paths. Individual writes still perform normal block updates and can synchronously obtain target chunks, so large map generation should use a future batched/fill capability rather than thousands of per-tick `setBlock` calls. Effects remain command-backed in the current PoC.

The initial API intentionally stays small. New capabilities should be added deliberately rather than exposing raw command execution or raw Minecraft Java objects.

The next presentation expansion follows ADR 0004 and `docs/presentation-api.md`. Game Core TypeScript must not depend on Minecraft primitives such as titles, boss bars, mannequins, or display entities. A game-owned presentation interface maps semantic appearance/HUD/audio/FX intent into the Minecraft adapter. The planned runtime additions are broad `render.spawn/update/remove` and semantic `ui.status/message/progress` capabilities, rather than one Mod API per Minecraft feature. `render` will use mannequins for character projections and Display entities for scalable model/block/text projections.

## Entity ownership

Every runtime-created actor and camera receives both a script-specific owner tag and a resource-specific tag. When a script unloads, all entities with its owner tag are killed and attached spectator views are detached.

This is important for `/reload`: old runtime state must not leak into the newly loaded script instance.

## Sandbox

Both the compiler context and game-script contexts currently disable:

- host object/class access
- filesystem/network IO
- guest-created threads
- native access
- polyglot access

Only explicitly installed proxy objects (`game`, `input`, `actors`, `camera`, `world`, `effects`) are visible as Minecraft capabilities.

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
- current `actors` compatibility API is mannequin-specific; planned `render` will support character/model/block/text projections behind one lifecycle
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
- the migrated `examples/topdown-roguelike` loop has been validated end-to-end with mc-mcp: WASD moves the TypeScript-authoritative hero, enemies chase, held jump drives the 8-tick attack loop, Room 1 opens its gate, entering the corridor spawns Room 2 and moves the camera, and defeating Room 2 opens the final gate
- the example combat model now also keeps player HP (10 max in the example), 20-tick hit invulnerability, knockback, enemy contact-attack cooldowns, room-clear healing, death, and a 40-tick Room 1 restart entirely in TypeScript; vanilla player health remains presentation-independent
- final combat E2E on `main` validated both branches: a continuous input-driven run clears Room 1, restores HP to 10, defeats the front and rear Room 2 pairs, opens the final gate, and logs `TOPDOWN_TS_RUN_COMPLETE`; a separate idle test receives ten contact hits (`hp=9` through `hp=0`), logs `TOPDOWN_TS_PLAYER_DIED`, waits 40 ticks, logs `TOPDOWN_TS_RESTART hp=10`, and restores the Room 1 actors and gates
- the top-down example claims its single-player controller on the first gameplay input and releases it on disconnect, so capture/observer clients do not steal control merely by being online
- before the 0.1.1 hot-path rewrite, the full loop produced a 45.6 ms script-tick warning during a combat-heavy frame. With 0.1.1 deployed on `main`, the same Room 1 -> Room 2 -> run-complete E2E passed and produced no script-tick warnings above 10 ms during the post-camera combat and progression phases. One 35.841 ms warning was observed on the first controller-acquisition tick after startup; that tick includes the still-command-backed `camera.attach()` path. Camera/effects remain the next direct-API optimization targets.
- a standalone 0.1.1 smoke test verified direct actor spawn/move/remove, exact final actor transform `[2.5, 101, 0.5]` / yaw `60`, and direct gold/diamond block writes. After compiler warmup and `/reload`, that smoke run produced no script-tick warning above the 10 ms threshold.

## Full game-loop example

`examples/topdown-roguelike` migrates the existing two-room top-down prototype to the embedded runtime. TypeScript is authoritative for player movement/collision, player HP/invulnerability/death/restart, attack cooldown and hit testing, enemy HP/chase/contact attacks, room progression, dynamic gates, and camera transitions. Static arena construction remains a manual datapack function (`topdown_ts:arena/build`) so normal `/reload` iterations replace game state without rebuilding level geometry; see ADR 0002.
