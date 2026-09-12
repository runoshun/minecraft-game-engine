# Portable Breakout core

This example is the reference `portableDsl` arcade program. Its `main.ts` contains only DSL declarations: no hand-written `portable.define`, `game.onBeforeTick`, `game.onTick`, `camera`, `render`, or `effects` host-adapter calls.

Controls are normal player input: hold **A** / **D** to move the paddle and press **Space** to launch a served ball. Portable IR v3 maps those held inputs to Minecraft 26.1 player-input predicates in the vanilla backend, including while the controller is spectating the DSL camera.

The same declaration owns:

- fixed-point paddle and ball state;
- wall/paddle bounce and drain reset;
- a fixed spectator camera;
- block-display board, paddle, and ball projections;
- an end-rod ball trail and a cloud burst on bounces.

Compile it with:

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-breakout-core/datapack/data/portable_breakout/mcgame/main.ts \
  -PportableNamespace=portable_breakout \
  -PportableOutput=build/portable/portable_breakout
```

`build/portable/portable_breakout` is a standalone Minecraft 26.1 datapack. The target server does not need Fabric, Fabric API, GraalJS, TypeScript, or MC Game Runtime. The build machine still needs this repository and Java 25.

The generated camera currently owns the first controller only. It switches that player to spectator, makes them spectate a runtime-owned armor stand, and returns them to Adventure mode during `portable/cleanup`; restoring the exact prior gamemode is not implemented yet.
