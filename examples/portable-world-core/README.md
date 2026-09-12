# Portable World Projection

Portable v8 acceptance example for bounded Minecraft world projection. It compiles declared block-write batches into ordinary datapack `setblock` functions; no Fabric runtime is required on the target server.

Controls: **A** paints the left side red, **D** paints the right side green, and **Space** resets the top surface to white. The black base and initial white surface are an unconditional load-time batch. Input-controlled batches are guarded by portable held-input conditions.

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-world-core/datapack/data/portable_world/mcgame/main.ts \
  -PportableNamespace=portable_world \
  -PportableOutput=build/portable/portable_world
```

World batches are persistent terrain projection. `portable/cleanup` removes generated runtime entities, camera/HUD state, and scoreboards but intentionally does **not** restore blocks that a batch wrote. Acceptance-test teardown must explicitly clear or restore this example's footprint at x=180..184, y=89..90, z=0..4.

This v8 primitive is bounded and compile-time declared; it does not make runtime procedural arrays or arbitrary TypeScript world-edit callbacks portable. The current procedural roguelike still needs a later gate-5 rewrite for its runtime-generated 29 x 37 topology.
