# ADR 0032: Expand bounded mannequin actor presentation in Portable IR v22

## Status

Accepted and implemented. Focused Minecraft 26.1 acceptance evidence is recorded below.

## Context

Portable v7 established a deliberately narrow actor contract: at most 64 statically declared actors, each lowered to a compiler-owned `minecraft:mannequin` with state-backed position/yaw, optional lifetime condition, and zombie/skeleton semantic intents represented by vanilla mob heads. That closed the original mod-removal requirement, but it leaves retained games with too little character differentiation for protagonists, NPCs, shops, and enemies.

ADR 0026 therefore makes richer mannequin/actor presentation the fourth capability-first roadmap priority after reductions, persistence, and interactive UI. Minecraft 26.1 mannequins can express bounded presentation data directly: profile texture/model overrides, player skin-layer visibility, pose, main hand, Living Entity equipment, and normal entity rotation. Those fields can be compiler-authored without exposing arbitrary NBT, runtime entity lookup, custom packets, or a mutable entity API.

The design must preserve the existing ownership model. Actor cardinality, lifetime, replacement on reload, and cleanup are already deterministic; presentation expansion must not turn actors into runtime-created collections or a raw Minecraft escape hatch.

## Decision

Portable IR v22 extends an actor declaration with the following optional static presentation fields and one additional state-backed transform coordinate:

```ts
game.actor("hero", {
  x, y, z,
  yaw,
  pitch,
  profile: {
    texture: "minecraft:entity/player/slim/alex",
    model: "slim",
    // cape?: resource id,
    // elytra?: resource id,
  },
  hiddenLayers: ["cape", "hat"],
  pose: "crouching",
  mainHand: "left",
  equipment: {
    chest: "minecraft:diamond_chestplate",
    mainhand: "minecraft:diamond_sword",
    offhand: "minecraft:shield",
  },
});
```

The complete additions are:

- `pitch?: PortableCoordinate`; constants and shared state-backed coordinates follow the same fixed-point projection rules as existing actor yaw.
- `profile?: { texture?, cape?, elytra?, model? }`; texture/cape/elytra are resource ids and model is `wide` or `slim`.
- `hiddenLayers?`; a duplicate-free subset of `cape`, `jacket`, `left_sleeve`, `right_sleeve`, `left_pants_leg`, `right_pants_leg`, and `hat`.
- `pose?`; one of `standing`, `crouching`, `swimming`, `fall_flying`, or `sleeping`.
- `mainHand?`; `left` or `right`.
- `equipment?`; static resource ids for `head`, `chest`, `legs`, `feet`, `mainhand`, and `offhand`.

Any of these new fields selects Portable IR v22. Raw v21-or-earlier IR carrying a v22 actor field is rejected.

### Profile boundary

V22 exposes only static resource-backed mannequin appearance overrides. It does not expose player names, UUIDs, signed profile properties, arbitrary base64 texture properties, profile lookup, or network-backed player identity resolution. Compiler extraction therefore remains independent of live Minecraft state and network access.

Custom namespaced texture/cape/elytra ids are permitted as presentation references, but the generated datapack does not distribute client resource assets. A vanilla client remains sufficient; custom visual assets, when used, must be supplied through the normal Minecraft resource-pack mechanism. The acceptance example intentionally uses built-in `minecraft:` player textures.

### Equipment boundary

Equipment is declarative presentation only. Each authored slot contains exactly one item resource id. V22 does not expose count, durability, enchantments, arbitrary item components/NBT, drop chances, inventory mutation, or runtime equipment changes.

The existing zombie/skeleton semantic `entityType` mapping remains compatible. For an extended v22 actor, the compiler inserts the corresponding zombie head or skeleton skull into the `head` equipment slot unless the author explicitly supplies `equipment.head`; explicit v22 equipment wins. V1-v21 actors keep their historical lowering path, including the existing `item replace ... armor.head` compatibility behavior.

### Pose and transform boundary

Pose, hidden layers, handedness, profile, and equipment are static declaration-time presentation. Position, yaw, and now pitch are the bounded state-backed transforms. V22 does not expose roll, arbitrary body-part/limb rotations, scale, animation timelines, attachment graphs, mounts/passengers, or a generic `data modify` API.

The vanilla backend continues to summon a `minecraft:mannequin` carrier with `NoGravity`, `Invulnerable`, and `Silent`. Actors using v22 presentation fields are also emitted with mannequin `immovable:1b`; compiler-authored NBT projection still owns position/rotation while ordinary gameplay cannot push the carrier.

### Lifecycle and bounds

The existing actor limit remains 64 declarations per portable program. `when` still controls existence, a false condition kills the owned carrier, and a later true condition recreates it through the compiler-authored spawn function with the complete appearance/equipment declaration reapplied. Ownership-region staging, `/reload` replacement, and `portable/cleanup` semantics are unchanged.

No new persistent state or generated resource registry is introduced. V22 actor presentation therefore follows ordinary datapack `/reload` deployment and does not inherit the v20+ dialog-registry restart requirement unless the same program also declares dialogs whose registry entries changed.

## Non-goals

Portable v22 does not add:

- runtime-created/unbounded actors or generic entity collections;
- arbitrary entity types or arbitrary mannequin/entity NBT;
- player-profile lookup by name/UUID or raw profile properties;
- item components/NBT, mutable inventories, or runtime equipment mutation;
- arbitrary limb/body-part poses, animation graphs, `/swing` event authoring, roll, or scale animation;
- item/model display actors, attachment relationships, passengers, or client-private presentation;
- custom resource-pack distribution.

Those require separate capability decisions rather than widening `game.actor(...)` into a generic entity API.

## Compatibility

The compiler must preserve byte-for-byte output for retained v1-v21 programs relative to pre-v22 commit `c7d3cc9`. In particular, merely compiling an old v7 actor does not add `immovable`, profile, pose, equipment NBT, or pitch projection.

## Acceptance gate

1. Node tests cover v22 DSL/raw-IR validation, profile/skin-layer/pose/hand/equipment lowering, state-backed pitch, zombie/skeleton head fallback, explicit head override, and rejection of raw-NBT-shaped escapes.
2. Every checked-in v1-v21 example compiles byte-for-byte identically to pre-v22 commit `c7d3cc9`.
3. A checked-in v22 acceptance example renders built-in Alex/Steve profile overrides, authored equipment/pose, and zombie-intent head fallback on a real vanilla Minecraft 26.1 client.
4. Real-client input changes shared authored yaw/pitch through exact-cardinality `forSinglePlayer`; entity `Rotation` and rendered state track the same fixed-point state.
5. `/reload` restores initial state/appearance and compiler ownership without duplicating actors.
6. `portable/cleanup` removes generated objectives/entities/force-loads; final teardown removes the acceptance pack and any temporary probe resources.

## Acceptance result

Implemented and accepted in this change. The Node regression suite is 39/39 green. The actor-specific coverage validates v22 DSL/raw IR, profile/layer/pose/hand/equipment lowering, state-backed pitch, legacy zombie/skeleton fallback, explicit head override, and rejection of arbitrary profile/equipment shapes. The checked-in v22 example is also part of the deterministic example-compilation regression.

All 17 retained pre-v22 checked-in examples were compiled with the v22 compiler and independently with pre-v22 commit `c7d3cc9`; every generated file was byte-for-byte identical. An initial compatibility check caught only a formatting-only `0f` versus `0.000f` difference in legacy actor rotation output; the compiler was corrected to retain the historical `0f` path before the full 17/17 comparison was accepted.

`examples/portable-actor-presentation` was deployed to mod-free Minecraft 26.1 `second`. Real client `Camera` rendered three compiler-owned mannequin carriers: a slim Alex-profile crouching hero with authored diamond equipment/shield, a wide Steve-profile iron guard, and a crouching zombie-intent scout whose authored chest/main-hand equipment coexisted with the compiler-supplied zombie-head fallback. Entity data confirmed authored `profile`, `hidden_layers`, `pose`, `main_hand`, and `equipment` fields.

With exactly one player participating through `forSinglePlayer`, holding A moved `heroYaw` from raw `180000` to `204000`, and the mannequin `Rotation[0]` simultaneously read `204.0f`. Space set `heroPitch=-20000` and `Rotation[1]=-20.0f`; Shift then set `heroPitch=15000` and `Rotation[1]=15.0f`. Ordinary `/reload` restored `heroYaw=180000`, `heroPitch=0`, exactly three owned mannequin actors, the Alex profile/equipment, and `[180.0f, 0.0f]` hero rotation.

Before cleanup the ownership rectangle held nine force-loaded chunks. `portable/cleanup` left zero scoreboard objectives, zero entities with the compiler owner tag, and zero force-loaded overworld chunks. The acceptance datapack was then deleted and `/reload` left only vanilla enabled; the two pre-existing video packs remained disabled/available. The earlier direct mannequin probe and its temporary force-load were also removed.
