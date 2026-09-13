# ADR 0020: Portable multiplayer player-set and player-context model

## Status

Accepted design direction; implementation is planned and not yet present in portable v11.

## Context

Portable v11 is single-controller-oriented. Input bindings such as `first_player_left` are sampled into global fake-score holders, portable state is global, camera/HUD selection uses one controller, and the Fabric compatibility adapter collapses its already per-player input snapshots to `input.players()[0]`. This prevents a generated vanilla game from treating multiple clients as independent participants.

A multiplayer design based on `game.player(name)` or compile-time UUID/name selection would encode deployment-specific identities into otherwise portable game logic. It would also conflate three separate concerns: selecting a set of participants, entering execution context for one participant, and storing state owned by that participant.

Minecraft's vanilla datapack model already provides a useful lowering target: selectors define sets, `execute as` establishes an entity/player execution context, and scoreboard values can be stored directly on real player holders. Offline scoreboard entries can be removed by deleting their owning objective, avoiding the offline entity-selection cleanup debt previously seen with generated player tags and gamemode mutation.

## Decision

Portable multiplayer v12 will be designed around four distinct concepts:

1. **PlayerSet** — a declarative set/audience of game participants.
2. **PlayerContext** — the current player inside a compiler-controlled player iteration/execution scope.
3. **SharedState** — existing game-wide portable state.
4. **PlayerState** — scalar state stored independently for each participant.

The initial v12 milestone is **one shared game instance with N participants**. Multiple concurrent sessions/matches are explicitly deferred.

### Player selection

The portable core will not center its API on `game.player(name)` or `game.player(uuid)`. The intended default entry point is a participant set, conceptually:

```ts
const players = game.players();
```

The first implementation may define this default membership as all online players while preserving `PlayerSet` as an IR abstraction. Later lobby/team/session membership may refine how the set is produced without changing player-scoped state or execution semantics. Arbitrary raw selector strings are not part of the initial API.

A tag-filtered or otherwise externally managed set may be added later, but such filters must return `PlayerSet`, not an ambiguous single player. Generated portable lifecycle must not depend on persistent runtime-owned entity tags on players.

### Player execution context

Portable rules need an explicit player context, conceptually:

```ts
const players = game.players();

game.forEachPlayer(players, player => {
  const hp = player.state("hp", 20);
  game.when(player.input.left.eq(1), () => {
    hp.sub(1);
  });
});
```

`game.forEachPlayer` is the current preferred spelling, but the final surface name may change before implementation. The semantic decision is that this is a **compiler primitive**, not an unrestricted JavaScript runtime loop. The vanilla backend lowers the scope to `execute as <participants> ...`, and player-local value references resolve against `@s`.

### Shared and player-local state

`game.state(name, initial)` remains one game-wide value. `player.state(name, initial)` is planned as a value independently stored for each player.

Join/reconnect semantics for the initial milestone are:

- a participant with no existing player-local value receives its declared initial value;
- disconnect preserves player-local values while the game remains active;
- reconnect of the same Minecraft player reuses those values;
- generated namespace cleanup/replacement removes the owning player-local objectives, which clears both online and offline scoreboard entries without requiring the player entity to be selectable.

Player-local state is therefore game-session state, not durable persistence across cleanup. A future persistence API, if any, is a separate concern.

### Determinism and shared writes

A player iteration has no portable ordering guarantee. Code that mutates one shared scalar once per selected player can become dependent on selector/execution order. Therefore v12 must not silently compile arbitrary order-sensitive writes from player context into shared state.

The first implementation should allow player-local writes freely and either reject shared-state mutation from player context or permit only operations proven order-independent. If games later need reductions such as player count, totals, min/max, or team aggregation, those should receive explicit deterministic aggregation primitives rather than relying on player iteration order.

### Input

The existing `first_player_*` binding vocabulary remains for v1-v11 compatibility. New multiplayer authoring should use player-scoped input, conceptually `player.input.left`, `player.input.jump`, and `player.input.hotbarSlot`. Held values and any rising-edge history must be independent per player.

The vanilla lowering should sample predicates/data while executing as each selected player and store the result on that player's scoreboard holder. The Fabric adapter already snapshots input per UUID and must expose the same portable semantics instead of selecting `input.players()[0]`.

### Camera and presentation audiences

A shared camera may target a `PlayerSet`:

```ts
game.camera("main", {
  mode: "spectate",
  audience: players,
  x: 204, y: 140, z: -22,
});
```

For a shared fixed spectator camera, one owned camera carrier may be observed by every spectator in the audience. Player names and UUIDs are not embedded in the generated pack. Distinct per-player camera positions/carriers are deferred until a concrete game requires them.

Per-player actionbar HUD is in the initial scope because the vanilla backend can render while executing as the current participant. The vanilla scoreboard sidebar remains shared/global: independent packet-local sidebars are a Fabric capability and are not promised by the portable vanilla backend. Shared world entities, displays, text, and terrain likewise remain shared scene state unless a later primitive explicitly introduces private presentation.

Sound and other presentation commands should target participants rather than unconditional `@a` where vanilla permits an audience selector, so unrelated online players are not treated as game participants.

### Lifecycle

Portable multiplayer must preserve the lifecycle guarantees established by v10/v11:

- no generated persistent controller tags on player entities;
- no implicit portable ownership of player gamemode;
- cleanup must work even when previous participants are offline;
- namespace replacement must not duplicate owned entities or retain stale player-local objectives;
- spectator entry/exit remains external game/session lifecycle unless an offline-safe restoration mechanism is designed later.

## Consequences

- Multiplayer becomes a first-class IR concern rather than a selector string pasted onto single-player commands.
- Player identity stays runtime-bound; portable game sources do not require fixed names or UUIDs.
- The current scalar IR needs a new version because player-scoped value references and execution context cannot be represented by the v11 global fake-score model.
- Existing v1-v11 sources and their `first_player_*` semantics remain compatible.
- Camera, input, HUD, state, and lifecycle can share one participant abstraction instead of each inventing its own controller-selection rule.
- Multiple concurrent matches/sessions, player-private world scenes, per-player vanilla sidebars, and arbitrary shared-state mutation inside player iteration remain out of the initial v12 scope.

## Open implementation details

The architectural model above is accepted, but these details should be settled during v12 implementation rather than encoded prematurely in the public API:

- the final method name for entering `PlayerContext` (`forEachPlayer` is the preferred current spelling);
- exact membership configuration accepted by `game.players(...)` beyond the default participant set;
- generated objective layout and naming for player-local state/input;
- whether a small subset of provably commutative shared mutations is allowed inside player context or all such writes are initially rejected;
- the precise DSL surface for per-player HUD declarations and player-scoped input edge helpers.
