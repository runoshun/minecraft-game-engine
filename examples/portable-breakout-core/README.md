# Portable Breakout

This is the reference vanilla-first `portableDsl` game and the reference bounded local-module example. `main.ts` imports the brick-field builder from `./bricks`; both files contain only portable build-time declarations/helpers and no handwritten `portable.define`, host `game.onTick`, `render`, `camera`, `ui`, or `effects` glue.

Controls are **A / D** to move the paddle and **Space** to launch. Portable input predicates continue to work while the non-spectator controller is position-locked to the generated camera carrier.

Portable v5 owns the full arcade loop:

- fixed-point paddle/ball state, three lives, score, and remaining-brick count;
- a 5 x 8 brick field created by imported `bricks.ts` with compile-time `game.repeat(...)`;
- one alive state and one static AABB per brick;
- `when:`-guarded block displays so destroyed bricks disappear in the generated datapack;
- deterministic AABB paddle/brick collision;
- fixed position-lock camera, world-space title, actionbar HUD, particle trail/bursts, and bounce sound.

Compile it with:

```bash
npm run compile:portable -- \
  --source examples/portable-breakout-core/datapack/data/portable_breakout/mcgame/main.ts \
  --namespace portable_breakout \
  --output build/portable/portable_breakout
```

`build/portable/portable_breakout` is the deployment artifact. Minecraft 26.1 runs it as an ordinary datapack with no server mod or build tool installed. The build machine needs this repository and Node.js 22.

The v10 generated camera position-locks one non-spectator controller without owning or restoring player gamemode and without persistent controller tags. Collision is logic-space arcade collision; it does not query Minecraft entity/block hitboxes. Circle/circle collision was added in v5. Portable v6 also provides bounded static segment/capsule collision, trigger zones, and two-pose flippers; the retained `examples/portable-pinball-cabinet` game exercises those collision primitives in an end-to-end pinball flow, while version-specific v6 lowering remains covered by compiler tests.
