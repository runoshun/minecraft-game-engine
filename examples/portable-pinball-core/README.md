# Portable Pinball

This is the Fabric-retirement gate-2 reference game for portable IR v6. It compiles to a standalone Minecraft 26.1 datapack and exercises circle bumpers, static segment/capsule walls, rectangular trigger zones, and two-pose flippers without a server mod.

Controls are **A / D** for the left/right flippers and **Space** to launch a ball. The generated game owns three lives, score, a fixed spectator camera, actionbar HUD, particles, sound, and deterministic cleanup.

Compile it with:

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-pinball-core/datapack/data/portable_pinball/mcgame/main.ts \
  -PportableNamespace=portable_pinball \
  -PportableOutput=build/portable/portable_pinball
```

The collision model is intentionally arcade-oriented. Segment/capsule endpoints and flipper poses are static compile-time geometry; a flipper selects between one rest capsule and one active capsule from portable input/state. Trigger zones test a watched collider's center and do not provide physical response by themselves.
