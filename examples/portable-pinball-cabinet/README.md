# Portable Pinball Cabinet v26

Current reference game for the placeable-object/controller-camera path.

Each player receives one **Portable Pinball Cabinet** item. The stack is a compiler-controlled placement carrier with a custom player-head inventory appearance. Placing it inside the ownership region creates one approximately block-sized cabinet built from compiler-owned Displays plus an invisible interaction hitbox.

The retained source intentionally allows **one active cabinet**. Right-clicking that cabinet claims the exact interacting player and routes only that controller to a separate remote pinball playfield through the v26 controller-backed `position_lock` camera. Other players stay outside that camera audience.

Controls while playing:

- **A / D** — left/right flippers;
- **Space** — launch the ball;
- **Sneak** — leave the remote view, return to the source cabinet interaction, and invalidate the controller token.

When the cabinet is idle, **Sneak + right-click** picks it up and returns the placeable item.

The remote game uses the bounded arcade collision primitives: circle bumpers, segment/capsule walls and guides, trigger drain, and two-pose flippers. The cabinet itself uses v25 item/placeable projection and v24 interaction-controller binding; v26 adds the controller-backed remote camera and bounded return path.

```bash
npm run compile:portable -- \
  --source examples/portable-pinball-cabinet/datapack/data/portable_pinball_cabinet/mcgame/main.ts \
  --namespace portable_pinball_cabinet \
  --output build/portable/portable_pinball_cabinet
```

The head appearance uses a `textures.minecraft.net` texture and needs no custom resource pack. A namespaced `appearance.kind: "model"` can instead reference an external resource-pack item model.

Placeables and controller bindings are active-instance state: ordinary `/reload` clears the placed cabinet/controller state by design.
