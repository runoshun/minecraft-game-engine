# Portable Bounce

Low-level Portable IR v1 smoke example. It exists to exercise fixed-point state and branch lowering without using the higher-level `portableDsl` frontend.

Compile with Node.js 22:

```bash
npm run compile:portable -- \
  --source examples/portable-bounce/datapack/data/portable_bounce/mcgame/main.ts \
  --namespace portable_bounce \
  --output build/portable/portable_bounce
```

The generated pack resets its state on datapack load and executes the portable action list through the vanilla `minecraft:tick` function tag. It has no runtime TypeScript callbacks or host-runtime dependency.
