# Portable session grid-world projection (v16 acceptance)

This example extends v15 logical sessions with explicit, non-overlapping world projection footprints inside one shared `ownership` rectangle. V16 requires the complete footprint of every session GridWorld to be covered by that ownership region so staged force-loading/readiness remains the chunk-lifecycle authority. External vanilla teams `v16_red` and `v16_blue` remain membership inputs; the generated runtime does not own team membership.

Both sessions deliberately reuse Grid `map` and GridWorld `terrain`. Red projects a 4 x 4 Grid at x=404..407 / z=4..7 / y=100 and blue projects the same local names at x=436..439 / z=4..7 / y=100. The compiler qualifies Grid storage and GridWorld ready/cursor state by session, and rejects overlapping session projection footprints at the same dimension/y.

Each session performs an initial black-concrete projection. A rising A/left edge for red writes value 1 to red cell (0,0), increments only red `hits`, and rebuilds only red `terrain`, producing red concrete at (404,100,4). A rising D/right edge does the analogous operation for blue, producing blue concrete at (436,100,4). `readySeen` demonstrates that the session-local `terrain.ready` value is readable only inside its SessionContext.

Compile with:

```bash
npm run compile:portable -- \
  --source examples/portable-session-grid-world/datapack/data/portable_session_world/mcgame/main.ts \
  --namespace portable_session_world \
  --output build/portable/portable_session_world
```
