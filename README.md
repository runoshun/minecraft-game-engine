# MC Game Runtime

A TypeScript DSL and compiler for **building game prototypes as vanilla Minecraft datapacks**. Minecraft provides the view, input, world, entities, sound, and particles; portable game logic is authored in TypeScript, lowered to a deterministic IR, and compiled to scoreboard/mcfunction/Display resources. A Fabric runtime remains as an optional compatibility and rapid-iteration backend while the project works toward removing the server mod entirely.

## Status

Early PoC targeting Minecraft Java Edition 26.1.

Verified against Minecraft 26.1:

- `portableDsl(...)` TypeScript lowers to versioned Portable IR at build time
- generated datapacks run on a mod-free vanilla server
- held input, fixed camera, bounded v10 generated-entity ownership, block/text displays, particles, sound, actionbar HUD, fixed-point state, AABB collision, circle/circle collision, static segment/capsule collision, trigger zones, two-pose flippers, bounded mannequin/zombie/skeleton actor projections, state-backed world-text tokens, bounded compile-time world batches/fills, and conditional projection visibility are supported by the vanilla backend
- compile-time `repeat(...)` expands bounded static object fields such as brick grids
- the optional Fabric backend still executes the same portable declarations for development and compatibility

## Architecture

```text
TypeScript portableDsl source
        |
        v
build-time TS transpile + DSL extraction
        |
        v
Portable IR
   |                 \
   | primary          \ optional / transitional
   v                   v
Vanilla datapack     Fabric runtime
   |
   v
Minecraft 26.1 vanilla server + client
```

The deployment target for supported portable games needs no Fabric, GraalJS, TypeScript, Node.js, or MC Game Runtime mod. Those are build/development concerns only. ADR 0013 defines the vanilla-first direction and Fabric retirement gates.

See [`docs/architecture.md`](docs/architecture.md) for the design contract.

## Script datapack layout

```text
my_game/
├── pack.mcmeta
└── data/
    └── my_game/
        └── mcgame/
            └── main.ts
```

The PoC currently discovers `*/mcgame/main.ts` resources. It intentionally supports a single TypeScript file per namespace; module/import support is future work.

## Minimal portable example

```ts
portableDsl({ fixedPoint: 1000 }, game => {
  const x = game.state("x", 0);
  const vx = game.state("vx", 0.2);

  game.block("ball", {
    block: "minecraft:sea_lantern",
    x: game.at(x, 10), y: 64, z: 0,
    scale: 0.4,
  });

  game.tick(() => {
    x.add(vx);
    game.when(x.gte(3), () => vx.negate());
    game.when(x.lte(-3), () => vx.negate());
  });
});
```

A minimal example lives under [`examples/demo-datapack`](examples/demo-datapack), [`examples/portable-bounce`](examples/portable-bounce) is the low-level portable IR smoke example, [`examples/portable-breakout-core`](examples/portable-breakout-core) is the mod-free brick-breaker acceptance game, [`examples/portable-pinball-core`](examples/portable-pinball-core) is the v6 segment/capsule/trigger/flipper acceptance game, [`examples/portable-presentation-core`](examples/portable-presentation-core) is the v7 actor/dynamic-label acceptance game, [`examples/portable-world-core`](examples/portable-world-core) is the v8 world-projection acceptance game, [`examples/portable-ui-core`](examples/portable-ui-core) is the v9 sidebar/input acceptance game, and the legacy Fabric-heavy game loop lives under [`examples/topdown-roguelike`](examples/topdown-roguelike). Presentation API details and adapter guidance are in [`docs/presentation-api.md`](docs/presentation-api.md).

## Current API

- `portableDsl(...)` (primary TS authoring frontend; portable v10 adds bounded generated-entity ownership/reload semantics on top of the v9 sidebar/input slice)
- `portable.define(spec)` / `portable.get(state)` / `portable.raw(state)` / input register access (low-level portable API)
- `game.onStart(callback)` / `game.onBeforeTick(callback)` / `game.onTick(callback)`
- `game.log(...values)`
- `input.players()` / `input.get(playerIdOrName)`
- `actors.spawn(id, options)` / `move` / `remove` (compatibility mannequin API)
- `render.spawn(id, options)` / `update` / `remove` / `attach` / `detach`
- `ui.panel(player, panelOrNull)` (Fabric compatibility per-player scoreboard sidebar projection)
- `ui.hud(player, textOrNull)` (per-player actionbar projection)
- `menu.open(player, spec)` / `update` / `close` / `onAction`
- `camera.attach(player, options)` / `move` / `detach`
- `world.setBlock(options)`
- `effects.particle(options)` / `effects.sound(options)`

Input snapshots expose held states for forward/backward/left/right/jump/sneak/sprint and edge-triggered `jumpPressed`, `sneakPressed`, and `sprintPressed`.

## Safety model

Guest scripts run with Graal host access, host-class lookup, filesystem/network IO, guest thread creation, native access, and polyglot access disabled. Runtime-owned entities are tagged and removed when a script is unloaded. The PoC also has a 1 MB source limit and a hard execution watchdog.

This is still a PoC sandbox, not yet a hardened hostile-code security boundary.

## Build

Requires Java 25.

```bash
./gradlew build
```

The primary deployment path compiles supported portable DSL programs to standalone vanilla datapacks. The current v10 backend supports normal held player input (W/A/S/D, jump, sneak, sprint), state-authored rising-edge actions, block/text-display projections with optional state-controlled visibility, one fixed player-position camera, bounded particle/sound emitters, one actionbar HUD, one bounded 15-row vanilla sidebar, deterministic 2D AABB and circle/circle collision, static segment/capsule collision, center-point trigger zones, two-pose flippers, bounded mannequin/zombie/skeleton actor projections, state-backed world-text tokens, bounded compile-time world batches/fills, and compile-time static collection expansion in addition to fixed-point game logic:

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-breakout-core/datapack/data/portable_breakout/mcgame/main.ts \
  -PportableNamespace=portable_breakout \
  -PportableOutput=build/portable/portable_breakout
```

The reference Breakout uses A/D to move, Space to launch, a compile-time-expanded brick field with per-brick alive state/AABB/conditional Display visibility, lives and scoring, a generated fixed camera, world-space title, actionbar HUD, particles, and sound. Its v10 declaration also reserves a bounded ownership rectangle so generated Displays/camera/effect anchors have deterministic delayed reload and cleanup semantics without mutating persistent player gamemode or tags. On a vanilla target the compiler emits player-input predicates, scoreboard/mcfunction logic, owned display/camera/marker entities, `particle`/`playsound`, and actionbar commands; the TypeScript source itself is not shipped or executed.

The Fabric server mod is still emitted locally to `build/libs/mc-game-runtime-<version>.jar` as an optional development/compatibility backend. ADR 0013 defines the conditions for retiring it.

For a tagged release such as `v0.3.0`, the stable download shape is `https://github.com/runoshun/minecraft-game-engine/releases/download/v0.3.0/mc-game-runtime-0.3.0.jar`.

## Development rules

See [`PROJECT_RULES.md`](PROJECT_RULES.md). In particular, architecture/API/ownership changes must update the design documentation in the same change.

## License

Project source is CC0-1.0. Bundled third-party components retain their own licenses; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
