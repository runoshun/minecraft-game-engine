# Portable Pinball Cabinet v25

Reference acceptance game for Portable v25 bounded item-backed placeable objects.

Each player receives one **Portable Pinball Cabinet** item. The stack is internally a compiler-controlled Armor Stand placement carrier, but its inventory/hand appearance is a custom player-head texture. Placing it in the ownership area creates an invisible anchor and a separate Display/interaction cabinet; the placed world object does not render the carrier item itself.

Two cabinets may exist at once. Each slot owns independent ball physics, score/lives, flipper state, right-click interaction, and v24 controller generation. Right-click the cabinet to claim/start it, use **A / D** for flippers and **Space** to launch. **Sneak + right-click** picks that cabinet up, invalidates its old controller, frees the slot, and returns the same placeable item.

The pinball physics remain table-local 2D collision. V25's local-to-world projection moves/rotates the cabinet Displays and interaction around the placement anchor, while the game rules continue to use local coordinates.

Compile with:

```bash
npm run compile:portable -- \
  --source examples/portable-pinball-cabinet/datapack/data/portable_pinball_cabinet/mcgame/main.ts \
  --namespace portable_pinball_cabinet \
  --output build/portable/portable_pinball_cabinet
```

The head appearance uses a `textures.minecraft.net` texture and needs no custom resource pack. `appearance: { kind: "model", model: "yourpack:..." }` can instead reference a resource-pack item model; the placement carrier and the placed world representation remain unchanged.
