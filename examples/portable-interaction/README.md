# Portable Interaction v23

This is the focused acceptance example for Portable IR v23 `minecraft:interaction` use input.

The world contains a small Display-based cabinet plus one compiler-owned invisible interaction hitbox. Right-clicking the hitbox runs `cabinet.onUse(player => ...)` exactly once for the recorded use, with `player` bound to the real player through vanilla `execute on target`. The example increments both shared `totalUses` and player-local `cabinetUses`.

Compile with:

```bash
npm run compile:portable -- \
  --source examples/portable-interaction/datapack/data/portable_interaction/mcgame/main.ts \
  --namespace portable_interaction \
  --output build/portable/portable_interaction
```

The v23 surface is deliberately bounded: at most 64 statically declared interaction entities, static width/height/response, state-backed position, optional shared `when`, one root-tick `onUse` handler per interaction, and right-click/use events only. The handler consumes the recorded `interaction` NBT after dispatch, so one recorded use cannot replay on later ticks. Multiple uses that Minecraft itself collapses into the entity's single latest-use record before a compiler tick are likewise observed as one event.
