# Portable Breakout core

This example is the reference `portableDsl` arcade program. Its `main.ts` contains only DSL declarations: no hand-written `portable.define`, `game.onBeforeTick`, `game.onTick`, `camera`, `render`, `ui`, or `effects` host-adapter calls.

Controls are normal player input: hold **A** / **D** to move the paddle and press **Space** to launch a served ball. The portable backend maps those held inputs to Minecraft 26.1 player-input predicates, including while the controller is spectating the DSL camera.

The same portable v4 declaration owns fixed-point paddle/ball state, deterministic 2D AABB paddle collision, wall/drain rules, a score counter, a fixed spectator camera, block-display board/paddle/ball projections, a world-space text title, an actionbar score/control HUD, end-rod/cloud particles, and a conditional bounce sound.

Compile it with:

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-breakout-core/datapack/data/portable_breakout/mcgame/main.ts \
  -PportableNamespace=portable_breakout \
  -PportableOutput=build/portable/portable_breakout
```

`build/portable/portable_breakout` is a standalone Minecraft 26.1 datapack. The target server does not need Fabric, Fabric API, GraalJS, TypeScript, or MC Game Runtime. The build machine still needs this repository and Java 25.

The generated camera currently owns the first controller only. It switches that player to spectator, makes them spectate a runtime-owned armor stand, and returns them to Adventure mode during `portable/cleanup`; restoring the exact prior gamemode is not implemented yet. The v4 collision boxes are logic-space 2D AABBs and do not query Minecraft blocks or entity hitboxes.
