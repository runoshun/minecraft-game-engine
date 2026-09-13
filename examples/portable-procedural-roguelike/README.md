# Portable procedural roguelike (v13 reference)

This is the Portable IR v13 acceptance game. It is a mod-free Minecraft 26.1 top-down roguelike whose gameplay topology is a runtime `29 x 37` portable grid rather than Minecraft blocks.

## What it validates

- deterministic runtime generation from `game.rng("floor_rng", { seed: 0x51f15eed })`
- six runtime-positioned `5 x 5` rooms in bounded non-overlapping regions
- runtime L-shaped corridor carving with `grid.fillRect(...)`
- a fixed green exit tile that regenerates the same grid into the next floor
- `grid.get(...)` as the authoritative WASD movement collision query
- `gridWorld(...).rebuild()` as an incremental projection of gameplay state into Minecraft terrain
- `game.forSinglePlayer(...)` for real vanilla player input mutating shared single-player state
- fixed bounded enemy and loot slots derived from generated room positions
- existing actor/block-display presentation, overhead position-lock camera, particles, sound, and per-player HUD

The room regions are intentionally separated, so every generated room layout is valid without runtime collection search or overlap retries. Corridors connect a fixed room graph, which guarantees the start-to-exit path while still changing room/corridor geometry as the deterministic RNG stream advances.

## Controls

W/A/S/D moves one grid cell on a rising edge. Walking onto an enemy removes it and awards 5 score. Walking onto loot removes it and awards 1 score. Walking onto the green exit schedules the next runtime-generated floor. Gameplay input is ignored while terrain projection is rebuilding.

The generated datapack does not own player gamemode. For normal play use Adventure mode; the portable position-lock camera keeps the physical player at the overhead camera while the mannequin actor represents the logical player.

## Compile

```bash
npm run compile:portable -- \
  --source examples/portable-procedural-roguelike/datapack/data/portable_roguelike/mcgame/main.ts \
  --namespace portable_roguelike \
  --output build/portable/portable_roguelike
```

`portable/cleanup` removes generated objectives, command-storage scratch state, display/actor/camera entities, and force-loads. As defined by ADR 0022, projected terrain is persistent and test teardown must explicitly clear or restore the 29 x 37 footprint.
