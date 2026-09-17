# ADR 0037: Interaction-controller camera audience and return in Portable v26

## Status

Accepted, implemented, and validated on Minecraft 26.1.

## Context

Portable v23/v24 can make a world interaction claim one exact active-instance controller, and Portable v25 can put that interaction on a bounded placeable object. The remaining cabinet gap is presentation routing: a player can use a small placed cabinet and drive later input, but the existing camera API can target only a static `PlayerSet` (`all_online` or one declared team). It cannot route a camera to the exact player who just claimed an interaction without exposing a player name, UUID, tag, selector, or other identity value.

The pinball reference game needs the physical cabinet and the actual game board to be separate. The placed object should be roughly block-sized. Using it should move only that cabinet's active controller to a fixed remote playfield camera, while unrelated players remain where they are. The controller also needs a bounded way to leave the remote view and return to the source interaction.

## Decision

Portable v26 reuses the existing v24 interaction-controller generation token as a dynamic camera audience. It does not add a new identity representation.

### Controller camera audience

`game.camera` accepts an `InteractionController` handle as `audience`:

```ts
const cabinet = game.interaction("cabinet", { x: 8, y: 65, z: 8 });

cabinet.onUse(player => {
  cabinet.controller.claim(player);
});

cabinet.controller.forPlayer(player => {
  // exact current controller input/rules
});

game.camera("playfield", {
  x: 100,
  y: 90,
  z: 100,
  yaw: 180,
  audience: cabinet.controller,
});
```

The v26 IR serializes this as a camera audience reference `{ interactionController: "<interaction-id>" }`. At runtime the generated camera lock executes as online non-Spectator players and applies only when that player's private controller-objective score equals the interaction's current generation holder. The same token equality already used by `controller.forPlayer(...)` therefore selects the camera audience.

No player name, UUID, persistent tag, selector string, or generic identity value enters Portable IR or authoring source.

### Initial bound: one position-lock controller camera

A program using a controller-backed camera must declare exactly one camera, and that camera must use `position_lock`. Static PlayerSet cameras retain their existing v14 behavior and bounds when no controller-backed camera is present.

This restriction is deliberate. Multiple dynamic camera owners introduce arbitration/priority semantics when one player holds more than one valid controller token. `spectate` would additionally require the target player to already be in Spectator, while interaction use normally originates from ordinary gameplay. Portable continues not to own gamemode. Those cases need a separate design rather than implicit precedence or hidden gamemode mutation.

The v26 `position_lock` lowering uses the existing owned armor-stand camera carrier and teleports only the matching non-Spectator controller player to it each tick. It does not alter gamemode; a controller that is externally changed to Spectator is no longer position-locked until it leaves Spectator.

### Return to source interaction

`InteractionController` adds:

```ts
controller.returnToInteraction(player)
```

It is valid only inside that same controller's `forPlayer(player => ...)` callback and only for the current exact controller player. The generated action:

1. teleports that player to the controller's source `minecraft:interaction` entity when it exists; and
2. advances the controller generation without assigning the new generation to the player.

Advancing the generation releases the current controller and invalidates every old token. Because authored actions run before the camera-lock phase in the generated tick, the subsequent controller-camera equality test fails in that same tick and does not teleport the player back to the remote camera.

For a v25 placeable child interaction, the interaction entity already follows the placed slot's anchor/orientation and exists only while the slot is active, so the same return primitive naturally returns to the currently placed cabinet. Slot removal/allocation keeps its existing generation-advance behavior.

If the interaction entity no longer exists, the return teleport is skipped but the controller generation is still advanced. Release therefore remains deterministic even if presentation lifetime changed before the return action.

### Lifecycle

V26 adds no new scoreboard bank. Camera ownership reuses the v24 controller objective/generation resources and existing camera carrier lifecycle. `/reload`, same-namespace replacement, controller wrap handling, placeable removal/reuse, and `portable/cleanup` keep the v24/v25 reset semantics.

A controller-backed camera reference counts as controller use even if source actions contain no `forPlayer` action, so the compiler creates the required controller objective/generation holder for that referenced interaction.

## Compatibility

Existing v1-v25 source keeps its previous version and lowering unless it uses a controller handle as a camera audience or calls `returnToInteraction`. Static `PlayerSet` camera behavior is unchanged. V26 introduces no registry resource, resource-pack requirement, Fabric dependency, or client mod requirement.

## Non-goals

Portable v26 does not add generic player identity values, arbitrary controller release/transfer, simultaneous controller-camera arbitration, multiple controller-backed cameras, controller-backed `spectate`, gamemode ownership/restoration, per-player camera coordinates, private world visibility, persistent controller identity across reload, or dynamic arena allocation.

## Acceptance gate

Before merge, validation must show on mod-free Minecraft 26.1 that:

1. the checked-in small placeable pinball cabinet can be placed and used by a real client;
2. only the player who claims the cabinet is position-locked to the remote playfield camera;
3. another real client remains unaffected and cannot drive the claimed controller;
4. real left/right/jump input continues to drive the remote pinball rules;
5. real Sneak executes `returnToInteraction`, returns the controller to the placed cabinet, and invalidates the controller token so the camera does not immediately recapture the player;
6. a later use can claim the cabinet again and re-enter the remote playfield;
7. `/reload` and cleanup retain the v24/v25 reset guarantees; and
8. the complete Node regression suite passes and retained pre-v26 examples remain compilable.


## Acceptance result

The gate passed on 2026-09-17 on mod-free Minecraft 26.1 `second` using the checked-in `examples/portable-pinball-cabinet` and real clients `Camera` and `Camera2`.

- The generated marker reported Portable v26 with one placeable slot, one child interaction/controller, and one camera. `/reload` reported no datapack problems.
- Real Survival placement consumed Camera's generated head-backed carrier and allocated the only slot at anchor `[732.5,65,731.5]`; the child interaction was `[732.5,65.65,731.98]`. The visible cabinet declaration is approximately one block wide/deep, while the pinball playfield is separately located around `[770,104,770]`.
- Before claim, allocation had advanced the slot controller generation to `1` and neither player held a token. A real cabinet right click advanced generation to `2`, assigned token `2` only to Camera, and moved Camera to the remote camera carrier at `[770,104,778]`. Camera2 received no controller score and was not camera-routed.
- Real `Space+A` from Camera2 left `launched=0` and `ballY=-1850`. Real Space from Camera changed `launched` to `1000`; the ball then advanced to `ballX=1080`, `ballY=1685` during the sampled run, with game score also changing. This proves the remote controller path consumes the claimed real player's input rather than unrelated player input.
- Real Sneak returned Camera to the cabinet interaction. Generation advanced `2 -> 3` while Camera retained stale token `2`; after 700 ms Camera remained at the cabinet rather than being recaptured. A second real use advanced generation `3 -> 4`, assigned Camera token `4`, and routed it back to the remote view.
- `/reload` during the second active claim reset generation to `0`, removed Camera's controller score, reset the placeable active holder to `0`, and removed its anchor/interaction. Final `portable/cleanup` left zero objectives, zero ownership force-loads, and zero namespace-owned entities. The acceptance pack and temporary floors/items were removed; `second` returned to vanilla-only enabled datapacks.
- The Node suite is 63/63 green. All 21 retained pre-v26 example sources from parent commit `5a4b98b`, including the former v25 pinball-cabinet source, compile byte-for-byte identically with the v26 compiler and the parent v25 compiler.
