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
- expose capability-style APIs for actors, camera, world, and effects
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

Actors are currently implemented as `minecraft:mannequin` entities. This is an implementation detail behind the API and may change.

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

The initial API intentionally stays small. New capabilities should be added deliberately rather than exposing raw command execution or raw Minecraft Java objects.

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
- no player HP/combat abstraction
- no collision/query abstraction
- actor implementation is mannequin-specific
- camera detach does not restore the player's prior gamemode
- APIs currently translate many operations through Minecraft commands rather than direct server APIs
- watchdog/resource limits need more validation
- no multiplayer game-session ownership abstraction beyond per-script entity tags
