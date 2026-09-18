# Portable Multiplayer Lab

A consolidated multiplayer/session reference for Portable v12-v17. It replaces the old version-by-version multiplayer examples with one readable program that demonstrates the combined model.

It covers:

- player-local state/input/HUD;
- team-backed `PlayerSet` audiences and two disjoint cameras;
- two logical sessions that intentionally reuse the same state/Grid/RNG names;
- deterministic session-local RNG and Grid;
- independent session `GridWorld` projection footprints;
- player reductions: count, sum, min, max, any, and all.

Server setup owns the vanilla teams `lab_red` and `lab_blue`. The generated datapack never creates or mutates team membership. Red uses **A** and blue uses **D** to mutate only their own session; **Space** marks that player ready.

```bash
npm run compile:portable -- \
  --source examples/portable-multiplayer-lab/datapack/data/portable_multiplayer_lab/mcgame/main.ts \
  --namespace portable_multiplayer_lab \
  --output build/portable/portable_multiplayer_lab
```

The historical version-specific semantics remain covered by compiler tests. This example is intentionally a current combined usage reference rather than an archive of every Portable version.
