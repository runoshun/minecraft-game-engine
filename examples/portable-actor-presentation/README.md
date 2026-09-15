# Portable Actor Presentation v22

This is the focused Portable IR v22 mannequin/actor-presentation acceptance example. It keeps the existing bounded, compiler-owned `game.actor(...)` lifecycle while exercising static mannequin profile overrides, skin-layer visibility, pose, handedness, equipment, and state-backed pitch in addition to the existing state-backed yaw.

The scene contains an Alex-profile crouching hero with diamond equipment, a wide-model Steve guard in iron armor, and a zombie-intent mannequin whose zombie head is supplied by the compatibility fallback while its authored chest/main-hand equipment remains visible. All three are still compiler-owned `minecraft:mannequin` carriers.

With exactly one player online, **A / D** changes the hero yaw and **Space** sets the hero pitch to `-20` degrees and **Shift** sets it to `+15` degrees. The actionbar and world label expose the same authored fixed-point state so real-client acceptance can compare scoreboard state, entity rotation, and rendering.

```bash
npm run compile:portable -- \
  --source examples/portable-actor-presentation/datapack/data/portable_actor_v22/mcgame/main.ts \
  --namespace portable_actor_v22 \
  --output build/portable/portable_actor_v22
```

V22 deliberately does not expose arbitrary mannequin NBT, runtime-created actors, profile UUID/name/property resolution, item components/NBT, attachment graphs, arbitrary limb transforms, or runtime pose/equipment mutation. Profile texture/cape/elytra fields are static resource ids; custom namespaces require the corresponding client resource assets, while this example uses built-in Minecraft textures.
