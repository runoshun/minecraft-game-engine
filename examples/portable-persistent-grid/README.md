# Portable persistent Grid (v19 acceptance)

This example exercises bounded global and session-scoped persistent Grids backed by namespace-owned command storage. The Grid cells survive `/reload`, ordinary `portable/cleanup`, and same-namespace generated-pack replacement without mirroring every cell into scoreboard objectives.

External team `v19_party` supplies membership and remains outside compiler ownership. With one real client in the team, A/left writes logical `7` to global Grid `world[1,1]`; D/right writes logical `9` to session Grid `stash[0,0]`. The actionbar reads both cells plus an out-of-bounds global read, which must remain `-1`.

`world` uses schema-mismatch reset policy and `stash` uses preserve policy. Shape changes are structural and always reset a Grid regardless of schema policy because the stored cell layout is no longer compatible.

Normal `portable/cleanup` intentionally preserves the persistent storage. `portable/reset_persistent` restores currently declared persistent scalar/Grid defaults. `portable/purge_persistent` destructively removes persistent Grid storage (and persistent scalar infrastructure when present).

Compile with:

```bash
npm run compile:portable -- \
  --source examples/portable-persistent-grid/datapack/data/portable_persistent_grid/mcgame/main.ts \
  --namespace portable_persistent_grid \
  --output build/portable/portable_persistent_grid
```
