# ADR 0027: Add bounded player/session reductions in Portable IR v17

## Status

Accepted and implemented. Portable v17 compiler support and the two-real-client Minecraft 26.1 reduction acceptance gate passed on the mod-free `second` environment.

## Context

Portable v12-v16 deliberately reject arbitrary shared or session-shared mutation from multi-player `forEachPlayer`. That rule avoids selector-order-dependent game state, but it also leaves common multiplayer questions without a portable expression: participant/alive counts, ready checks, team totals, and extrema.

The missing capability is aggregation, not general permission to mutate shared state from a player callback. Reduction therefore needs its own deterministic IR action whose result is written to an explicitly declared shared/session state.

Minecraft scoreboard addition and min/max operations are suitable bounded lowering primitives. Boolean `any`/`all` can be expressed by initializing an aggregate and conditionally changing it while executing as the selected players. No player identity, UUID, persistent player tag, raw selector, or arbitrary callback needs to enter Portable IR.

## Decision

Portable IR v17 adds one `player_reduce` action and `portableDsl` reduction helpers.

### Authoring API

At global scope inside `game.tick(...)`:

```ts
const players = game.teamPlayers("party");
const count = game.state("count", 0);
const total = game.state("total", 0);
const minimum = game.state("minimum", -1);
const maximum = game.state("maximum", -1);
const anyReady = game.state("anyReady", 0);
const allReady = game.state("allReady", 0);

game.reduce.count(players, count);
game.reduce.sum(players, total, player => player.state("score", 0));
game.reduce.min(players, minimum, -1, player => player.state("score", 0));
game.reduce.max(players, maximum, -1, player => player.state("score", 0));
game.reduce.any(players, anyReady, player => player.state("ready", 0).eq(1));
game.reduce.all(players, allReady, player => player.state("ready", 0).eq(1));
```

Inside a `SessionContext`, the session PlayerSet is implicit and the target must be state from that same session:

```ts
game.session("party", partyPlayers, session => {
  const count = session.state("count", 0);
  const total = session.state("total", 0);

  session.reduce.count(count);
  session.reduce.sum(total, player => player.state("score", 0));
});
```

Reduction selector callbacks are read-only `PlayerContext` scopes. They may declare/read `player.state(...)`, read `player.input.*`, and compare readable global/session/player values, but they may not emit mutations, nested player iteration, HUD declarations, or other actions. Player-local references retain the existing lexical non-escape rule.

### Operations and empty-set semantics

All results use normal portable fixed-point representation.

- `count`: logical participant count; empty set -> `0`.
- `sum`: sum of selected scalar values; empty set -> `0`.
- `min`: minimum selected scalar value; empty set -> the explicit `empty` number supplied by the author.
- `max`: maximum selected scalar value; empty set -> the explicit `empty` number supplied by the author.
- `any`: `1` when at least one selected player satisfies the condition, otherwise `0`; empty set -> `0`.
- `all`: `1` when every selected player satisfies the condition, otherwise `0`; empty set -> `1` (vacuous truth).

`min`/`max` require an explicit empty value because there is no universal finite identity value compatible with arbitrary portable fixed-point ranges. Retaining the previous target value on empty input is intentionally rejected because it would turn membership changes into stale aggregate state.

### Determinism

`player_reduce` is the only v17 operation allowed to derive shared/session-shared state from a multi-player PlayerSet. Existing `forEachPlayer` mutation restrictions remain unchanged.

The supported reductions are order-independent under Minecraft scoreboard semantics:

- count uses selector cardinality;
- sum uses scoreboard addition;
- min/max use scoreboard min/max operations after one selected value initializes the non-empty aggregate;
- any/all only move from their identity value toward the final boolean result.

As elsewhere in Portable IR, arithmetic uses Minecraft signed 32-bit scoreboard behavior and v17 does not add overflow guards for `sum`.

### Player initialization and input sampling

A PlayerSet referenced only by a reduction is still a participant set for generated lifecycle purposes. Missing player-state initialization and any referenced player-input sampling run before authored reductions, exactly as they do for `forEachPlayer`, player HUD, and camera audiences.

### Bounds

A portable program may contain at most 64 `player_reduce` actions across the complete tick action tree. Existing limits on PlayerSets, player-state slots, action count, and nesting depth remain unchanged.

This bounds generated reduction declarations and command expansion. The number of online players selected at runtime remains governed by Minecraft/server capacity, matching existing `forEachPlayer` semantics.

### Low-level IR

V17 adds:

```ts
{ op: "player_reduce", kind: "count", players, target }
{ op: "player_reduce", kind: "sum", players, target, value }
{ op: "player_reduce", kind: "min", players, target, empty, value }
{ op: "player_reduce", kind: "max", players, target, empty, value }
{ op: "player_reduce", kind: "any", players, target, condition }
{ op: "player_reduce", kind: "all", players, target, condition }
```

When nested under `for_session`, `target` resolves to that session's state and `players` must equal the session PlayerSet. At global scope `target` resolves to ordinary shared state.

### Lifecycle

Reductions introduce no persistent resource type. They write existing shared/session scoreboard holders during tick execution. Player-state/input objectives keep the existing v12 lifecycle and cleanup bank. `/reload` still resets active-instance shared, session, and player state before reductions recompute from current participants.

## Consequences

- Common multiplayer aggregate rules become expressible without weakening lexical/player mutation safety.
- Session aggregates can be authored once against the session membership rather than manually duplicating unsafe iteration patterns.
- Empty-set behavior is explicit and stable, especially for min/max.
- Reductions do not introduce player identity lookup, raw selectors, arbitrary iteration order dependencies, or runtime collections.
- Persistent state remains the next capability priority from ADR 0026 after v17 is accepted.

## Acceptance gate

V17 is complete when:

1. Node tests cover all six reductions, fixed-point results, global and session targets, empty semantics, read-only selector callbacks, session membership checks, version gating, and the 64-reduction bound.
2. Retained v1-v16 examples compile byte-for-byte identically to the pre-v17 compiler.
3. A checked-in v17 acceptance example uses two real Minecraft 26.1 clients in one external team and proves count/sum/min/max/any/all from independent player-local values.
4. Removing all participants from the team proves empty results `0 / 0 / explicit / explicit / 0 / 1` without deleting their identity-local player state.
5. `/reload` resets active-instance state and reductions recompute correctly after player initialization; `portable/cleanup` removes generated objectives while leaving external team membership untouched.
6. The complete Node regression suite remains green.

## Acceptance result

The gate passed with `examples/portable-player-reductions` and Node regression suite 22/22 green. On mod-free Minecraft 26.1 `second`, real clients `Camera` and `Camera2` were both members of external team `v17_party`. Starting from score/ready zero produced `count=2000`, `sum=0`, `min=0`, `max=0`, `any=0`, `all=0`. Camera A/left changed only Camera score to `1000`; Camera2 D/right changed only Camera2 score to `2000`; the resulting numeric aggregate was `sum=3000`, `min=1000`, `max=2000`. One ready player produced `any=1000` / `all=0`, and two ready players produced `any=1000` / `all=1000`.

Removing both players from the team produced the defined empty values `0 / 0 / -1000 / -1000 / 0 / 1000` while retaining identity-local score `1000` / `2000` and ready `1000` / `1000`. Rejoining restored the non-empty aggregate from those retained values. `/reload` preserved team membership, reset active-instance player values to zero, and recomputed `count=2000`, `sum=0`, `min=0`, `max=0`, `any=0`, `all=0`. `portable/cleanup` removed every generated objective while the external team still retained both members; final teardown removed the team and datapack and left zero objectives/teams.

All retained v1-v16 example outputs were also compared against pre-v17 commit `4c485fd` and were byte-for-byte identical.
