# Portable team PlayerSets (v14 acceptance)

This example exercises Portable IR v14 team-backed `PlayerSet` membership without embedding player names or UUIDs and without compiler-owned player tags.

The server/session setup must create two vanilla scoreboard teams named `v14_red` and `v14_blue` and assign participants externally. The generated datapack never creates, removes, joins, or leaves those teams.

## What it validates

- `game.teamPlayers("v14_red")` and `game.teamPlayers("v14_blue")` as disjoint player sets;
- team-filtered `game.forEachPlayer(...)` and player-local held input/state;
- independent `game.forSinglePlayer(...)` cardinality for two one-member teams that are online simultaneously;
- one player-local actionbar HUD per team;
- two distinct `position_lock` camera carriers with disjoint team audiences;
- participant initialization/input sampling that does not touch unrelated online players outside both teams;
- cleanup of portable objectives/entities/force-loads without owning external teams or membership.

Red uses A/left to decrease its player-local meter and increment the shared red edge counter. Blue uses D/right to increase its player-local meter and increment the shared blue edge counter. Each team sees only its own HUD and camera.

## Compile

```bash
npm run compile:portable -- \
  --source examples/portable-team-player-sets/datapack/data/portable_team_players/mcgame/main.ts \
  --namespace portable_team_players \
  --output build/portable/portable_team_players
```
