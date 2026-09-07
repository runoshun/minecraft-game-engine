# TypeScript grid / turn-based roguelike

This example validates a script-owned roguelike loop on MC Game Runtime. Minecraft is the view/input/world host; the TypeScript script owns the dungeon topology, grid collision, turns, combat, AI, inventory, loot, and floor progression.

Gameplay state and rules live in `datapack/data/topdown_ts/mcgame/main.ts`:

- deterministic seed-based procedural room-and-corridor generation
- guaranteed connected start/exit path, with a fixed fallback layout if random room placement is too sparse
- incremental world projection (`64` `world.setBlock` writes per tick) so generation does not issue thousands of block writes in one script tick
- grid-based, one-action-per-turn movement
- bump-to-attack melee combat
- enemy turns with grid BFS pathfinding
- TypeScript-authoritative player HP and death/restart
- floor-to-floor progression; the farthest reachable tile becomes the exit
- generated potion and bomb pickups
- inventory menu using the runtime `menu` capability
- potions heal and consume a turn; bombs damage nearby enemies and consume a turn
- per-player scoreboard HUD for HP, floor, turn, inventory, generation state, enemies, and seed
- overhead fixed camera and single-player controller claiming

## Controls

| Input | Action |
| --- | --- |
| W / A / S / D | Move one grid tile; moving into an enemy performs a melee attack |
| Jump | Wait one turn |
| Sneak | Open the inventory menu |

Movement uses rising edges implemented by the game script, so holding a direction does not spend multiple turns.

## Dungeon generation

A run starts from `BASE_SEED`. Each floor derives its own deterministic seed. On death, the next run mixes the previous run seed to produce a new dungeon; `/reload` starts again from the base seed, which keeps E2E tests reproducible.

The generator places non-overlapping rectangular rooms, connects each accepted room to the previous room with an L-shaped corridor, then runs BFS from the start room and chooses the farthest reachable floor tile as the exit. Generation asserts that the exit is reachable before the world is projected.

The generated map is currently 29 x 37 tiles. Geometry is reconciled into the same fixed world footprint every floor/reload. Because the runtime currently exposes single-block writes rather than a batched fill capability, projection is deliberately amortized across ticks. Gameplay remains disabled until projection completes.

`topdown_ts:arena/build` is now optional cleanup/setup tooling for the example volume. It is useful when migrating from the old static two-room arena or when you want to erase the generated map, but it is not part of the ordinary floor-generation loop.

Typical development loop:

```text
/function topdown_ts:arena/build   # optional: clear legacy/generated geometry
/reload                            # reload TypeScript game state
# press a gameplay key to claim the controller and start the run
play / mc-mcp E2E test
```

The single-player controller is claimed by the first player who sends gameplay input rather than the first online player, so capture/observer clients do not steal the session. Disconnecting releases the controller.
