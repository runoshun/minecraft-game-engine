# Portable multiplayer v12 acceptance example

This example exercises the initial portable v12 multiplayer contract: `game.players()`, lexical `game.forEachPlayer(...)`, per-player held input, `player.state(...)`, per-player actionbar HUD, and one shared camera audience.

A/D changes each participant's own `meter`. Space uses player-local previous-input state so `jumpPresses` increments once per press rather than once per held tick. The shared `round` state is readable from the player HUD but is not mutated from `PlayerContext`.

Compile with Node.js 22:

```bash
npm run compile:portable -- \
  --source examples/portable-multiplayer-core/datapack/data/portable_multiplayer/mcgame/main.ts \
  --namespace portable_multiplayer \
  --output build/portable/portable_multiplayer
```

The generated camera uses `position_lock` for every online non-spectator participant. The generated pack never changes player gamemode and embeds no player names or UUIDs.
