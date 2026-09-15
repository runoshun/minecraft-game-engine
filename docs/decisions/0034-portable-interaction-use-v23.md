# ADR 0034: Add bounded world interaction use input in Portable v23

## Status

Accepted and implemented.

## Context

Portable games can already project Displays, mannequins, world text, collision geometry, dialogs, and fixed player input, but they cannot represent a common Minecraft interaction pattern: a world object that a player explicitly uses with right click. This blocks cabinet-style games, NPC/dialogue entry points, terminals, controls, and other interactable scene objects unless the game depends on handwritten commands or external orchestration.

Minecraft 26.1 provides `minecraft:interaction`, an invisible entity with configurable `width`, `height`, and `response`. A successful right click records the latest interaction and exposes the interacting player through vanilla `execute on target`. This gives the compiler a bounded vanilla-client-compatible input channel without exposing arbitrary entity queries or packet events.

## Decision

Portable IR v23 adds statically declared interaction entities and one right-click/use action per declaration.

The DSL surface is:

```ts
const cabinet = game.interaction("cabinet", {
  x: 100,
  y: 64,
  z: 20,
  width: 1.5,
  height: 2,
  response: true,
});

game.tick(() => {
  cabinet.onUse(player => {
    // player is the player recorded by the vanilla interaction entity.
  });
});
```

`game.interaction(id, spec)` is a shared, statically declared world resource. v23 supports at most 64 declarations. `x`, `y`, and `z` use the existing shared coordinate model and may be state-backed. `width` and `height` are static finite values from `0.01` through `64`, defaulting to `1`. `response` is a static boolean defaulting to `true`. `dimension` defaults to the overworld. `when` uses the existing shared condition/lifetime model.

Each handle permits at most one `onUse(...)` handler. The handler must be declared directly in the root `game.tick(...)` action list; it cannot be nested under `game.when`, SessionContext, or another PlayerContext. This keeps event polling deterministic and prevents the same interaction record from being conditionally left pending for later replay.

## Clicking player context

`onUse(player => ...)` executes as the player selected by vanilla `execute ... on target` for that interaction entity. The callback is a mutable exact-player context, so it may:

- read and mutate `player.state(...)`;
- read `player.input.*` sampled for that player;
- mutate global shared state under the existing exact-player/single-player mutation rule;
- open/clear player-local selections and forms through `player.selection(...)` and `player.form(...)`.

`player.hud(...)` is not available in the interaction callback because the existing HUD declaration model requires a static PlayerSet audience. A use event identifies one runtime player rather than declaring a stable audience set.

The event does not create a durable controller/session binding. If a game needs the player who clicked a cabinet to remain its controller over later ticks, that identity/lifecycle is a separate capability. v23 only provides the discrete right-click event and the clicking player's context at dispatch time.

## Vanilla lowering and consumption

The backend owns a `minecraft:interaction` entity per declaration and tags it with both a stable declaration tag and the normal namespace owner tag. Spawn lowering sets `width`, `height`, and `response`. State-backed position and optional `when` follow the same update/recreate model used by other compiler-owned scene entities.

For each declared handler, tick lowering performs:

```mcfunction
execute in <dimension> as @e[type=minecraft:interaction,tag=<stable-tag>,limit=1] on target run function <callback>
execute in <dimension> as @e[type=minecraft:interaction,tag=<stable-tag>,limit=1] run data remove entity @s interaction
```

The first command dispatches only when vanilla has a current right-click target. The second consumes the recorded right-click after the dispatch attempt. A recorded use therefore cannot replay on later ticks. Minecraft's interaction entity stores only its latest use record; multiple uses that vanilla collapses into that single record before a compiler tick are observed as one event. v23 does not promise a queued input stream.

`response: true` is the portable default because cabinet/NPC-style objects normally behave as a successfully handled use target. Authors may set `response: false` when they need vanilla's non-responsive interaction semantics.

## Ownership and lifecycle

Interaction entities are compiler-owned resources. With a v10+ ownership rectangle they are created in staged `owned_init`, carry the common owner tag, remain inside ownership coverage, and are removed by the existing owner cleanup. Without ownership they use the existing temporary per-entity force-load pattern for spawn/removal.

`when` false removes the interaction entity and a later true condition recreates the declaration. `/reload` recreates exactly one owned interaction per active declaration and clears any pending use record as a consequence of replacement. `portable/cleanup` removes interaction entities, scheduled initialization, generated objectives, and ownership force-loads under the existing lifecycle.

## Non-goals

Portable v23 does not add:

- left-click/attack events;
- arbitrary entity selectors, NBT access, or generic `execute on ...` authoring;
- runtime-created or unbounded interaction entities;
- dynamic width, height, or response;
- a queued/high-frequency click stream beyond vanilla's latest interaction record;
- automatic proximity prompts or line-of-sight queries;
- durable player identity/controller binding after the callback;
- session-local interaction declarations or automatic cabinet/session allocation;
- player-private interaction visibility.

These require separate decisions if a retained game demonstrates the need.

## Compatibility

v1-v22 declarations and generated datapacks retain their previous lowering. Interaction declarations/actions require v23. The feature adds ordinary entity/function state only and introduces no registry resource, so installing or changing a v23 interaction-only pack requires ordinary `/reload`, not a server restart.

## Acceptance gate

1. DSL and raw IR validate the v23 version boundary, declaration count, geometry bounds, one-handler rule, and root-tick scope.
2. A generated interaction is a compiler-owned `minecraft:interaction` with authored dimensions/response and normal reload/cleanup semantics.
3. A real Minecraft 26.1 client right click dispatches exactly once as the clicking player, allowing both shared and player-local state mutation.
4. The consumed `interaction` record is absent after dispatch and does not replay on later ticks.
5. A second distinct right click dispatches a second event.
6. `/reload` resets active-instance state and recreates exactly one interaction entity with no stale event.
7. Existing v1-v22 retained examples remain byte-for-byte identical to the immediately preceding compiler.
8. `portable/cleanup` removes all v23-owned state/entities/force-loads.

## Acceptance result

Implemented and accepted in this change. The Node regression suite is 50/50 green, including v23 coverage for DSL/raw-IR lowering, player-local/shared callback mutation, geometry/default validation, root-only and single-handler restrictions, version gating, and the 64-declaration bound. All 18 pre-existing retained example datapacks are byte-for-byte identical to parent commit `ed4673e`.

Focused mod-free Minecraft 26.1 acceptance ran on `second` with real client `Camera` and checked-in `examples/portable-interaction`. The generated cabinet owned one `minecraft:interaction` with `width=1.8f`, `height=2.2f`, `response=1b`, the compiler owner tag, and the stable interaction tag. One real right click changed shared raw `totalUses` and Camera's player-local raw `cabinetUses` from `0` to `1000`; the generated tick then removed the entity's `interaction` compound. A second distinct real right click changed both values to `2000`, proving repeated separate uses are observable rather than level-triggered replay.

An ordinary `/reload` reset both states to `0`, recreated exactly one tagged interaction entity, and left no pending `interaction` record. `portable/cleanup` then removed every generated objective and owned entity and reduced the four acceptance force-loaded chunks to zero. After deleting the acceptance pack and reloading, only vanilla was enabled; the pre-existing `video_breakout` and `video_pinball` packs remained disabled/available.
