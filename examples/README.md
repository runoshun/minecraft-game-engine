# Examples

This directory contains human-facing reference programs, not one acceptance pack per Portable IR version. Version-specific parser/lowering contracts live in `tools/portable-compiler/test/`; historical acceptance evidence lives in the ADRs.

## Complete games

- **portable-breakout-core** — compact arcade game and local TypeScript module reference.
- **portable-pinball-cabinet** — placeable cabinet, interaction controller, remote camera, and arcade collision/gameplay.
- **portable-othello** — two-player Grid game with interactions, reductions, compound conditions, and polished board presentation.
- **portable-procedural-roguelike** — runtime Grid/RNG generation and GridWorld projection.
- **jrpg-demo** — larger mechanics demo covering movement, actors, UI, combat, shop, world projection, particles, and sound.

## Feature galleries and labs

- **portable-actor-presentation** — mannequin/profile/pose/equipment presentation gallery.
- **portable-dialog-ui** — consolidated v20-v21 native selection, confirmation, and typed-form gallery.
- **portable-multiplayer-lab** — consolidated v12/v14-v17 player, team, session, Grid/RNG/GridWorld, camera, HUD, and reduction reference.
- **portable-persistence-lab** — consolidated v18-v19 persistent scalar and persistent Grid reference.

The labs intentionally use the newest Portable version needed by the combined program. They are current usage references, not substitutes for version-gating tests.

## Adding an example

Add a new directory only when it demonstrates a materially different end-to-end game or a feature that benefits from human/visual inspection. Prefer extending an existing gallery/lab when the new capability is naturally composable. Small version-specific fixtures belong in compiler tests instead of `examples/`.
