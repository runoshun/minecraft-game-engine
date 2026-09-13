# ADR 0025: Add session-local GridWorld projection in Portable IR v16

## Status

Accepted and implemented. Portable v16 compiler support and the two-session GridWorld Minecraft 26.1 acceptance gate passed on the mod-free `second` environment.

## Context

Portable v15 isolates team-bound logical matches: each compile-time session has independent scalar state, Grid objectives, and deterministic RNG streams. World projection is still global, so two logical sessions cannot independently materialize their same-named runtime Grid into Minecraft terrain.

The next useful boundary is a bounded mapping from each session Grid to an explicit, non-overlapping world footprint. Automatic arena allocation, private client-visible scenes, per-session ownership regions, and dynamic matchmaking are separate lifecycle problems and are not required to make explicit session terrain deterministic.

Minecraft chunk availability is part of the projection lifecycle. The existing v10 ownership region already gives the generated pack a bounded force-loaded rectangle and a staged `#ready` barrier. V16 reuses that lifecycle instead of inventing asynchronous per-projection chunk loading.

## Decision

Portable IR v16 adds `session.gridWorld(...)`, a session-local variant of the v13 GridWorld projection. It projects a Grid owned by that same session into an explicitly declared fixed Minecraft block rectangle.

### Authoring API

```ts
portableDsl({
  ownership: { minX: 400, minZ: 0, maxX: 448, maxZ: 16 },
}, game => {
  const redPlayers = game.teamPlayers("red");

  game.tick(() => {
    game.session("red", redPlayers, session => {
      const map = session.grid("map", { width: 16, height: 16, initial: 0, outside: 0 });
      const terrain = session.gridWorld("terrain", {
        grid: map,
        dimension: "minecraft:overworld",
        originX: 404,
        y: 100,
        originZ: 4,
        palette: [
          { value: 0, block: "minecraft:black_concrete" },
          { value: 1, block: "minecraft:red_concrete" },
        ],
        cellsPerTick: 64,
      });

      game.when(terrain.ready.eq(1), () => {
        // Session-local logic may observe projection completion.
      });
    });
  });
});
```

`session.gridWorld(id, spec)`:

- requires portable v16;
- may be declared only while the matching SessionContext is active;
- requires `spec.grid` to be a Grid declared by that same session;
- uses the v13 palette semantics and one-block-per-cell fixed footprint;
- exposes `rebuild()` and read-only `ready` with the same fixed-point truth representation as global GridWorld;
- permits the same local GridWorld id in another session because generated ready/active/cursor holders are qualified by session slot.

### Ownership and footprint safety

Every v16 session GridWorld requires one top-level `vanilla.ownership` region. Its entire X/Z footprint must lie inside that region and its dimension must equal the ownership dimension.

This is intentional. The ownership region is the chunk-lifecycle authority: load force-loads the bounded region, staged initialization reaches `#ready=1`, and only then can portable tick logic and session projection services run. A session GridWorld therefore does not use transient `forceload add/remove` as a substitute for a loaded arena.

V16 still has one ownership rectangle for the whole generated program. It does not allocate one ownership region per session and does not choose coordinates automatically.

At compile time, if at least one of two GridWorlds is session-local, their block rectangles may not overlap at the same dimension and Y level. This check includes session-vs-session and session-vs-global projection. Existing global-vs-global behavior is unchanged for compatibility.

Distinct explicit footprints are world isolation, not visibility privacy. Any player can still see or enter any loaded footprint unless ordinary game rules prevent it.

### Scheduling and mutation

A session GridWorld has independent generated `ready`, `active`, and `cursor` state. After authored tick actions, every active session projection may advance one bounded `cellsPerTick` slice during that tick. One busy session projection therefore does not consume another session's projection budget.

The legacy global v13 GridWorld scheduler is unchanged. Global projections retain their existing shared per-tick scheduler behavior.

`rebuild()` mutates session-shared projection state. It is valid in the session root and in exact-cardinality `session.forSinglePlayer(...)`; it is rejected inside `session.forEachPlayer(...)` because that callback may execute more than once in a tick.

`ready` is a lexical session-local reference. It may be read only while compiling the matching SessionContext and cannot escape to global rules or another session.

### Bounds

V16 keeps v13 Grid and palette limits and adds bounded session-projection limits:

- at most 4 GridWorld projections per session;
- at most 16 session GridWorld projections across the generated program;
- at most 16,384 aggregate projected session cells;
- `cellsPerTick` remains bounded to 1..256.

The source session Grids remain subject to the independent v15 aggregate session-Grid budget.

### Lifecycle

`/reload` or generated-pack replacement resets session Grid values and GridWorld cursor/ready state, then staged ownership startup re-establishes the projection footprints deterministically.

`portable/cleanup` removes generated objective banks, Grid objectives, projection scratch state, command storage, and ownership force-loads. It does not restore projected blocks. Session GridWorld terrain is persistent world state exactly like global GridWorld terrain, so acceptance and operational teardown must explicitly clear or restore temporary footprints.

External vanilla teams and membership remain outside compiler ownership.

### Deliberately deferred

V16 does not add:

- automatic arena coordinate allocation;
- per-session ownership regions or dynamic chunk leasing;
- client-private/visibility-private scenes;
- session-local block/text/actor/camera/sidebar declarations beyond GridWorld terrain;
- dynamic session creation/deletion or compiler-owned matchmaking;
- session-local player state (player state remains identity-local);
- reductions across players/sessions;
- persistent saves across `/reload`.

## Consequences

- Two team-bound sessions can use the same local Grid and GridWorld declaration names and independently materialize them into distinct Minecraft terrain footprints.
- Chunk readiness remains a single bounded program-level responsibility through the existing ownership lifecycle.
- Source authors or a higher-level future arena allocator must choose non-overlapping coordinates; v16 validates rather than allocates them.
- Projection terrain remains deliberate persistent world mutation and must be torn down explicitly when temporary.
- V1-v15 semantics and the legacy global GridWorld scheduler remain unchanged.

## Acceptance gate

The v16 milestone is complete when all of the following pass:

1. Node tests cover same-local-name isolation, session-qualified readiness, scope-escape rejection, multi-player rebuild rejection, ownership requirement, footprint containment/overlap rejection, and deterministic v1-v15 compatibility.
2. The checked-in `examples/portable-session-grid-world` compiles as v16 with two same-named `map`/`terrain` session declarations inside one bounded ownership rectangle.
3. On mod-free Minecraft 26.1 `second`, staged ownership reaches `#ready=1`, both initial projections reach session-local `ready=1`, and both complete footprints contain the declared initial blocks.
4. Two real clients in distinct externally managed teams remain online simultaneously. Real input from client A mutates/rebuilds only session A's GridWorld and state; session B remains unchanged, then the inverse is proven for B.
5. `/reload` resets both session logical values and deterministically rebuilds both footprints while preserving external team membership.
6. `portable/cleanup` removes all generated objective/force-load state while preserving external teams, and explicit teardown clears the persistent temporary terrain.
7. The complete Node regression suite remains green.

## Acceptance result

The gate passed with the checked-in `examples/portable-session-grid-world` program and Node regression suite 19/19 green. The reference pack declared one ownership rectangle spanning x=400..448 / z=0..16 and two sessions bound to external teams `v16_red` / `v16_blue`, deliberately reusing local Grid `map` and GridWorld `terrain`. Red projected x=404..407 / z=4..7 / y=100 and blue projected x=436..439 / z=4..7 / y=100.

On mod-free Minecraft 26.1 `second`, staged startup reached `#ready=1`, eight ownership chunks were force-loaded, both session-qualified GridWorld ready holders and `readySeen` reached `1000`, and both complete 4 x 4 footprints initially contained 16 black-concrete blocks. With real clients `Camera` and `Camera2` simultaneously online, a real A/left input changed only red `hits` from `0 -> 1000` and rebuilt only the red footprint to 15 black + one red block at `(404,100,4)`; blue remained `hits=0` with 16 black blocks. A real D/right input then changed only blue `hits` to `1000` and rebuilt only the blue footprint to 15 black + one blue block at `(436,100,4)`, while red state remained unchanged.

`/reload` reset both `hits` values to `0`, restored both session ready values to `1000`, returned both footprints to 16 black blocks, and preserved both external team memberships. `portable/cleanup` removed every generated scoreboard objective and all eight ownership force-loaded chunks while the teams still retained `Camera` / `Camera2`. Explicit teardown then cleared all 32 persistent projected blocks, removed the two temporary teams, deleted the acceptance datapack, and reloaded with zero objectives, zero force-loaded chunks, and zero teams. This closes the v16 session GridWorld milestone without adding automatic arena allocation or private scene visibility.
