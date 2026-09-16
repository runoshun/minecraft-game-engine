# ADR 0036: Bounded item templates and placeable object instances in Portable v25

## Status

Accepted and implemented. Minecraft 26.1 acceptance completed on 2026-09-16.

## Context

Portable v23/v24 can make a statically declared world object usable and bind its exact clicking player as a later controller, but the object's world coordinates still come from compile-time declarations or shared state authored by the game. A retained game could not hand a player a cabinet item, let the player place that cabinet at a world location, and then run an independent game instance relative to the placed cabinet.

The pinball-cabinet use case makes the missing boundary concrete. The game needs all of the following without opening a generic NBT, inventory, selector, raycast, or runtime-entity API:

- a custom-looking compiler-known item stack;
- normal vanilla placement UX that yields an exact world anchor and facing;
- a bounded number of runtime object instances;
- per-instance local game state;
- presentation and interactions authored in object-local coordinates;
- v24 controller ownership per placed instance;
- deterministic removal, slot reuse, reload, and cleanup.

A datapack/resource pack does not create a new vanilla item or block registry type. Portable therefore does not expose a fake `game.customBlock(...)` contract with native mining, collision, redstone, waterlogging, or block-state semantics. The abstraction is an item-backed **placeable world object** whose backend uses compiler-owned entities and Displays.

A focused Minecraft 26.1 probe established the placement lowering. An `minecraft:armor_stand` item with compiler-authored `minecraft:entity_data` can place an invisible Marker armor stand carrying stable compiler tags while preserving the real placement `Pos` and player-facing `Rotation`. The probe also showed that advancement hooks do not provide a reliable exact-player callback for this Armor Stand placement path, so v25 deliberately does not expose `onPlace(player)`.

## Decision

Portable v25 adds two bounded concepts:

1. **ItemTemplate** — a statically declared appearance/name/stack-size description used as a placeable carrier and as a bounded item-display source.
2. **PlaceableType / PlaceableInstance** — a compile-time-sized slot pool whose slots become active when a matching placement Marker is observed inside the program ownership region.

The feature remains vanilla-client compatible. Head appearances can use a `textures.minecraft.net` skin texture with no resource pack. A custom namespaced item model is an ordinary resource-pack dependency, never a client-mod dependency.

### Item templates

The accepted authoring shape is:

```ts
const pinballItem = game.item("pinball_item", {
  name: "Portable Pinball Cabinet",
  maxStackSize: 1,
  appearance: {
    kind: "head",
    textureUrl: "https://textures.minecraft.net/texture/<hex>",
  },
});
```

or:

```ts
const pinballItem = game.item("pinball_item", {
  name: "Portable Pinball Cabinet",
  appearance: { kind: "model", model: "arcade:pinball_machine" },
});
```

The public surface is intentionally smaller than the original proposal:

- `name`: static literal display name;
- `appearance.kind: "head"`: requires an HTTPS `textures.minecraft.net/texture/<hex>` URL and lowers to the built-in `minecraft:player_head` item model plus a compiler-generated profile texture property;
- `appearance.kind: "model"`: static resource id used as `minecraft:item_model`;
- `maxStackSize?`: integer `1..64`, default `1`.

There is no author-selectable `base`, `glint`, arbitrary component map, `custom_data`, `entity_data`, NBT, command, enchantment, attribute, durability, food, recipe, loot, or predicate escape hatch. In v25 each declared ItemTemplate is bound to exactly one PlaceableType. The placement carrier is therefore an implementation detail: the backend always emits an `minecraft:armor_stand` stack and adds namespace/type identity plus Marker-producing `minecraft:entity_data` itself.

An item handle can be granted only through an exact mutable player context:

```ts
pinballItem.give(player);
pinballItem.give(player, 2);
```

`give` is a compiler-known stack action, not a general inventory API. V25 does not add arbitrary inventory reads, slot addressing, removal predicates, container mutation, or generic item-use callbacks.

### Placeable types and placement service

The accepted authoring shape is:

```ts
game.placeable("pinball", {
  item: pinballItem,
  maxInstances: 2,
  orientation: "cardinal",
}, table => {
  // one lexical template, compiler-expanded into fixed instance slots
});
```

The compiler augments the Armor Stand carrier with `minecraft:entity_data` so successful vanilla placement creates an invisible, no-gravity Marker with a namespace owner tag and a placeable-type pending tag.

The pending Marker is an internal transport, not a durable API object. The placement service observes it while its chunk is loaded, verifies that it lies inside the declared ownership rectangle and ownership dimension, assigns the lowest free slot deterministically, copies `Pos` into compiler-owned fixed-point anchor holders, quantizes yaw into one of four cardinal orientations, initializes that slot's state, retags the Marker as the active slot anchor, and activates the slot. Game source never receives raw entity/NBT/selector access or the placing player's identity.

Placeable programs require the existing ownership rectangle. V25 does not add world-wide instance discovery or dynamic chunk leasing.

### Bounded instance pool

The template callback is compile-time composition, analogous to `game.repeat`; it does not create a JavaScript collection or runtime callback. Every possible instance is a statically known slot.

Accepted limits are:

- at most 32 ItemTemplate declarations;
- at most 8 PlaceableType declarations;
- `maxInstances` in `1..16` per type;
- at most 32 placeable slots in aggregate;
- at most 16 instance-state fields per placeable template;
- at most 256 expanded instance-state cells in aggregate;
- at most 256 expanded placeable child presentation entities in aggregate;
- child interactions still count against the existing global 64-interaction/controller bank;
- the existing 2,048-action expanded-program bound still applies after slot expansion.

These are compiler acceptance bounds, not a general runtime-collection facility.

### PlaceableInstanceContext

Inside the template callback, the instance handle is lexical and cannot escape to global source or a different placeable template. The accepted context is:

```ts
table.state(name, initial)
table.block(id, spec)
table.text(id, spec)
table.itemDisplay(id, spec)
table.interaction(id, spec)
table.circle(id, spec)
table.segment(id, spec)
table.capsule(id, spec)
table.trigger(id, spec)
table.flipper(id, spec)
table.tick(callback)
table.remove()
table.pickUp(player)
```

`table.state(...)` is active-instance shared state for exactly one fixed slot. Placement initializes it to the authored default. Removal resets it, and later reuse of that slot starts from the defaults. It is not persistent state.

Collision remains the existing bounded **local 2D logic collision**. V25 does not add 3D collision. Collision/game state stays in table-local coordinates while presentation coordinates are projected into the placed object's world frame.

### Local coordinates and cardinal transform

Child scene coordinates are authored in the placeable local frame. The compiler owns the transform:

```text
local + instance anchor + cardinal orientation -> Minecraft world transform
```

Local X/Z use one of four fixed signed permutations; local Y is added directly to anchor Y. The compiler performs that transform in generated scratch state. Authors do not receive arbitrary matrices, scoreboard multiplication, or command macros.

`table.block`, `table.text`, `table.itemDisplay`, and `table.interaction` inherit instance lifetime automatically. Block/text/item Displays receive the matching cardinal quaternion as their left rotation. This lets a pinball keep ball/flipper physics in local 2D state while its world presentation follows the placed cabinet.

`table.itemDisplay(...)` accepts only a compiler-known ItemTemplate and local transform. It renders the appearance components, not the Armor Stand placement carrier's internal `custom_data`/`entity_data`.

### Child interaction and controller semantics

A child `table.interaction(...)` uses the v23 use semantics and v24 controller binding, qualified by placeable type and slot. The interaction exists only while that slot is active.

Slot allocation and slot deactivation both advance every controller generation belonging to that slot. Consequently an old player token cannot regain control merely because a later cabinet reuses the same slot number.

The intended pattern is:

```ts
const controls = table.interaction("controls", {
  x: 0, y: 0.4, z: -0.75,
  width: 1.8, height: 1.4,
});

controls.onUse(player => {
  controls.controller.claim(player);
});

controls.controller.forPlayer(player => {
  // exact current controller; local state/input work is allowed
});
```

### Removal and pickup

`table.remove()` removes the active instance without returning an item. `table.pickUp(player)` is valid only in an exact mutable PlayerContext belonging to that instance; it gives one matching carrier stack and removes the instance.

Removal performs the following from the portable model's point of view:

- advance child controller generations, invalidating current tokens;
- mark the slot inactive;
- reset slot-local state to declaration defaults;
- kill the active anchor; child Display/interaction entities then disappear through the normal instance-lifetime lowering.

### Invalid placement and full capacity

A pending Marker outside the ownership rectangle/dimension, or one observed when all slots of that type are active, is rejected. The backend summons one matching item stack at the attempted anchor and removes the Marker.

This preserves the consumed stack in Survival. Creative placement is outside the inventory-conservation guarantee because vanilla may not consume the held stack before the rejection refund is produced.

### Reload and cleanup lifecycle

V25 placeable instances are deliberately **active-instance state**:

- ordinary play preserves active slots;
- player disconnect/reconnect does not remove a placed object;
- `table.remove()` / `pickUp()` frees a slot explicitly;
- `/reload` kills pending/active namespace-owned entities, resets every slot and slot-local state, resets controller generations, and removes player controller tokens through the existing controller-objective lifecycle;
- same-namespace replacement follows the same active-instance reset boundary;
- `portable/cleanup` removes all generated objectives, owned entities, pending Markers, child presentation/interactions, controller banks, and ownership force-loads.

Placed objects do **not** survive reload/replacement in v25. Persistent furniture is a separate capability because it requires unloaded-chunk, schema, and migration semantics.

### Resource-pack boundary

`appearance: { kind: "head", ... }` uses the built-in player-head item model and a `textures.minecraft.net` profile texture, so it needs no custom resource pack. `appearance: { kind: "model", model: "namespace:id" }` references ordinary resource-pack content. The compiler does not fetch, compile, or embed external model/texture assets. Missing resource-pack content changes appearance, not portable game-state semantics.

## Why not a Portable custom block registry?

An entity-backed placeable object does not automatically gain native block behavior. V25 therefore does not promise:

- block mining/break speed or tool rules;
- solid voxel collision;
- redstone participation;
- fluid/waterlogging behavior;
- piston behavior;
- native block-state property updates;
- block-entity persistence;
- pathfinding/lighting semantics of a native block.

Those semantics require separate bounded features if a retained game needs them.

## Non-goals

Portable v25 does not add arbitrary ItemStack/NBT/component construction, arbitrary inventory/container access, recipes or loot APIs, generic item callbacks, exact placing-player identity, unbounded runtime-created entities, placement outside ownership, dynamic chunk leasing, persistent placed objects, native custom block ids/semantics, free-angle placement, 3D/swept collision, or generic item/model display mutation.

## Compatibility

Existing v1-v24 source retains its historical version and lowering. V25-only resources are emitted only for v25 declarations. The feature uses ordinary datapack functions/entities/scoreboards and optional resource-pack model references; Fabric and client mods are not required.

The accepted implementation preserved byte-for-byte output for all 20 retained pre-v25 examples against parent compiler commit `37b4b70`.

## Acceptance result

The full gate passed on 2026-09-16 using mod-free Minecraft 26.1 on `second`, with real clients `Camera` and `Camera2`, the checked-in `examples/portable-pinball-cabinet`, and Node regression coverage.

1. Node/raw-IR/DSL validation covers v25 versioning, ownership, declaration/expansion bounds, lexical placeable-state scope, component restrictions, raw itemDisplay/state refs, pickup/controller generation behavior, and deterministic lowering.
2. Real Survival placement consumed the generated carrier and activated two slots at exact anchors `[731.5,65,732.5]` and `[741.5,65,742.5]`, both initially quantized to orientation `2`.
3. The carrier was observed as `minecraft:armor_stand` with compiler-owned `entity_data` containing the owner/pending tags plus `Invisible:1b`, `Marker:1b`, and `NoGravity:1b`; the pending marker was retagged/consumed by allocation.
4. `Camera` claimed slot 0 and `Camera2` claimed slot 1 through separate controller objectives. Real Space input changed each slot's own `launched`/ball state without changing the other slot.
5. Reusing slot 1 at orientations `0`, `1`, and `3` plus the original orientation `2` produced the expected local controls positions around the same anchor: local Z moved to `-Z`, `+X`, `+Z`, and `-X` respectively. A live block Display at orientation `3` carried left rotation `[0.0f,0.7071068f,0.0f,0.7071068f]`.
6. The cabinet's head-backed `itemDisplay` existed and rendered the compiler-known head appearance using the built-in player-head item model; no custom resource pack was required. Namespaced `kind: "model"` remains documented as resource-pack-backed.
7. Sneak-use pickup freed slot 1, returned the carrier item, removed the slot interaction, and advanced controller generation. Reallocation advanced it again; the previous player token remained stale, and a real Space press before reclaim left the new slot's `playing`/`launched` state unchanged.
8. With both slots full, a third valid placement was rejected and emitted one matching refund item. A separate placement at X > ownership max was likewise rejected, left the slot inactive, removed the pending Marker, and emitted one matching refund stack at the attempted anchor.
9. `/reload` reset both slot actives to zero, reset controller generations, removed old player controller scores, and left no pending/owned placeable entities.
10. All 20 retained v1-v24 example outputs were byte-for-byte identical to parent commit `37b4b70`.
11. Final `portable/cleanup` left zero objectives, zero namespace-owned/pending entities, and zero force-loaded chunks. The acceptance pack and temporary floors were removed; `second` ended with only vanilla enabled and the pre-existing video packs disabled/available.
12. The retained pinball-cabinet path was exercised end-to-end: item -> real placement -> cabinet right-click -> controller claim -> independent local pinball input/state -> sneak-use pickup -> slot reuse.

The final Node suite is 59/59 green.

## Consequences

- A placeable pinball cabinet is now possible without generic world queries or a Fabric runtime.
- Runtime variability is introduced only through fixed compiler-owned slots, preserving the bounded-resource model.
- Item/head/model presentation and item-display rendering gain a small reusable surface without exposing arbitrary Minecraft components.
- Object-local coordinates solve the previous anchor-plus-local-state composition problem without general arithmetic expressions in game source.
- Reload semantics stay simple: v25 placed objects are active-instance state and disappear on reload.
- Persistent furniture, native block semantics, standalone/general custom items, arbitrary item behavior, and world-wide dynamic placement remain explicit future design problems.
