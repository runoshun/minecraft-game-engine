# Portable UI Core

Portable v9 acceptance example for the bounded vanilla sidebar and held-input rising-edge recipe.

Controls:

- **W**: select option 0
- **S**: select option 1
- **Space**: confirm on a rising edge; holding Space must increment `CONFIRMS` only once

Its generated datapack sidebar is a real vanilla scoreboard sidebar. Because portable v9 is still a single-controller model, the sidebar uses the server-global vanilla sidebar display slot.

Compile with Node.js 22:

```bash
npm run compile:portable -- \
  --source examples/portable-ui-core/datapack/data/portable_ui/mcgame/main.ts \
  --namespace portable_ui \
  --output build/portable/portable_ui
```

Run `function portable_ui:portable/cleanup` before deleting the generated pack.
