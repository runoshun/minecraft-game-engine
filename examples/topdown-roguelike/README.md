# TypeScript top-down roguelike

This is the migrated two-room prototype used to validate MC Game Runtime.

Gameplay state and rules live in `datapack/data/topdown_ts/mcgame/main.ts`:

- screen-relative WASD movement
- 8-tick melee cooldown and hit testing
- enemy HP and chase AI
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
