# MC Game Runtime

A server-side Fabric mod for **rapid game prototyping inside Minecraft**. Minecraft provides the view, input, world, entities, sound, and particles; game logic is authored as TypeScript inside a datapack and hot-reloaded with `/reload`.

## Status

Early PoC targeting Minecraft Java Edition 26.1.

Verified in a standalone Fabric 26.1 server:

- embedded GraalJS loads from the mod JAR
- embedded TypeScript 5.9.2 transpiles datapack `main.ts`
- `game.onStart` executes
- runtime API calls can spawn/move/remove mannequins and Display projections, modify the world, open menus, and project a per-player sidebar
- default actor/render transforms/removal and `world.setBlock` use direct server APIs instead of command dispatch where applicable
- editing `main.ts` followed by `/reload` loads the new script

## Architecture

```text
Vanilla Minecraft client
        |
        | normal player input
        v
Fabric server + MC Game Runtime
  |  input snapshots
  |  camera / actor / render / ui / menu / world / effects API
  |
  +--> sandboxed GraalJS
          ^
          | transpiled by bundled TypeScript 5.9.2
          |
world/datapacks/<game>/data/<namespace>/mcgame/main.ts
```

No client mod, Node.js process, or external game server is required for the embedded-runtime path.

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

## Minimal example

```ts
const state = { x: 0.5, y: 101, z: 0.5 };

game.onStart(() => {
  actors.spawn("hero", state);
});

game.onTick(() => {
  const p = input.players()[0];
  if (!p) return;

  if (p.forward) state.z += 0.12;
  if (p.backward) state.z -= 0.12;
  if (p.left) state.x += 0.12;
  if (p.right) state.x -= 0.12;

  actors.move("hero", state);
});
```

A minimal example lives under [`examples/demo-datapack`](examples/demo-datapack), and the validated two-room game loop lives under [`examples/topdown-roguelike`](examples/topdown-roguelike). Presentation API details and adapter guidance are in [`docs/presentation-api.md`](docs/presentation-api.md).

## Current API

- `game.onStart(callback)`
- `game.onTick(callback)`
- `game.log(...values)`
- `input.players()` / `input.get(playerIdOrName)`
- `actors.spawn(id, options)` / `move` / `remove` (compatibility mannequin API)
- `render.spawn(id, options)` / `update` / `remove` / `attach` / `detach`
- `ui.panel(player, panelOrNull)` (per-player scoreboard sidebar projection)
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

The server mod is emitted locally to `build/libs/mc-game-runtime-<version>.jar`. Tagged builds publish the runtime JAR and its SHA-256 checksum as GitHub Release assets; built JARs are not kept in the source tree. Fabric API is also required on the server.

For a tagged release such as `v0.2.0`, the stable download shape is `https://github.com/runoshun/minecraft-game-engine/releases/download/v0.2.0/mc-game-runtime-0.2.0.jar`.

## Development rules

See [`PROJECT_RULES.md`](PROJECT_RULES.md). In particular, architecture/API/ownership changes must update the design documentation in the same change.

## License

Project source is CC0-1.0. Bundled third-party components retain their own licenses; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
