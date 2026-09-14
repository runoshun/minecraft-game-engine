# ADR 0029: Add bounded persistent Grid state in Portable IR v19

## Status

Accepted and implemented. Portable v19 compiler support, backward-output parity, and focused Minecraft 26.1 persistence lifecycle validation passed on the mod-free `second` environment.

## Context

Portable v18 adds persistent global/session scalar state, but a fixed bank of scalar declarations is not a practical representation for persistent maps, unlocked-tile state, inventories modeled as cells, campaign flags indexed by position, or other bounded structured game state. Encoding every cell as a separately named persistent scalar would make source code and generated scoreboard state scale with declaration count rather than with the intended collection abstraction.

Minecraft command storage can retain structured numeric data across datapack reload and generated-pack replacement, but exposing arbitrary storage paths or NBT directly through `portableDsl` would break the portable semantic boundary and couple game source to the vanilla backend. Persistent collection state therefore needs a bounded portable abstraction whose lowering may use command storage internally without making storage itself public API.

## Decision

Portable IR v19 adds bounded **global and session-scoped persistent Grids**. The public semantics intentionally mirror the existing v13/v15 Grid operations; persistence and schema lifecycle are the new concerns.

### Authoring API

```ts
const discovered = game.persistentGrid("discovered", {
  width: 32,
  height: 24,
  initial: 0,
  outside: 0,
  schema: 1,
  onSchemaMismatch: "reset",
});

game.session("party", party, session => {
  const stash = session.persistentGrid("stash", {
    width: 8,
    height: 8,
    initial: 0,
    outside: -1,
    schema: 1,
    onSchemaMismatch: "preserve",
  });
});
```

A persistent Grid exposes:

- `fill(value)`;
- `get(x, z, targetState)`;
- `set(x, z, value)`;
- `fillRect({ x, z, width, height, value })`.

Coordinates and values follow ordinary portable fixed-point/Grid semantics. Runtime coordinates are interpreted as integer cell units after fixed-point conversion. Out-of-bounds `get` returns the declared `outside` value, out-of-bounds `set` is a no-op, and `fillRect` clips to the declared bounds. `get` targets an ordinary global/session active-instance scalar rather than returning a first-class collection-cell reference.

Global persistent Grid mutation follows global shared-state mutation rules. Session persistent Grid mutation follows session-shared rules. Multi-player `forEachPlayer` may not mutate a persistent Grid; exact-cardinality `forSinglePlayer` may do so under the same deterministic exception used by ordinary Grid/RNG/shared state.

### Bounds

V19 permits:

- at most 8 persistent Grids in aggregate across global plus all sessions;
- width and height each in `1..64`;
- at most 2,048 cells per Grid;
- at most 16,384 persistent Grid cells in aggregate.

These are compiler validation bounds, not a promise that every maximum-sized Grid should be rewritten every tick. Authors should keep frequent dynamic writes small.

### Storage and identity

Persistent Grid cells are stored in namespace-owned Minecraft command storage, not in one scoreboard holder/objective per cell. Each declaration receives a stable storage key derived from its semantic identity (`global:<id>` or `session:<session>:<id>`); declaration order does not determine persistence identity. Hash collisions are compile-time errors.

The storage representation is compiler-private and currently contains a compound with the declared width, height, schema, and a fixed-length integer array of raw fixed-point cell values. Dynamic indexed `get`/`set` use Minecraft function macros internally to address one array element. The compiler uses its normal scoreboard scratch values only while evaluating coordinates/values and transferring a selected cell. Neither command storage paths nor raw NBT operations are exposed through Portable IR or `portableDsl`.

This choice avoids mirroring all persistent cells into scoreboard objectives while preserving the bounded Grid contract. It also leaves the backend free to change the physical representation in a future IR/backend revision as long as v19 semantics are preserved.

### Schema and shape behavior

`schema` defaults to `1`. `onSchemaMismatch` defaults to `"reset"` and may be `"reset"` or `"preserve"`.

- A newly introduced Grid initializes every cell from `initial`.
- If stored width or height differs from the declaration, the Grid is structurally incompatible and is reset to the current declared shape/default regardless of schema policy.
- With matching shape and `onSchemaMismatch: "reset"`, a schema mismatch resets every cell to `initial` and advances the stored schema.
- With matching shape and `onSchemaMismatch: "preserve"`, a schema mismatch preserves the existing cells and advances the stored schema.

V19 does not provide arbitrary migration callbacks or cell-by-cell structural migration. Shape changes are deliberately reset-only because preserving an array with a different coordinate layout has ambiguous semantics.

Renaming a persistent Grid creates a new semantic identity. Historical storage for declarations removed or renamed by a later build remains until explicit purge, matching v18's conservative persistence lifecycle.

### Lifecycle

The persistent lifecycle extends the v18 split:

- `portable/cleanup` removes active-instance resources but leaves persistent scalar and Grid data intact;
- `portable/reset_persistent` resets all currently declared persistent scalars and Grids to their current declaration defaults/schema;
- `portable/purge_persistent` destructively removes namespace persistent Grid storage and, when present, the v18 persistent scalar objective/initialization metadata.

Same-namespace generated-pack replacement should run ordinary cleanup first, replace the pack, then reload. The new build reconciles each currently declared persistent Grid by semantic identity, shape, schema, and policy.

### Scope exclusions

V19 does not add:

- arbitrary command-storage/NBT access;
- persistent RNG streams or generic persistent arrays/maps/sets/records;
- persistent player/offline-player identity state;
- persistent GridWorld projection directly from a persistent Grid;
- dynamic Grid dimensions;
- runtime-created persistent collections;
- migration callbacks or cross-namespace persistence.

Games can copy/probe persistent cells into ordinary state/Grid logic as needed. A direct persistent-Grid-to-world projection can be considered separately if retained games demonstrate that the explicit transfer pattern is inadequate.

## Consequences

- Persistent bounded map/collection state no longer requires one named persistent scalar per cell.
- Large persistent cell banks do not consume one scoreboard objective/holder per cell; command storage is a backend implementation detail.
- The public API remains backend-oriented around Grid semantics rather than Minecraft storage syntax.
- Persistent Grid access is more expensive than ordinary scoreboard-backed Grid access, so it is intended for durable state rather than high-frequency physics scratch data.
- Structural changes are deterministic but destructive for that Grid; authors must bump schemas and choose reset/preserve deliberately for same-shape semantic changes.
- V18 persistent scalars remain useful for counters, progression totals, and other small values; v19 does not deprecate them.

## Acceptance gate

1. Node tests cover global/session declarations, `fill/get/set/fillRect` lowering, version/scope/bounds, declaration collisions, stable storage identity, schema reset/preserve, shape reset, and cleanup/reset/purge generation.
2. Retained v1-v18 examples continue to compile deterministically.
3. A checked-in v19 example uses one global and one session persistent Grid on mod-free Minecraft 26.1 `second`.
4. Real client input mutates independently addressed cells and generated `get` reads return the expected fixed-point values including `outside` behavior.
5. `/reload`, ordinary cleanup/reload, and same-namespace same-schema replacement preserve cells.
6. A schema-changing same-shape replacement proves reset and preserve policies independently; a structural shape test is covered at least by generated-command regression and may be probed in Minecraft when useful.
7. `reset_persistent` restores current Grid defaults, `purge_persistent` removes persistent Grid storage, and final teardown leaves no generated objectives/teams/datapacks.

## Acceptance result

The gate passed with `examples/portable-persistent-grid` and the Node regression suite 28/28 green. Fourteen retained v1-v18 checked-in examples were compiled from both v19 and pre-v19 commit `d55cbbf`; their generated datapacks were byte-for-byte identical.

On mod-free Minecraft 26.1 `second`, external team `v19_party` contained real client `Camera`. Initial global Grid `world` contained twelve logical zero cells and session Grid `stash` contained four logical `5` cells. Real A/left input wrote `world[1,1]=7`; real D/right wrote `stash[0,0]=9`. The generated Grid reads exposed raw fixed-point scoreboard results `worldCell=7000`, `stashCell=9000`, and the out-of-bounds read remained `worldOutside=-1000`. Command storage contained exactly the matching cell arrays, proving the authored dynamic indexed operations rather than direct acceptance-side storage writes.

With the real client connected so the server was actively ticking, `/reload` preserved both cell arrays and reconstructed the same active read values while external team membership survived. Ordinary `portable/cleanup` removed all nine generated active-instance objectives and left persistent Grid storage plus `v19_party` intact. Replacing the generated pack under the same namespace with the same schema and reloading recreated active objectives and preserved `7000 / 9000` cells.

A same-shape schema-2 replacement changed defaults to global `world=100` with reset policy and session `stash=500` with preserve policy. Reload reset all twelve world cells to raw `100000`, preserved stash as `[9000,5000,5000,5000]`, and advanced both stored schemas to 2. `portable/reset_persistent` then restored world to twelve `100000` cells and stash to four `500000` cells; the next game tick read session state back as `500000`. Node regression separately covers structural shape mismatch, which always resets even under preserve policy.

Final ordinary cleanup again left persistent Grid storage and external team membership while removing all generated objectives. `portable/purge_persistent` reduced the namespace persistence storage to an empty compound, after which the acceptance datapack and external team were removed. Final server state had zero objectives, zero teams, empty v19 namespace storage, and only the built-in vanilla datapack enabled. An initial probe performed while the server had no connected players demonstrated that resource reload completion and observable load-tag effects can be separated by an idle/no-player server pause; the actual reload lifecycle assertions were therefore run with the real client connected and the server ticking.
