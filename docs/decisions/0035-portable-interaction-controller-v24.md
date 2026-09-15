# ADR 0035: Add active-instance interaction controller binding in Portable v24

## Status

Accepted and implemented.

## Context

Portable v23 / ADR 0034 makes a compiler-owned world object directly usable: `interaction.onUse(player => ...)` runs once as the real player whose right click vanilla recorded. That is sufficient for buttons, NPC conversations, terminals, and one-shot cabinet actions, but it does not retain the clicker's identity for later ticks.

A placed arcade or pinball cabinet needs a stronger but still bounded contract. The player who uses the cabinet should be able to claim its controls, and later input rules should run only for that player. The binding must survive an ordinary disconnect/reconnect during the same active game instance, but a later claimant must replace an offline old controller without waiting for that player to reconnect. At the same time, controller identity does not need persistence: the project already treats ordinary player-local/game state as active-instance state, and `/reload` is an intentional reset boundary.

A vanilla entity tag can remember an online player, but cleanup cannot enumerate an offline tagged player. Persisting tags would therefore make namespace cleanup and replacement weaker than the compiler-owned scoreboard lifecycle. Exposing UUIDs, arbitrary tags, selectors, or raw entity queries would also be a much larger API than this use case requires.

## Decision

Portable v24 extends each `game.interaction(...)` handle with a bounded controller binding:

```ts
const cabinet = game.interaction("cabinet", {
  x: 100,
  y: 64,
  z: 20,
  width: 1.5,
  height: 2,
});

game.tick(() => {
  cabinet.onUse(player => {
    cabinet.controller.claim(player);
  });

  cabinet.controller.forPlayer(player => {
    game.when(player.input.left.eq(1), () => {
      // Run only for the currently bound online controller.
    });
  });
});
```

`controller.claim(player)` is valid only while evaluating that same interaction's `onUse` callback, including nested portable conditional branches. The argument must be the current callback's exact PlayerContext. A game cannot save a PlayerContext, pass a player from another interaction, manufacture an identity, or claim from an unrelated tick rule.

`controller.forPlayer(callback)` is declared directly in the root `game.tick(...)` action list. At runtime it invokes its callback zero or one times: zero when the current controller is offline or no controller is bound, and once as the exact currently bound online player otherwise. Its PlayerContext has the same mutable exact-player semantics as v23 `onUse`: player-local state/input and selection/form access are available and shared state mutation is allowed under the existing single-player rule. `player.hud(...)` remains unavailable because its declaration requires a static PlayerSet audience.

Controller operations upgrade the generated program to Portable v24. Merely declaring/using a v23 interaction without controller operations remains v23 and retains the previous byte-for-byte lowering.

## Binding representation

Each interaction whose controller capability is used receives one compiler-owned dummy scoreboard objective. The namespace owns a deterministic bank of up to 64 objective names, matching the existing maximum of 64 interaction declarations. Each interaction also receives one compiler-private generation holder in the namespace's main objective.

A claim performs conceptually:

```mcfunction
scoreboard players add <generation-holder> <main-objective> 1
scoreboard players operation @s <controller-objective> = <generation-holder> <main-objective>
```

The generation is an opaque integer token, not a fixed-point game value. `forPlayer` executes only players whose token equals the current generation:

```mcfunction
execute as @a if score @s <controller-objective> = <generation-holder> <main-objective> run function <callback>
```

A later claim therefore invalidates every older token without enumerating or mutating the prior controller. This is the key offline-safe property: if player A disconnects with token `1` and player B claims generation `2`, A still has token `1` while offline and does not regain control when reconnecting.

The signed 32-bit generation is explicitly guarded at `2147483647`. Before the next claim, the compiler removes and recreates that interaction's controller objective and resets the generation to zero, clearing every online and offline token in one operation; the new claim then receives generation `1`. Token reuse therefore cannot resurrect a stale controller through scoreboard overflow.

One player may independently control multiple interaction declarations because each interaction has a separate objective/generation pair. One interaction has at most one current generation and therefore at most one current controller.

## Disconnect, reload, and cleanup lifecycle

Controller binding is **active-instance state**, not persistent state.

- Disconnecting does not alter the player's controller score. Reconnecting during the same active instance resumes control if that token still matches the current generation.
- A claim by another player advances the generation immediately, including while the old controller is offline; the old token becomes stale.
- `/reload` removes the complete namespace-derived controller objective bank, recreates only the objectives required by the current v24 program, and resets every generation to zero. This clears bindings for online and offline players alike.
- `portable/cleanup` removes the complete controller objective bank as well as the normal generated resources.
- Controller binding is intentionally unrelated to `persistentState` / `persistentGrid` and is never restored after reload.

Because a v1-v23 generated pack intentionally preserves historical byte-for-byte output and therefore cannot know about a later v24 objective bank, removing the v24 controller capability from an existing namespace requires running the currently installed v24 `portable/cleanup` before replacing it with a program that compiles back to v23 or earlier. Ordinary v24-to-v24 source changes can use `/reload`; load itself resets the binding bank.

## Non-goals

Portable v24 does not add:

- persistence of controller identity across `/reload` or server/world replacement;
- player UUID/name handles, arbitrary player tags, selectors, or generic identity values in Portable IR;
- explicit `release()` / transfer-to-arbitrary-player APIs; a new matching interaction use may claim the controller, while game state can gate whether claiming is allowed;
- multi-controller membership for one interaction;
- session-local interaction/controller declarations, automatic cabinet/session allocation, or matchmaking;
- dynamic per-controller HUD declarations;
- generic entity queries or arbitrary scoreboard authoring.

Those remain separate capabilities if a retained game demonstrates the need.

## Compatibility

Portable v24 only changes lowering when `interaction.controller.claim(...)` or `interaction.controller.forPlayer(...)` is authored. Existing v1-v23 sources retain their previous Portable version and generated datapack. The controller feature adds only ordinary scoreboard/function state and no registry resource, so a v24 controller pack requires no server restart; ordinary `/reload` is the normal active-instance reset.

## Acceptance gate

1. DSL and raw IR enforce the v24 version boundary and matching-interaction claim scope.
2. `controller.forPlayer(...)` is root-tick-only and executes through an exact mutable PlayerContext; dynamic `player.hud(...)` remains rejected.
3. A real client A can claim a cabinet; while A is controller, input from client B does not run controller actions and input from A does.
4. Client B can reclaim the same cabinet; A's old token stops matching immediately and B becomes the sole active controller.
5. Disconnect/reconnect without another claim resumes the same controller during one active instance.
6. If the controller disconnects and another player claims before reconnect, the old offline token remains stale after reconnect.
7. `/reload` clears the controller objective scores/generation for all players and does not run any stale controller callback.
8. Generation overflow lowering clears the objective bank before token reuse.
9. Existing retained v1-v23 examples remain byte-for-byte identical to parent compiler commit `8af93f4`.
10. `portable/cleanup` removes controller objectives, ordinary generated objectives/entities, and ownership force-loads before pack deletion.

## Acceptance result

Implemented and accepted in this change. The Node regression suite is 54/54 green. Controller-specific tests cover generation/token lowering, the signed-32-bit wrap guard, matching-use scope, root-only controller iteration, dynamic-HUD rejection, raw-v24 validation, and preservation of plain v23 interaction lowering. All 19 pre-existing retained v1-v23 examples were compiled with this change and independently with parent commit `8af93f4`; every generated file was byte-for-byte identical.

Focused mod-free Minecraft 26.1 acceptance ran on `second` with real clients `Camera` and `Camera2` using checked-in `examples/portable-interaction-controller`. `Camera` first claimed generation `1`; its controller tick counter advanced while `Camera2` stayed at zero. A real Space press from `Camera2` left shared controller-use state unchanged, while Space from `Camera` changed only the shared value and Camera's player-local use count. `Camera2` then reclaimed generation `2`; Camera retained stale token `1`, Camera2 received token `2`, Camera's controller tick counter stopped, and only Camera2's Space input was accepted.

With Camera2 still generation `2`, disconnect/reconnect preserved token `2` and its controller tick counter resumed, demonstrating reconnect stability inside one active instance. Camera2 was then disconnected again and Camera reclaimed generation `3`; Camera2's offline token remained `2`. After Camera2 reconnected, its controller tick counter stayed exactly unchanged while Camera's continued advancing, proving an offline prior controller cannot resurrect after a later claim.

An ordinary `/reload` reset shared active-instance state and generation to `0`, removed both players' controller scores entirely, reset their player-local controller tick state, and recreated exactly one interaction entity. The final wrap-guard build was then exercised at the boundary: generation was forced to `2147483647`, a stale holder was seeded with the same controller token, and a real cabinet click removed/recreated the controller objective, reset/incremented generation to `1`, assigned the clicker token `1`, and left the seeded stale holder with no score. `portable/cleanup` then removed every generated objective and owned entity and reduced ownership force-loads to zero. The acceptance pack and temporary floor were deleted; the final server had no objectives or force-loaded chunks, only vanilla enabled, with the pre-existing `video_breakout` and `video_pinball` packs still disabled/available.
