# ADR 0024: Add team-bound session-local state, Grid, and RNG in Portable IR v15

## Status

Accepted for implementation. The v15 milestone remains open until compiler support and the two-session Minecraft 26.1 acceptance gate in this ADR pass.

## Context

Portable v14 can partition players, HUDs, and cameras by externally managed vanilla teams, but the actual portable game instance is still singular. `game.state(...)`, `game.grid(...)`, and `game.rng(...)` are server-global within the generated pack. Two team PlayerSets can therefore receive independent input and presentation while still mutating the same shared score, topology, and random stream.

The next boundary is independent logical match state. World-private projection is intentionally not part of the same step: two sessions cannot safely project different blocks/entities into the same vanilla coordinates without an arena/allocation model. Session-local logic state can be made deterministic and bounded first, then a later decision can map sessions to distinct world regions.

## Decision

Portable IR v15 adds compile-time session slots bound one-to-one to team-backed v14 PlayerSets. A session owns shared scalar state, bounded Grids, and RNG streams. It does not own the vanilla team or player identity.

### Authoring API

A session is declared and its per-tick rule body is captured inside the one existing `game.tick(...)` callback:

```ts
const redPlayers = game.teamPlayers("v15_red");
const bluePlayers = game.teamPlayers("v15_blue");

game.tick(() => {
  game.session("red", redPlayers, session => {
    const score = session.state("score", 0);
    const map = session.grid("map", { width: 16, height: 16, initial: 0, outside: 1 });
    const rng = session.rng("run", { seed: 12345 });

    session.forSinglePlayer(player => {
      game.when(player.input.right.eq(1), () => score.add(1));
    });
  });

  game.session("blue", bluePlayers, session => {
    // The same local declaration names are valid in another session.
  });
});
```

`game.session(id, players, callback)`:

- requires portable v15;
- is valid only directly or conditionally inside the single `game.tick(...)` build callback, not inside another SessionContext or PlayerContext;
- requires `players` to be a team-backed PlayerSet from `game.teamPlayers(...)`; `all_online` is not a v15 session key;
- binds one compile-time session id to one external team and rejects reuse of the same team by another session;
- executes its authored non-player actions exactly once per portable tick regardless of how many members of that team are online;
- exposes `session.players`, `session.state`, `session.grid`, `session.rng`, `session.forEachPlayer`, and `session.forSinglePlayer`.

The session id is a portable id and is compile-time only. No runtime string lookup or arbitrary selector is exposed.

### Session-local scalar state

`session.state(name, initial)` is shared by the session, not by an individual player. The same local name may be reused by different sessions because the IR and generated holders are qualified by session id.

Session-local references may be read and mutated only while compiling the matching SessionContext. Escaping a session-local reference into global rules or another session is rejected. Global shared scalar values may be read from a session as configuration/coordination inputs, but global shared mutation from SessionContext is rejected so a per-session rule cannot accidentally write the one global instance repeatedly.

Inside `session.forEachPlayer(...)`, session-local shared mutation is rejected because the callback can execute multiple times. Inside `session.forSinglePlayer(...)`, session-local mutation is allowed because exact cardinality guarantees at most one execution for that session in that tick.

Player-local state remains player-owned, exactly as in v14. If an administrator moves a player from one team/session to another during an active instance, its player-local values move with the player; session-local state remains with the compile-time session slot.

### Session-local Grid

`session.grid(...)` has the v13 Grid API (`fill`, `get`, `set`, `fillRect`) but owns a distinct scoreboard objective bank per session. Grid ids are unique only within a session. `get(...)` targets a state belonging to the same session.

V15 keeps the existing per-grid width/height/cell bounds and adds a bounded aggregate session-grid budget so the generated load path cannot silently scale to an unbounded number of initialization commands. Session Grids are logic-only in v15 and cannot be passed to the existing global `game.gridWorld(...)` projection API.

### Session-local RNG

`session.rng(...)` uses the same versioned deterministic LCG semantics as v13, but each session has a distinct RNG holder. Identical seeds in two sessions therefore produce identical streams until one session consumes additional values, after which the streams diverge independently. `rng.int(...)` targets a state belonging to the same session.

### Player execution and HUD

`session.forEachPlayer(callback)` and `session.forSinglePlayer(callback)` are shorthand for the session's bound team PlayerSet and may not target any other PlayerSet. Low-level v15 IR is validated with the same restriction.

A `player.hud(...)` declared inside a session PlayerContext may read matching session-local scalar state in addition to player-local/global readable values. The HUD audience remains the session's team. Session-local values cannot be used by global shared HUD/text/block/entity presentation in v15.

### IR representation

V15 adds a bounded top-level `sessions` declaration. Each session records:

- portable session id;
- one team PlayerSet reference;
- session-local initial scalar state;
- session-local Grid declarations;
- session-local RNG declarations.

The tick action tree adds a `for_session` node. Parsed actions and scalar references inside it are explicitly qualified with the session id so lowering never depends on implicit runtime ambient state.

### Lifecycle

All v15 sessions are compile-time slots in one generated datapack. `/reload` or pack replacement reinitializes every session's scalar/Grid/RNG state to its declared initial values, matching existing global lifecycle semantics. A team becoming empty does not delete or reset its session; non-player session rules continue to execute once per tick. Player iteration naturally executes zero times while no members are online.

`portable/cleanup` removes the session Grid objective bank together with the normal namespace-owned objectives/storage/entities/force-loads. External vanilla teams and memberships remain untouched.

### Deliberately deferred

V15 does not add:

- session-local `gridWorld` or private block/entity scene projection;
- automatic arena coordinate allocation or per-session ownership regions;
- session-local vanilla sidebars;
- session-local player state (player state remains identity-local);
- dynamic session creation/deletion or compiler-owned matchmaking;
- reductions across players or across sessions;
- persistent saves across `/reload`.

A later world-session decision can consume the v15 session id and logical state without changing its isolation semantics.

## Consequences

- Two teams can run the same logical game rules in one datapack without sharing score/topology/RNG state.
- Local declaration names can be identical across sessions, making reusable match logic practical without synthesizing names in game source.
- Vanilla teams remain the external membership authority; the compiler owns only generated session state.
- Independent world scenes are still not implied by logical session isolation.
- The generated objective/holder count grows with a compile-time bounded session declaration set and is deterministic.

## Acceptance gate

The v15 milestone is complete only when all of the following pass:

1. Node tests cover session/team uniqueness, scope-escape rejection, global-mutation rejection from SessionContext, same-local-name reuse across sessions, and v1-v14 compatibility.
2. Two real Minecraft 26.1 clients are assigned to distinct external teams and both session callbacks execute in the same generated pack.
3. Real input from one client changes only that session's local scalar state; the other session remains unchanged.
4. Each session has an independent Grid: writes/reads in one do not affect the same cell of the other session's same-named Grid.
5. Identically seeded session RNG streams start equal and become independently divergent when only one session consumes an additional sample.
6. Per-session `forSinglePlayer` still executes independently with both clients online globally, and a session HUD can render its own session-local state.
7. A team temporarily emptying does not erase/reset its session-local scalar/Grid/RNG state; rejoining resumes the retained active-instance state.
8. `/reload` deterministically resets all session-local state/Grid/RNG to declarations.
9. `portable/cleanup` removes all session Grid objectives and portable resources while leaving external teams/memberships intact.
10. All retained v1-v14 examples continue to compile deterministically.
