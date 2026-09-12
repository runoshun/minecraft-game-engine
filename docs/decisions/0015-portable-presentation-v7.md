# ADR 0015: Add bounded portable presentation projections in IR v7

Status: accepted as experimental architecture

## Context

ADR 0013 makes generated vanilla datapacks the primary deployment target, but retained examples such as the top-down roguelike and JRPG still depend on Fabric-only mutable `actors` / `render` capabilities for character presentation and HP/name labels. Copying those host APIs wholesale into Portable IR would reintroduce runtime-created entity collections and arbitrary host mutation that the vanilla-first compiler is deliberately avoiding.

The demonstrated retained-game requirement is smaller: a bounded set of declared characters, state-backed position/yaw, state-controlled lifetime, and world labels whose numeric content follows portable scalar state. Block/item-like scene markers are already covered by bounded block projections; fixed/state-backed text position already exists from v4/v5.

Minecraft 26.1 Peaceful difficulty rejects direct zombie/skeleton summons even when AI, gravity, damage, sound, and despawn are disabled. A vanilla portable character projection therefore cannot rely on hostile Mob entities while remaining difficulty-independent.

## Decision

Portable IR version 7 extends the declarative presentation subset in two ways.

### Bounded actors

`portableDsl` exposes:

```ts
game.actor(id, {
  entityType?: "minecraft:mannequin" | "minecraft:zombie" | "minecraft:skeleton",
  dimension?: string,
  x, y, z,
  yaw?,
  when?,
});
```

Coordinates and yaw may be constants or state-backed portable coordinates. `when` controls actor existence. Actor declarations are bounded to 64 per portable program.

The generated vanilla backend owns one tagged `minecraft:mannequin` per visible actor. Appearance mapping is deliberately narrow:

- `minecraft:mannequin` -> normal mannequin;
- `minecraft:zombie` -> mannequin wearing `minecraft:zombie_head`;
- `minecraft:skeleton` -> mannequin wearing `minecraft:skeleton_skull`.

This avoids hostile-Mob spawning/despawn semantics and works on Peaceful difficulty. Position and yaw are updated from scoreboard state through entity NBT stores. A false `when` removes the owned actor; a later true condition recreates it from the generated spawn function and reapplies its appearance.

The optional Fabric compatibility adapter maps the same declaration to the existing `actors` capability, where zombie/skeleton may remain actual inert Mob appearances.

### Dynamic world-text tokens

`game.text(...)` keeps accepting a static string and in v7 additionally accepts a bounded token list:

```ts
game.text("enemy_hp", {
  text: ["ZOMBIE ", hp, "/", maxHp],
  x, y, z,
  billboard: "center",
});
```

Tokens are literals or portable scalar state/input references, with the same 1..32-token bound used by the actionbar HUD. The vanilla compiler projects numeric tokens through scratch scoreboard holders and updates the owned `text_display.text` component. Values are displayed as logical integers after fixed-point division. The Fabric compatibility adapter reconstructs the same text each tick before calling `render.update`.

This intentionally solves bounded HP/score/name labels; it is not a general rich-text or string-expression system.

## Non-goals

v7 does not make the old mutable `actors` or `render` capability APIs portable. In particular it does not add runtime-created actor/display collections, arbitrary entity types, custom mannequin textures/equipment, item/model displays, attachment graphs, pitch/roll/scale animation, arbitrary rich-text mutation, or generic spawn/remove actions from arbitrary callbacks.

The retained examples should be rewritten around statically declared projections and scalar state. Runtime-generated floating combat-text IDs should be replaced by bounded/pool-like presentation or existing particle/sound feedback rather than forcing generic dynamic render ownership into Portable IR.

## Consequences

Positive:

- retained grid/turn-based games can declare moving character projections and state-backed HP labels without a server mod;
- presentation lifetime remains compiler-owned and bounded rather than becoming a general entity API;
- zombie/skeleton intents remain distinguishable on vanilla servers regardless of difficulty;
- actor/text updates reuse the existing fixed-point coordinate/state model and scoreboard projection machinery.

Tradeoffs:

- vanilla zombie/skeleton appearances are approximate mannequins with mob heads, not full Mob silhouettes;
- dynamic text currently supports integer scalar tokens rather than arbitrary string formatting/styles;
- entity/text updates use command/NBT projection and target bounded prototype scenes, not high-count animation systems;
- state-controlled actor removal and moving projections remain subject to generated ownership/reload lifecycle requirements, so ADR 0013 gate 4 remains open.

This decision extends ADR 0013 and ADR 0014. It covers the required bounded `render` / `actors` presentation semantics for retained examples; unused generic host features are explicitly out of scope for the vanilla-first API.
