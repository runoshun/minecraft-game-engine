# Portable Presentation

This is the portable v7 presentation acceptance example: bounded declarative actors plus state-backed world text. The scene contains a moving mannequin and zombie/skeleton intents represented by mannequins with vanilla mob heads on the vanilla backend.

Controls are **A / D** to move and turn the hero, and **Space** to hide the zombie actor while held. The fixed camera, block backdrop, dynamic hero-yaw label, static mob labels, and actionbar HUD make the actor behavior visible to a normal Minecraft 26.1 client.

```bash
npm run compile:portable -- \
  --source examples/portable-presentation-core/datapack/data/portable_presentation/mcgame/main.ts \
  --namespace portable_presentation \
  --output build/portable/portable_presentation
```

`entityType` is intentionally bounded to `minecraft:mannequin`, `minecraft:zombie`, and `minecraft:skeleton`. The compiler always emits a mannequin carrier; zombie/skeleton intents are rendered with a zombie head or skeleton skull so presentation is deterministic even in Peaceful difficulty.

World text may be a string or a bounded array of literal/state/input tokens. The hero label uses this path so A/D changes both the actor yaw and the rendered label content.
