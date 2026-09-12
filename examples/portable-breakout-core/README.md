# Portable Breakout

This is the reference vanilla-first `portableDsl` game. `main.ts` contains only portable DSL declarations; it has no handwritten `portable.define`, host `game.onTick`, `render`, `camera`, `ui`, or `effects` glue.

Controls are **A / D** to move the paddle and **Space** to launch. Portable input predicates continue to work while the controller is attached to the generated spectator camera.

Portable v5 owns the full arcade loop:

- fixed-point paddle/ball state, three lives, score, and remaining-brick count;
- a 5 x 8 brick field created with compile-time `game.repeat(...)`;
- one alive state and one static AABB per brick;
- `when:`-guarded block displays so destroyed bricks disappear in both vanilla and Fabric backends;
- deterministic AABB paddle/brick collision;
- fixed spectator camera, world-space title, actionbar HUD, particle trail/bursts, and bounce sound.

Compile it with:

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-breakout-core/datapack/data/portable_breakout/mcgame/main.ts \
  -PportableNamespace=portable_breakout \
  -PportableOutput=build/portable/portable_breakout
```

`build/portable/portable_breakout` is the deployment artifact. Minecraft 26.1 can run it with no Fabric, Fabric API, GraalJS, TypeScript, or MC Game Runtime mod installed. The build machine still needs this repository and Java 25.

The generated camera currently owns one controller and restores that player to Adventure mode during `portable/cleanup`, rather than remembering the exact previous gamemode. Collision is logic-space arcade collision; it does not query Minecraft entity/block hitboxes. Circle/circle collision also exists in v5 for pinball-oriented work, while segment/capsule/flipper primitives are planned next.
