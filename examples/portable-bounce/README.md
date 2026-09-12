# Portable bounce

This is the smallest dual-backend example for the experimental `portable` API.
The same fixed-point state machine can run inside the Fabric runtime or be extracted from `main.ts` and compiled to a vanilla datapack made from scoreboard state and functions.

The portable portion intentionally contains only deterministic state/rule operations. The ordinary runtime callbacks may still use `render`, `input`, `camera`, and the other Fabric-host capabilities, but those host callbacks are not compiled by the vanilla backend yet.

Compile it with:

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-bounce/datapack/data/portable_bounce/mcgame/main.ts \
  -PportableNamespace=portable_bounce \
  -PportableOutput=build/portable/portable_bounce
```

The generated pack resets its state on datapack load, then runs the portable rule list through the vanilla `minecraft:tick` function tag. The generated scoreboard objective name is namespaced through a stable short hash so multiple portable packs can coexist.
