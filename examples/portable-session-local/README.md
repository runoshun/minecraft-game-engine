# Portable session-local state (v15 acceptance)

This example exercises two independent logical matches in one generated datapack. External vanilla teams `v15_red` and `v15_blue` are membership inputs; the portable runtime does not create, join, leave, or delete them.

Both sessions deliberately reuse the local names `initialized`, `score`, `cell`, `sample`, Grid `map`, and RNG `run`. The compiler must qualify them by session rather than requiring source-level renaming.

Red uses A/left and blue uses D/right. On a rising edge, only that session increments `score`, writes/reads cell `(0,0)` of its own Grid, and advances its own RNG stream. Both RNG streams use the same seed and take one initialization sample, so they begin equal and diverge when only one session consumes another sample. Each team sees an actionbar sourced from its own session-local state and is position-locked to a distinct team camera.

Compile with:

```bash
npm run compile:portable -- \
  --source examples/portable-session-local/datapack/data/portable_sessions/mcgame/main.ts \
  --namespace portable_sessions \
  --output build/portable/portable_sessions
```
