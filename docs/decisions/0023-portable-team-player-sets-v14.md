# ADR 0023: Add external-team PlayerSets and partitioned player audiences in Portable IR v14

## Status

Accepted for implementation. The v14 milestone remains open until the compiler changes and the two-real-client Minecraft 26.1 acceptance gate in this ADR pass.

## Context

Portable v12 made player identity runtime-bound through `PlayerSet` and lexical `PlayerContext`, but its only PlayerSet is `game.players()`, whose stable meaning is all online players in the one shared game instance. This is sufficient for one multiplayer group, but it cannot express two independently selected participant groups in one generated pack without hard-coding player names/UUIDs or reintroducing persistent compiler-owned tags on players.

The next useful boundary is membership, not full session-local game state. Multiple simultaneous game instances would also require a design for session-local shared state, grids/RNG, world projection, scene ownership, reduction semantics, and possibly private presentation. Combining all of those with membership in one version would make lifecycle and determinism difficult to reason about.

Vanilla Minecraft already has a bounded externally managed membership primitive: scoreboard teams. A player belongs to at most one vanilla team, team membership is selectable with ordinary entity selectors, and the portable compiler does not need to persist its own player tags. This makes vanilla teams a suitable first explicit PlayerSet producer while preserving the v12 identity model.

## Decision

Portable IR v14 adds an explicit team-backed PlayerSet while keeping `game.players()` unchanged.

### Authoring API

`game.players()` keeps its v12 meaning: all online players.

v14 adds:

```ts
const red = game.teamPlayers("red");
const blue = game.teamPlayers("blue");
```

`teamPlayers(name)` denotes the online players who currently belong to the named vanilla scoreboard team. The compiler does not create the team, delete it, join players to it, or restore membership. Team lifecycle is an external server/session concern.

Team names are compile-time literals and are restricted to a selector-safe portable subset: 1..16 characters matching `[A-Za-z0-9_.-]+`. Arbitrary selector strings are still not part of the portable API.

### Portable IR representation

v12/v13 `"all_online"` PlayerSet references remain valid and unchanged. v14 additionally permits a structured team reference:

```ts
{ team: "red" }
```

The top-level v14 program records the bounded declared team set list so the compiler can validate references and determine the participant union. At most eight distinct team PlayerSets may be declared.

### Player execution

Both existing execution primitives accept either PlayerSet kind in v14:

```ts
game.forEachPlayer(red, player => { ... });
game.forSinglePlayer(blue, player => { ... });
```

`forEachPlayer(teamSet, ...)` lowers to `execute as @a[team=<name>]`.

`forSinglePlayer(teamSet, ...)` counts only that set and runs only when exactly one member of that set is online. Two online players in different team sets therefore do not suppress each other's single-player callback.

Player-local state remains attached to the real player, not to the team. If a player changes teams during one active game instance, its existing player-local values move with that player. `/reload`/replacement and cleanup retain the v12 objective-bank semantics.

Shared-state mutation remains rejected from multi-player `forEachPlayer`. `forSinglePlayer` retains the v13 exact-cardinality exception because it executes at most once for its declared PlayerSet in a tick.

### Participant initialization and input sampling

For v14 programs, player initialization and player-input sampling target the union of PlayerSets actually referenced by player execution, player HUDs, and cameras.

If `all_online` is referenced, the union collapses to `@a`. Otherwise the compiler emits one prelude path for each distinct team selector. Online players outside all referenced v14 team sets are not initialized or sampled merely because the datapack is active.

Joining a referenced team between ticks is equivalent to joining the game: missing player-local state is initialized and current input is sampled before the first authored rule for that player. Leaving a team stops further rules/presentation for that set but does not erase player-local objective entries; cleanup still removes the complete namespace-stable objective bank, including offline/former members.

### Player-local HUD audiences

`player.hud(...)` is associated with the PlayerSet of the enclosing player context. v14 allows up to eight player HUD declarations, subject to the existing total 32 player-HUD numeric scratch values.

Multiple player HUDs in one program must have disjoint team audiences. One `all_online` player HUD remains valid for compatibility, but it may not coexist with another player HUD because its audience overlaps every team set. Duplicate team audiences are rejected.

### Partitioned cameras

v14 raises the camera declaration bound from one to eight. Each camera still has shared coordinates, but its `audience` may be an all-online or team PlayerSet.

A single camera may continue to target all online participants as in v12. Multiple cameras require distinct team audiences; an all-online camera may not coexist with another camera, and duplicate team audiences are rejected. This gives a deterministic one-camera-per-player relationship because vanilla team membership itself is exclusive.

Camera mode still does not own gamemode. `position_lock` targets non-spectator members of that camera's PlayerSet; `spectate` targets spectator members. The compiler continues to own only the generated camera carriers.

### Lifecycle and ownership

v14 does not create or own scoreboard teams, player tags, names, UUIDs, or gamemode. `portable/cleanup` removes the normal player objective bank and generated camera carriers/ownership resources but leaves external teams and memberships untouched.

Current team members may have their portable actionbar cleared during cleanup. A player who already left the team is no longer selected; actionbar display is transient and is not treated as persistent lifecycle state.

### Deliberately deferred session state

A team-backed PlayerSet is a membership/audience boundary, not a complete independent game instance. v14 does **not** add:

- team/session-local shared scalar state;
- team/session-local grids, RNG streams, or grid-world projection;
- team-private world entities/blocks or distinct world ownership regions;
- team-local sidebars;
- implicit cross-player/team reductions;
- compiler-owned matchmaking or team assignment.

Those require a separate explicit session-state design. v14 establishes the membership primitive that such a design can consume later.

## Consequences

- Existing `game.players()` semantics do not change.
- Portable sources can partition player rules, local HUD, and cameras without fixed player identities or runtime-owned player tags.
- External vanilla team membership becomes an intentional deployment/session input, analogous to externally choosing Spectator for opt-in spectate cameras.
- Player-local state remains player-owned across team changes within one active instance.
- Multiple camera carriers become safe because v14 constrains multiple audiences to mutually exclusive team sets.
- Full simultaneous game-instance state remains a separate future milestone instead of being hidden inside PlayerSet filtering.

## Acceptance gate

The v14 milestone is complete only when all of the following pass:

1. Node tests cover team-name validation, bounded team-set declarations, v12/v13 compatibility, team selector lowering for `forEachPlayer` and `forSinglePlayer`, and rejection of overlapping multi-camera/multi-HUD audiences.
2. Two real Minecraft 26.1 clients are externally assigned to two different vanilla teams and remain free of compiler-owned player tags.
3. Each client's real input changes only state/rules addressed to its own team PlayerSet.
4. `forSinglePlayer` executes independently for each one-member team even while both clients are online globally.
5. Each client receives only its team's player HUD and is position-locked or spectating only its team's distinct camera carrier.
6. A player outside the referenced team sets is not initialized/sampled as a v14 participant.
7. Cleanup removes player objectives, generated camera/owner entities, and force-loads while leaving the external vanilla teams/memberships intact.
8. All retained v1-v13 examples continue to compile deterministically.
