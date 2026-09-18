# Portable Dialog UI

A consolidated native-dialog gallery for Portable v20-v21 on a vanilla Minecraft 26.1 client. It replaces the former separate selection and typed-dialog examples.

External team `v21_party` supplies membership. Press **Space** to arm/open the current stage:

1. bounded multi-action selection (`Potion=1`, `Sword=2`, cancel `-1`);
2. rich confirmation with styled text and an item body;
3. boolean form;
4. single-option form;
5. integer-range form.

While a stage is armed, `open()` is intentionally called every tick so pending-surface idempotence is visible. Results are copied into player-local state, the resolved surface is cleared, and the next stage waits for another Space press. At the final stage, Space resets the captured results and returns to the selection.

```bash
npm run compile:portable -- \
  --source examples/portable-dialog-ui/datapack/data/portable_dialog_ui/mcgame/main.ts \
  --namespace portable_dialog_ui \
  --output build/portable/portable_dialog_ui
```

This example is the human-facing UI gallery. Version-specific selection/form validation remains in compiler tests.
