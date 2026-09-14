# Portable selection UI (v20 acceptance)

This example exercises Portable IR v20 bounded interactive selection UI with Minecraft's native dialog screen and a compiler-owned trigger result channel.

External team `v20_party` supplies membership. Each participant receives a `Portable Shop` dialog with `Potion` (result `1`), `Sword` (result `2`), and cancel/escape (result `-1`). The example intentionally calls `choice.open()` every tick while `menuEnabled == 1`; the compiler must show the dialog only on the idle-to-pending transition rather than replace/reset it every tick.

After a selection resolves, `lastChoice` records the portable result, the menu disables, and `choice.clear()` rearms it. Press Jump outside the dialog to enable/open it again. The player HUD exposes `lastChoice` and `menuEnabled` for real-client acceptance.

Compile with:

```bash
npm run compile:portable -- \
  --source examples/portable-selection-ui/datapack/data/portable_selection_ui/mcgame/main.ts \
  --namespace portable_selection_ui \
  --output build/portable/portable_selection_ui
```

Acceptance should use a vanilla Minecraft 26.1 real client, verify one option through keyboard UI interaction, reopen with real Jump input, verify Escape/cancel, then run `/reload` and `portable/cleanup` lifecycle checks. External team ownership remains outside the generated pack.
