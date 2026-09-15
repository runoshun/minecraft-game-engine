# ADR 0036: Bounded item templates and placeable object instances in Portable v25

## Status

Proposed. Not implemented.

## Context

Portable v23/v24 can make a statically declared world object usable and bind its exact clicking player as a later controller, but the object's world coordinates still come from compile-time declarations or shared state authored by the game. A retained game cannot currently hand a player a cabinet item, let the player place that cabinet at a world location, and then run an independent game instance relative to the placed cabinet.

The pinball-cabinet use case makes the missing boundary concrete. The game needs all of the following without opening a generic NBT, inventory, selector, raycast, or runtime-entity API:

- a custom-looking item stack that the compiler can identify;
- normal vanilla placement UX that yields an exact world anchor and facing;
- a bounded number of runtime object instances;
- per-instance local game state;
- presentation and interactions authored in object-local coordinates;
- v24 controller ownership per placed instance;
- deterministic removal, slot reuse, reload, and cleanup.

A data pack/resource pack does not create a new vanilla item or block registry type. Portable therefore must not present `game.customBlock("...")` as if Minecraft had a new block id with native mining, collision, redstone, waterlogging, or block-state semantics. The portable abstraction is an item-backed **placeable world object** whose backend may use entities and Displays.

A focused Minecraft 26.1 probe established a useful vanilla lowering path. An `minecraft:armor_stand` item with compiler-authored `minecraft:entity_data` can place an invisible Marker armor stand carrying a stable compiler tag; the placed entity preserves the real placement `Pos` and player-facing `Rotation`. This provides an exact anchor without exposing raycasts or block queries. The probe also showed that `item_used_on_block` and `summoned_entity` advancements are not a reliable exact-player callback for this armor-stand placement path, so v25 must not promise an `onPlace(player)` identity that vanilla did not actually provide.

## Decision

Portable v25 will add two bounded concepts:

1. **ItemTemplate** — a statically declared portable item stack identity/presentation with a very small compiler-owned component surface.
2. **PlaceableType / PlaceableInstance** — a compile-time-bounded slot pool whose slots become active when a matching placement marker is observed inside the program ownership region.

The feature remains vanilla-client compatible. A custom namespaced item model may require a normal resource pack, but never a client mod.

### Item templates

Initial authoring shape:

```ts
const pinballItem = game.item("pinball_machine", {
  base: "minecraft:armor_stand",
  name: "Pinball Machine",
  model: "arcade:pinball_machine",
  maxStackSize: 1,
  glint: false,
});
```

V25 item templates are intentionally not a generic item-component escape hatch. The initial fields are:

- `base`: static vanilla item resource id;
- `name`: static literal display name;
- `model?`: static `minecraft:item_model` resource id;
- `maxStackSize?`: integer `1..64`, subject to vanilla validity for the base item;
- `glint?`: static boolean.

The compiler adds a namespace/type identity in `minecraft:custom_data`. Authors cannot provide arbitrary `custom_data`, `entity_data`, NBT, commands, arbitrary item components, enchantments, attributes, food behavior, durability behavior, or arbitrary predicates through this API.

An item handle may be granted only through an exact PlayerContext action:

```ts
pinballItem.give(player);
pinballItem.give(player, 2);
```

`give` is a bounded compiler-known stack action, not a general inventory API. V25 does not add arbitrary inventory reads, slot addressing, removal predicates, container mutation, recipes, loot-table authoring, or generic item-use callbacks.

### Placeable types

Initial authoring shape:

```ts
const pinballs = game.placeable("pinball", {
  item: pinballItem,
  maxInstances: 4,
  orientation: "cardinal",
}, table => {
  // one lexical template, compiler-expanded into fixed instance slots
});
```

A v25 placeable item must use the compiler-supported placement carrier. The first backend requires `base: "minecraft:armor_stand"`; this is validated rather than silently changing an arbitrary base item's vanilla behavior. The compiler augments the stack's `minecraft:entity_data` so successful vanilla placement creates an invisible, no-gravity Marker armor stand with a namespace/type-specific pending-placement tag.

The pending Marker is an internal transport, not the durable game object. The placement service observes it while its chunk is loaded, verifies that it lies inside the declared ownership rectangle and ownership dimension, assigns the lowest free slot deterministically, copies `Pos` into compiler-owned fixed-point anchor holders, quantizes yaw to the nearest cardinal orientation, initializes that slot's instance state, removes the Marker, and activates the slot.

Placeable programs therefore require the existing v10+ ownership rectangle. V25 does not add arbitrary world-wide instance discovery or dynamic chunk leasing.

### Bounded instance pool

The template callback is compile-time composition, analogous to `game.repeat`; it does not create a JavaScript collection or runtime callback. Every possible instance is a statically known slot.

Initial limits are proposed as:

- at most 32 `ItemTemplate` declarations;
- at most 8 `PlaceableType` declarations;
- `maxInstances` in `1..16` per type;
- at most 32 placeable slots in aggregate;
- at most 16 instance-state fields per placeable template and 256 expanded instance-state cells in aggregate;
- at most 256 expanded placeable child presentation entities in aggregate;
- child interactions still count against the existing global 64-interaction/controller bank;
- the existing 2,048-action expanded-program bound still applies after slot expansion.

The concrete numbers are acceptance bounds, not a promise that runtime collections have become general-purpose.

### PlaceableInstanceContext

Inside the template callback, `table` is a lexical `PlaceableInstanceContext`. Its references cannot escape to global source or another placeable template.

The first context should expose:

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

`table.state(...)` is active-instance shared state for exactly one fixed slot. Placement initializes it to the authored default. Removal clears the slot and a later placement into that slot reinitializes it. It is not persistent state.

Collision remains the existing bounded **local 2D logic collision**. V25 does not add 3D collision. The important change is that presentation coordinates are object-local while collision/game coordinates may remain local and independent of Minecraft world placement.

### Local coordinates and cardinal transform

All child scene coordinates are authored in the placeable's local frame. The compiler owns local-to-world projection:

```text
local + instance anchor + cardinal orientation -> Minecraft world transform
```

This is deliberately stronger than exposing generic `state + state` arithmetic. A pinball game can keep `ballX` / `ballY` as local physics state while the compiler projects the ball relative to the table anchor.

For cardinal yaw, local X/Z transform as one of four fixed signed permutations; local Y is added directly to anchor Y. The compiler performs that transform in generated scratch state. Authors do not receive raw scoreboard multiplication, arbitrary matrices, or command macros.

`table.block`, `table.text`, `table.itemDisplay`, and `table.interaction` inherit the instance lifetime automatically. Cardinal placement also rotates child presentation where the underlying Display primitive supports it. The v25 Minecraft acceptance gate must prove the chosen Display rotation lowering rather than assuming visual yaw behavior.

`table.itemDisplay(...)` is the first bounded portable item-display projection. It accepts a compiler-known ItemTemplate and local transform only; it does not expose arbitrary ItemStack NBT/components. This gives a custom modeled placeable a single-model rendering path while block-display composition remains available for vanilla-block-built cabinets.

### Child interaction and controller semantics

A child `table.interaction(...)` uses the v23 use semantics and v24 controller binding, but its declaration is qualified by placeable type and slot. The interaction exists only while that slot is active.

A slot deactivation or pickup must invalidate every controller generation belonging to that slot before the slot can be reused. An old player token must never regain control merely because a new cabinet later reuses the same slot number.

This permits the intended cabinet pattern:

```ts
const pinballs = game.placeable("pinball", {
  item: pinballItem,
  maxInstances: 4,
  orientation: "cardinal",
}, table => {
  const left = table.state("left", 0);
  const right = table.state("right", 0);
  const ballX = table.state("ballX", 0);
  const ballY = table.state("ballY", -4.6);

  const controls = table.interaction("controls", {
    x: 0, y: 1.1, z: -0.8,
    width: 1.8, height: 1.2,
  });

  table.block("body", {
    block: "minecraft:polished_blackstone",
    x: 0, y: 0, z: 0,
    scale: { x: 2.2, y: 2.4, z: 0.5 },
  });

  table.tick(() => {
    left.set(0);
    right.set(0);

    controls.onUse(player => {
      controls.controller.claim(player);
    });

    controls.controller.forPlayer(player => {
      left.set(player.input.left);
      right.set(player.input.right);
    });

    // Pinball physics stays in table-local coordinates.
  });
});
```

The exact API spelling may be refined during implementation, but the semantic boundaries above are the decision.

### Removal and pickup

`table.remove()` is a slot-local action that removes the instance without returning an item.

`table.pickUp(player)` is valid only in an exact mutable PlayerContext belonging to that instance (for example its use/controller callback). It gives one matching ItemTemplate stack to that player and then removes the instance. If vanilla `/give` cannot insert the stack, normal vanilla drop behavior applies.

Removal performs all of the following atomically from the portable point of view:

- invalidate child controller bindings;
- mark the slot inactive;
- reset instance-local state to declaration defaults for the next placement;
- remove all child Display/interaction entities for the slot.

### Invalid placement and full capacity

A pending Marker outside the ownership rectangle/dimension, or one observed when all slots of that type are active, is rejected. The backend removes the marker and emits one matching item stack at the attempted anchor as a refund.

This preserves finite-item behavior in Survival, which is the gameplay acceptance mode. Vanilla Creative placement does not consume the held stack, so a rejected Creative placement can also create the refund drop. V25 does not claim Creative inventory conservation or mixed Creative/Survival economy security; Creative remains a development/admin mode for this feature. A later design may add an exact placement-player transport if a vanilla mechanism proves reliable.

### Reload and cleanup lifecycle

V25 placeable instances are intentionally **active-instance state**. They follow the same simple reset boundary selected for controller binding:

- ordinary play preserves active slots;
- disconnect/reconnect does not remove a placed object;
- `table.remove()` / `pickUp()` frees a slot explicitly;
- `/reload` removes every pending placement marker and every active placeable child entity and resets all slots to inactive;
- same-namespace replacement has the same reset semantics;
- `portable/cleanup` removes all placeable state, markers, children, controller state, and ownership resources.

Placed objects therefore do **not** survive reload/server replacement in v25. Persistent furniture/world decoration is a separate capability because it introduces schema/migration and unloaded-chunk lifecycle questions analogous to persistent state. It must not be smuggled into the first placeable version.

### Resource-pack boundary

A namespaced `ItemTemplate.model` references ordinary resource-pack content. The compiler does not fetch, compile, or embed arbitrary model/texture assets in the generated datapack. A missing custom resource pack affects appearance, not portable game-state semantics.

Built-in `minecraft:` item models remain usable with no custom pack. A server-provided resource pack still satisfies the project's vanilla-client requirement because no client mod is needed.

## Why not a Portable custom block registry?

V25 deliberately does not expose a fake new block id. An entity-backed placeable object does not automatically gain native block behavior. In particular it does not promise:

- block mining/break speed or tool rules;
- solid voxel collision;
- redstone participation;
- fluid/waterlogging behavior;
- piston behavior;
- block-state property updates;
- chunk-persistent block-entity storage;
- pathfinding/lighting semantics of a native block.

Those semantics should be added only as separate bounded features if a retained game needs them. Calling this object a `PlaceableType` prevents game source from depending on properties the backend cannot portably guarantee.

## Non-goals

Portable v25 does not add:

- arbitrary ItemStack/NBT/component construction;
- arbitrary inventory/container access, recipes, or loot-table APIs;
- generic right-click item callbacks unrelated to placeable markers;
- exact placing-player identity or `onPlace(player)`;
- unbounded/runtime-created entity collections;
- placement outside the declared ownership region;
- dynamic chunk leasing or world-wide placed-object discovery;
- persistence of placed objects across `/reload`/replacement;
- native custom block ids or native block collision/redstone/mining semantics;
- arbitrary 3D transforms or free-angle placement; v25 placement is cardinal;
- 3D/swept collision;
- generic item/model display mutation beyond the bounded template surface.

## Compatibility

V25 lowering is used only when ItemTemplate/placeable declarations or item-display children are authored. Existing v1-v24 sources retain their previous Portable version and generated output.

The feature adds ordinary datapack functions, advancements only where required by the eventual validated placement lowering, predicates if needed, compiler-owned scoreboard/entity state, and optional references to external resource-pack ids. It must not require Fabric or a client mod.

## Acceptance gate

Implementation is not accepted until all of the following are demonstrated:

1. Node DSL/raw-IR tests enforce v25 versioning, all declaration/expansion bounds, lexical instance references, ownership requirements, and item-component restrictions.
2. A real Minecraft 26.1 Survival client receives a compiler-known placeable item and places it on two distinct valid blocks; generated slots capture the exact placement positions and cardinal orientations.
3. The placement transport uses the proved Armor Stand Marker path: compiler tag, `Invisible`, `Marker`, and `NoGravity` survive item placement and the marker is consumed by the allocator.
4. Two simultaneously active instances maintain independent instance state and independent child interaction/controller ownership.
5. Local dynamic presentation follows `anchor + local state` correctly at all four cardinal orientations while local 2D collision/game state remains unchanged.
6. `itemDisplay` renders a compiler-known ItemTemplate; at least one built-in model path is accepted without a custom resource pack, and a namespaced model is documented as resource-pack-backed.
7. Pickup frees the slot, returns the item, removes all children, invalidates the old controller, and reusing the same slot cannot resurrect the old controller token.
8. An outside-ownership placement and an over-capacity placement are rejected deterministically; Survival receives one refund stack at the attempted anchor.
9. `/reload` clears all placed instances and pending markers by design and leaves no stale controller/objective/entity state.
10. Existing retained v1-v24 examples remain byte-for-byte identical to parent compiler output.
11. `portable/cleanup` leaves zero v25-owned objectives/entities/force-loads after acceptance teardown.
12. A retained `portable-pinball-cabinet` example proves the motivating path: obtain item -> place cabinet -> right-click cabinet -> claim controller -> play independent local pinball -> pick cabinet back up.

## Consequences

- A placeable pinball cabinet becomes possible without generic world queries or a Fabric runtime.
- Runtime variability is introduced only through fixed compiler-owned slots, preserving the project's bounded-resource model.
- Item presentation and item-display rendering gain a small reusable type without opening arbitrary Minecraft components.
- Object-local coordinates solve the previous `anchor + ballX` composition problem without adding generic multiplication/addition expressions to game source.
- Reload semantics stay simple: v25 placed objects are active-instance state and disappear on reload.
- Truly persistent furniture, native block semantics, arbitrary item behavior, and world-wide dynamic placement remain explicit future design problems rather than accidental v25 commitments.
