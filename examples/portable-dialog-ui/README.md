# Portable dialog UI (v21 acceptance)

This example exercises Portable IR v21 native dialog UI on a vanilla Minecraft 26.1 client. External team `v21_party` supplies membership; the generated pack never owns that team.

The flow is sequential. Press Jump to arm/open the current stage; while armed, `open()` is intentionally level-triggered every tick so lifecycle behavior is visible:

1. native confirmation with rich styled text and a diamond-sword item body;
2. boolean form (`1` / `0`);
3. single-option form (`Mage=3`, `Warrior=7`);
4. integer range form (`1..9`, step `2`).

Every dialog/form `open()` is called again on each tick while that stage is armed. Compiler lowering must therefore keep an already-pending surface stable instead of replacing it every tick. Results are copied into player-local state, the resolved handle is cleared, the stage advances, and the next stage waits for another Jump. Cancel/Escape for forms resolves to `-1` and increments `cancelCount`.

At stage 4, press Jump to reset the authored result states and return to stage 0. The actionbar shows stage, arm state, and all captured results for real-client acceptance.

Compile with:

```bash
npm run compile:portable -- \
  --source examples/portable-dialog-ui/datapack/data/portable_dialog_ui/mcgame/main.ts \
  --namespace portable_dialog_ui \
  --output build/portable/portable_dialog_ui
```

Because v21 emits `minecraft:dialog` registry resources, installation/replacement/removal follows the same registry lifecycle as v20: run old-pack cleanup when applicable, replace files, then restart the server/world before exercising changed dialog resources. Ordinary `/reload` remains valid after those resources were bootstrapped at startup.
