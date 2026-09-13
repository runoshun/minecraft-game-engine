# ADR 0020: Portable multiplayer player-set and player-context model

## Status

Accepted and implemented in Portable IR v12. The retired Java/Fabric backend is not part of the v12 implementation target.

## Context

Portable v11 is single-controller-oriented. Input bindings such as `first_player_left` are sampled into global fake-score holders, portable state is global, and camera/HUD selection uses one controller. This prevents a generated vanilla game from treating multiple clients as independent participants.

A multiplayer design based on `game.player(name)` or compile-time UUID/name selection would encode deployment-specific identities into otherwise portable game logic. It would also conflate three separate concerns: selecting a set of participants, entering execution context for one participant, and storing state owned by that participant.

Minecraft's vanilla datapack model already provides a useful lowering target: selectors define sets, `execute as` establishes an entity/player execution context, and scoreboard values can be stored directly on real player holders. Offline scoreboard entries can be removed by deleting their owning objective, avoiding the offline entity-selection cleanup debt previously seen with generated player tags and gamemode mutation.

## Decision

Portable multiplayer v12 is implemented around four distinct concepts:

1. **PlayerSet** — a declarative set/audience of game participants.
2. **PlayerContext** — the current player inside a compiler-controlled player iteration/execution scope.
3. **SharedState** — existing game-wide portable state.
4. **PlayerState** — scalar state stored independently for each participant.

The initial v12 milestone is **one shared game instance with N participants**. Multiple concurrent sessions/matches are explicitly deferred.

### Player selection

The portable core does not center its API on `game.player(name)` or `game.player(uuid)`. The default entry point is an opaque participant set:

```ts
const players = game.players();
```

For v12, `game.players()` has a stable meaning: it is the current shared game's online participant set. Because v12 has one shared game instance and no lobby/session membership primitive, that set is all online players. A later lobby/team/session feature must add another explicit `PlayerSet` producer or filter; it must not silently change the meaning of `game.players()` for existing sources.

Arbitrary raw selector strings are not part of the portable API. A future tag/team/lobby filter may produce another `PlayerSet`, but portable lifecycle must not depend on persistent runtime-owned entity tags on players.

### Player execution context

Portable rules enter player context explicitly. `game.forEachPlayer` is a compiler primitive nested inside the existing `game.tick(...)` action program, not an unrestricted JavaScript runtime loop:

```ts
const players = game.players();

game.tick(() => {
  game.forEachPlayer(players, player => {
    const hp = player.state("hp", 20);
    game.when(player.input.left.eq(1), () => {
      hp.sub(1);
    });
  });
});
```

The v12 IR represents this scope explicitly as `for_each_player` / `ForEachPlayerAction(PlayerSet, actions)`. The vanilla backend lowers it to `execute as <participants> run function ...`, and player-local value references resolve against `@s` plus their generated player-local objective.

`PlayerContext` is lexical and compiler-checked:

- `game.forEachPlayer(...)` is only valid while capturing `game.tick(...)` actions;
- player-local values created or obtained from the callback may only be referenced from that same player context and its nested branches/presentation declarations;
- a player-local reference must not escape and later be used as a shared value;
- nested `game.forEachPlayer(...)` scopes are rejected in the initial v12 implementation.

The surface name `forEachPlayer` remains the intended v12 API unless implementation work reveals a concrete conflict; its execution-context semantics are fixed by this ADR.

### Shared and player-local state

`game.state(name, initial)` remains one game-wide value. `player.state(name, initial)` declares a scalar independently stored for each player. Shared state may be read from player context, but **shared-state mutation from player context is rejected in v12**. Player-local state may be mutated normally inside its owning player context.

This intentionally avoids trying to infer whether a shared mutation is mathematically commutative. Deterministic reductions such as participant count, sum, min, max, or team aggregation should be added later as explicit IR primitives when required rather than depending on selector iteration order.

Player-local values are backed by a bounded namespace-stable objective slot bank, not objective names derived from source variable names. The compiler assigns declared player-state values to slots in that bank. The implementation exposes 32 player-state slots and rejects a v12 program that exceeds that bound. Stable slot names let a newer build remove every objective the namespace could have owned even when player-state declarations were renamed or deleted between builds.

The player-local lifecycle is:

- load/replacement removes the namespace's complete player-local objective bank and initialization marker objective before recreating the objectives for the new game instance;
- before portable rules run, each online participant with no initialization marker receives every declared player-state initial value and is marked initialized;
- disconnect leaves that player's scoreboard entries intact while the game instance remains active;
- reconnect during the same active instance reuses the preserved values;
- `/reload` or namespace replacement starts a new game instance, so player-local state is reset just like existing shared portable state;
- `portable/cleanup` removes the complete player-local objective bank and initialization marker objective, which removes offline scoreboard entries without selecting offline entities.

Player-local state is therefore game-instance state, not durable persistence.

### Input and tick ordering

The existing `first_player_*` binding vocabulary remains for v1-v11 compatibility. New multiplayer authoring uses player-scoped input through `player.input.left`, `player.input.jump`, `player.input.sneak`, `player.input.hotbarSlot`, and the other supported held-input fields.

Player input is sampled per participant into namespace-stable player-local input objectives. The initial v12 player-input vocabulary is the existing portable server-observable held input plus hotbar slot; v12 does not need a new generic event channel. Rising-edge behavior can be authored deterministically with `player.state(...)` previous-value state, as existing portable games do with shared state today. Dedicated edge helpers may be added later without changing the player-context model.

Each portable tick has this ordering:

1. initialize missing player-local state for online participants;
2. sample the current player-local input values;
3. execute the authored portable action tree in source order, including `ForEachPlayerAction` scopes;
4. project camera/HUD/effects and other presentation from the post-rule state.

A player joining between ticks therefore receives initialized state and current input before its first authored player-context action executes.

### Value scope and presentation

Player-local references are intentionally narrower than shared references.

Shared state can continue to drive shared world presentation. Player-local state/input may be consumed by player-context rules and player-local presentation such as the current participant's actionbar HUD. It may not drive shared block/text/actor/world projection, the global sidebar, or shared camera coordinates in v12 because those resources have one server-global result and no meaningful single `@s` owner.

The v12 player-local HUD surface is `player.hud(id, spec)` inside `PlayerContext`; it may contain shared and player-local scalar tokens and lowers to an actionbar command addressed to the current player. Existing shared portable HUD behavior remains versioned for older IR.

The vanilla scoreboard sidebar remains shared/global. Independent per-player portable sidebars are not promised by v12.

### Camera and presentation audiences

A shared camera may target a `PlayerSet`:

```ts
game.camera("main", {
  mode: "spectate",
  audience: players,
  x: 204, y: 140, z: -22,
});
```

One owned camera carrier is shared by the audience. Camera coordinates are shared values only in v12; distinct per-player positions/carriers are deferred. Player names and UUIDs are never embedded in generated packs.

Camera mode does not own gamemode. `spectate` applies only to spectator participants in the audience; `position_lock` applies only to non-spectator participants in the audience. Entering or leaving Spectator remains external session lifecycle.

Sound and other commands with a vanilla target audience should address the declared/default participant `PlayerSet` instead of unconditional `@a`, so unrelated players are not treated as game participants. Shared actors, block/text displays, and terrain remain server-global scene state unless a later primitive explicitly introduces private presentation.

### Compiler/backend scope

v12 is implemented only in the Node portable compiler and generated vanilla datapack backend. The Java/Fabric compatibility runtime was retired before v12 implementation begins, so there is no second runtime adapter whose player semantics must be kept in sync.

### Lifecycle

Portable multiplayer must preserve the lifecycle guarantees established by v10/v11:

- no generated persistent controller tags on player entities;
- no implicit portable ownership of player gamemode;
- cleanup works even when previous participants are offline;
- namespace replacement does not duplicate owned entities or retain any stale player-local objective slots;
- spectator entry/exit remains external game/session lifecycle unless an offline-safe restoration mechanism is designed later.

## Consequences

- Multiplayer becomes a first-class IR concern rather than a selector string pasted onto single-player commands.
- Player identity stays runtime-bound; portable game sources do not require fixed names or UUIDs.
- `game.players()` has stable v12 semantics; future membership models add explicit `PlayerSet` producers instead of redefining it.
- The IR gains explicit player execution scopes plus player-state/player-input value kinds.
- Player-context shared writes are rejected, keeping selector order from becoming observable game logic.
- Namespace-stable bounded objective slots make offline cleanup and declaration rename/removal deterministic.
- Existing v1-v11 sources and their `first_player_*` semantics remain compatible.
- Camera, input, HUD, state, and lifecycle share one participant abstraction instead of each inventing its own controller-selection rule.
- Multiple concurrent matches/sessions, player-private world scenes, per-player vanilla sidebars, distinct per-player cameras, and implicit shared-state reductions remain out of the initial v12 scope.

## Implemented objective layout

The first v12 compiler fixes the internal bounded layout as follows:

- 32 player-state objectives. Declarations are assigned deterministically by sorted state name to `mps<namespace-hash><2-digit-base36-slot>`;
- one initialization-marker objective `mpz<namespace-hash>`;
- eight fixed player-input objectives `mpi<namespace-hash><2-digit-base36-input-index>` in the stable order `hotbarSlot`, `forward`, `backward`, `left`, `right`, `jump`, `sneak`, `sprint`;
- 32 per-player HUD scratch objectives `mph<namespace-hash><2-digit-base36-slot>`.

All names stay within Minecraft's scoreboard-objective naming limit. Load/replacement and `portable/cleanup` remove the complete possible bank, not only objectives referenced by the current build. That is what makes declaration rename/removal and offline-player cleanup deterministic.
## Validation

The initial v12 implementation passed Node compiler regression tests, exact v1-v11 generated-output parity against commit `5a446ea`, and mod-free Minecraft 26.1 acceptance on `second`. Two simultaneously connected participants demonstrated independent player-local input/state and rising-edge behavior; reconnect preserved state within one active instance, `/reload` reset it, the real client rendered player-local actionbar values while sharing the fixed camera, and cleanup removed the complete player objective bank even with a previous participant offline. The existing Breakout and Pinball v10 packs were then regenerated and replayed successfully as compatibility regressions.

A follow-up acceptance used two simultaneous real Minecraft clients to close the shared `spectate` camera path. `Camera` and `Camera2` were both externally placed in Spectator, both attached to the same generated carrier, and both remained at its position/rotation under independent mouse-look attempts. Real A input on the first client changed only its player-local state; real D input on the second changed only the second client's state. Cleanup left both gamemodes untouched and removed generated objectives/force-loads. The v12 multiplayer camera semantics are therefore validated for both `position_lock` and shared `spectate` audiences.
