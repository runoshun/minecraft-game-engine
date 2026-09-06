# TypeScript top-down roguelike

This is the migrated two-room prototype used to validate MC Game Runtime.

Gameplay state and rules live in `datapack/data/topdown_ts/mcgame/main.ts`:

- screen-relative WASD movement
- 8-tick melee cooldown and hit testing
- enemy HP, chase AI, and contact attacks
- TypeScript-authoritative player HP, hit invulnerability, and knockback
- death followed by an automatic Room 1 restart
- full HP recovery when a room is cleared
- room-clear state machine
- dynamic gates
- overhead camera room transition

`topdown_ts:arena/build` is intentionally only static level construction. Run it once when creating/resetting the test arena; ordinary TypeScript `/reload` iterations do not rebuild the map.

Typical development loop:

```text
/function topdown_ts:arena/build   # only when the map needs reset
/reload                            # reload TypeScript game state
play / mc-mcp E2E test
```

The single-player controller is claimed by the first player who sends gameplay input, rather than simply the first online player. This prevents capture/observer clients from stealing the session. Disconnecting releases the controller.

## Combat rules

The example intentionally does not use vanilla player health. The script owns `player.hp` (10 max HP), grants 20 ticks of invulnerability after a hit, applies 0.9-block knockback, and restarts the run 40 ticks after death. Enemies deal 1 damage at close range and keep a per-enemy 20-tick attack cooldown. Clearing Room 1 restores HP to max before the next encounter. This keeps combat deterministic and under TypeScript control.
