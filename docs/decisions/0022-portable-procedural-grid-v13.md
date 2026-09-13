# ADR 0022: Add bounded runtime grids and deterministic RNG in Portable IR v13

## Status

Accepted. The bounded grid/RNG/grid-world compiler core, singleton player scope, and the full procedural-roguelike reference milestone are implemented and accepted in portable v13.

## Context

The retired `topdown-roguelike` demonstrated a game class that the current portable scalar model cannot express cleanly. Its dungeon was generated at runtime from a 29 x 37 tile map, seeded randomness, room-placement attempts, corridor carving, and floor-to-floor regeneration. Collision and spawn logic consumed that generated topology before the same topology was projected into Minecraft terrain.

Portable v8 deliberately kept `worldBatch` / `worldFill` compile-time declared. That was correct for bounded static arenas, but it does not provide runtime indexed gameplay state. Re-encoding a 29 x 37 map as thousands of named scalar states would make the authoring model and generated IR substantially worse, while restoring arbitrary JavaScript arrays/callbacks at runtime would undo the portable architecture.

The old roguelike also used dynamic arrays for rooms, enemies, loot, BFS queues, and floating effects. Not all of those require a generic runtime collection primitive. Rooms, enemies, loot, labels, and actors can be represented as bounded compile-time slot pools using existing `game.repeat(...)`, scalar state, actor/text projection, and visibility conditions. The irreducible missing primitive is runtime indexed grid state plus deterministic random generation.

Minecraft 26.1 function macros provide a bounded vanilla lowering for dynamic grid indexes. A mod-free probe on `second` verified that an integer stored in command storage can be substituted into a scoreboard holder name (`g$(i)`) and used for both dynamic set and get. v13 can therefore keep grid cells in a normal scoreboard objective without one objective per cell or one entity per cell.

## Decision

Portable IR v13 adds three shared-game concepts:

1. **Grid** — a fixed-size 2D integer matrix whose dimensions are compile-time bounded but whose cells can be read and written at runtime through dynamic coordinates.
2. **RandomStream** — a deterministic bounded pseudo-random stream owned by the portable game instance.
3. **GridWorldProjection** — an incremental projection job that maps each grid cell to one Minecraft block in a fixed world footprint.

v13 does **not** restore arbitrary runtime JavaScript arrays or callbacks. It adds explicit bounded IR operations with deterministic vanilla lowering.

### Authoring surface

The intended DSL is:

```ts
const dungeon = game.grid("dungeon", {
  width: 29,
  height: 37,
  initial: 0,
  outside: 0,
});

const rng = game.rng("dungeon", { seed: 0x51f15eed });

const terrain = game.gridWorld("dungeon_world", {
  grid: dungeon,
  dimension: "minecraft:overworld",
  originX: -14,
  y: 100,
  originZ: -8,
  palette: [
    { value: 0, block: "minecraft:black_concrete" },
    { value: 1, block: "minecraft:deepslate_tiles" },
    { value: 2, block: "minecraft:lime_concrete" },
  ],
  cellsPerTick: 128,
});

const x = game.state("x", 1);
const z = game.state("z", 1);
const probe = game.state("probe", 0);
const randomX = game.state("randomX", 0);

game.tick(() => {
  rng.int(randomX, 1, 27);
  dungeon.get(x, z, probe);
  dungeon.set(x, z, 1);
  dungeon.fillRect({ x, z, width: 7, height: 5, value: 1 });
  terrain.rebuild();
  game.when(terrain.ready.eq(1), () => {
    // gameplay may begin
  });
});
```

The final implementation may use TypeScript interfaces/classes internally, but the public semantics and method names above are fixed for the first v13 implementation unless an implementation conflict is discovered before release.

### Singleton player input scope

v13 also adds `game.forSinglePlayer(players, player => ...)` for shared single-player games that use the v12 player-input vocabulary. It is a lexical `PlayerContext` like `forEachPlayer`, but it executes the callback **only when the supplied `PlayerSet` contains exactly one participant**. The first implementation accepts `game.players()` / `all_online`.

Unlike `forEachPlayer`, the singleton callback may mutate shared `game.state`, Grid, RandomStream, and GridWorldProjection state. This is deterministic because there is exactly one executor. With zero participants or more than one participant, the callback does not execute at all. It must not silently select an arbitrary first player.

The vanilla lowering explicitly counts the `PlayerSet`, stores that count in compiler scratch state, and only when the count equals one executes the callback as the sole participant. Player-local references retain the same lexical non-escape rules as v12, and nested player scopes remain rejected.

This scope is needed by games such as the procedural roguelike, whose dungeon/player position is shared game state but whose controls must come from vanilla per-player input. Multiplayer games continue to use `forEachPlayer` and its prohibition on shared mutation.

### Grid declaration and bounds

`game.grid(id, spec)` declares shared game-instance topology state.

The first v13 compiler supports:

- at most 4 grids per program;
- width and height each in `1..64`;
- at most 2,048 cells per grid;
- one signed fixed-point scalar value per cell;
- compile-time `initial` and `outside` values whose scaled representation must fit Minecraft's signed 32-bit scoreboard range.

Grid cell values use the same fixed-point representation as ordinary portable shared state. This lets a value returned by `grid.get(...)` participate in existing comparisons without a second numeric model.

Dynamic x/z/width/height operands are ordinary shared portable values and are interpreted as logical integer cell units. Lowering divides the fixed-point score by `fixedPoint` using Minecraft scoreboard integer division. Minecraft 26.1 rounds negative division toward negative infinity (`-1500 / 1000 -> -2`), so fractional negative coordinates follow that behavior. Grid-oriented game code should keep coordinate and extent operands integer-valued.

Grid operations are shared mutations. They are rejected from multi-player `forEachPlayer` contexts and permitted in the exact-cardinality `forSinglePlayer` context.

### Grid actions

The initial action vocabulary is:

- `grid.fill(value)` — set every cell to one value;
- `grid.get(x, z, targetState)` — read one cell into a shared mutable state;
- `grid.set(x, z, value)` — write one cell;
- `grid.fillRect({ x, z, width, height, value })` — write an axis-aligned runtime rectangle.

Bounds semantics are fixed:

- out-of-bounds `get` writes the grid's declared `outside` value;
- out-of-bounds `set` is a no-op;
- `fillRect` clips to the grid bounds;
- a rectangle with runtime width or height less than or equal to zero is a no-op.

`fill` and `fillRect` are synchronous bounded gameplay operations. They are intended for generation/setup phases rather than hot per-tick animation.

### Vanilla grid lowering

Each declared grid receives one namespace-stable scoreboard objective from a fixed four-slot bank. Cells are fake score holders `g0`, `g1`, ... in row-major order. Load/replacement removes the complete possible grid-objective bank, recreates the objectives used by the current program, and initializes all declared cells. Cleanup removes the complete bank, so grid rename/removal/resize cannot leave stale objectives or offline state behind.

Dynamic `get`/`set` calculates `index = z * width + x` in compiler scratch scores, stores that integer into namespace-owned command storage, then calls a generated Minecraft function macro whose holder is `g$(i)`. The macro storage is compiler-owned scratch state and is cleared on load/cleanup. It is not a public persistence API.

`fillRect` uses bounded generated row dispatch: the compiler first checks which declared grid rows intersect the runtime rectangle, then evaluates X bounds only inside those rows. This keeps large procedural-room generation below Minecraft command-chain limits without exposing raw commands. Dynamic single-cell `get`/`set` continue to use the indexed macro primitive. The compiler does not expose raw function macros or command strings to game code.

### Deterministic random streams

`game.rng(id, { seed })` declares a shared `RandomStream`. The first compiler supports at most 4 streams. `seed` is a compile-time signed 32-bit integer.

The initial methods are:

- `rng.int(targetState, min, max)` — advance the stream once and write an integer in the inclusive compile-time range `min..max` to a shared mutable state;
- `rng.reset()` — restore the stream to its declared seed.

`min` and `max` must be compile-time integers, `min <= max`, and every possible scaled result must fit the signed 32-bit scoreboard range. RNG actions are shared mutations. They are rejected from multi-player `forEachPlayer` contexts and permitted in `forSinglePlayer`.

The v13 random algorithm is part of the IR semantics so a seed is reproducible across generated packs. It uses a 32-bit linear congruential step with scoreboard wraparound:

```text
state = state * 1664525 + 1013904223   // signed 32-bit wrap
sample = floorMod(state, range)           // range is positive
result = min + sample
```

The result is then scaled by the program's `fixedPoint` before being written to ordinary portable state. `floorMod` is part of the versioned v13 semantics: Minecraft 26.1 scoreboard `%=` with a positive divisor already produces the required non-negative remainder (for example `-3 % 2 -> 1`), so the generated lowering uses that operation directly.

The first v13 API deliberately does not accept a runtime reseed value. A run that needs to restart from the canonical seed calls `reset()`; subsequent floors consume the same deterministic stream. Runtime-derived/forked seeds can be added later if a concrete game requires them.

### Incremental grid-to-world projection

`game.gridWorld(id, spec)` declares one fixed-footprint projection of a grid. The first compiler supports at most 4 grid-world projections. Each projection has:

- one source grid;
- one fixed dimension and integer `originX`, `y`, `originZ`;
- a palette of 1..8 compile-time `{ value, block }` entries;
- `cellsPerTick` in `1..256`.

The initial v13 projection maps exactly one Minecraft block per grid cell. A cell whose current value has no palette entry is left unchanged in Minecraft; portable games that require full footprint reconciliation must provide palette entries for every value they can project. Multi-layer wall templates, dynamic block-state strings, and arbitrary per-cell block-write lists are deferred.

`projection.rebuild()` is an authored action. It sets the generated projection cursor to zero, marks `projection.ready` false, and starts/restarts the job. After authored tick rules, the generated projection service processes at most `cellsPerTick` cells in row-major order. For each cell it reads the current grid score and writes the palette block at the corresponding fixed world coordinate. When the final cell is processed, the service marks `projection.ready` true.

`projection.ready` is a generated shared read-only comparable value. A rebuild requested during an active build restarts from cell zero. v13 does not snapshot the grid: cells are read when their projection slice runs. Authors that require coherent terrain should finish topology mutation before calling `rebuild()` and avoid mutating that grid until `ready == 1`.

Projection terrain is persistent Minecraft world geometry. `portable/cleanup` removes compiler objectives/storage/jobs but does not restore overwritten blocks, preserving ADR 0005/0016 ownership semantics.

### Tick ordering

For v13 programs, the generated tick order is:

1. v12 player initialization/input sampling when applicable;
2. authored action tree, including RNG/grid operations;
3. active `GridWorldProjection` slices;
4. ordinary actor/display/camera/effect/HUD projection.

An authored rule can observe `projection.ready` from the previous completed slice. If the final slice completes in the current tick, authored rules see `ready == 1` on the next tick.

### Procedural roguelike modeling

The v13 reference roguelike will not recreate generic mutable collections. Instead:

- one 29 x 37 `Grid` owns wall/floor/exit topology;
- one `RandomStream` drives runtime room placement;
- room records are a fixed slot pool declared with `game.repeat(...)` and scalar states;
- enemies and loot are fixed slot pools with scalar `active/x/z/hp/kind` fields and existing actor/text/block projection;
- room carving/corridors use `fillRect` / `set`;
- movement collision probes topology with `grid.get`;
- a `GridWorldProjection` rebuilds the fixed terrain footprint after each generated floor;
- floor descent mutates the same grid and rebuilds the same world footprint.

The first acceptance game may use bounded simple enemy movement rather than the retired runtime BFS. Generic queues, distance fields, and pathfinding are not required to prove runtime procedural topology.

## Non-goals

Portable v13 does not add:

- generic runtime arrays, maps, sets, records, iterators, or arbitrary loops;
- runtime-created actors/displays or unbounded entity collections;
- BFS/A*/generic pathfinding primitives;
- runtime-derived RNG stream creation or player-local RNG/grid state;
- arbitrary dynamic world coordinates outside a declared fixed grid footprint;
- multi-block/layer cell templates in grid-world projection;
- terrain rollback/snapshot on cleanup;
- persistent save data across datapack reload/replacement.

Those capabilities require separate evidence and design rather than being smuggled through a grid API.

## Acceptance gate

The v13 compiler core is independently acceptable once its bounded lowering, cleanup, deterministic seed behavior, and singleton cardinality/input path are covered by Node tests plus a focused Minecraft 26.1 smoke test. The initial core acceptance on `second` covered a generated 4 x 3 grid, macro-backed dynamic access, clipped rectangle fill, deterministic `/reload`, incremental projection, real-client singleton input, two-participant suppression, complete objective/force-load cleanup, and explicit terrain teardown.

The **full v13 milestone** acceptance criteria are:

1. a generated pack creates a dungeon topology at runtime after load, rather than embedding the final tile map at compile time;
2. the same declared RNG seed and same action sequence reproduce the same first-floor topology across `/reload`;
3. advancing to another floor consumes the RNG stream and produces a different valid topology;
4. room/corridor writes use runtime grid operations and remain within the declared 29 x 37 bounds;
5. player movement collision reads the generated grid rather than Minecraft blocks as the gameplay source of truth;
6. grid-world projection builds the fixed footprint incrementally and `ready` gates play until completion;
7. at least one bounded enemy/loot slot uses the generated topology and existing presentation primitives;
8. cleanup removes grid objectives, RNG/projection scratch state, generated entities, and force-loads while explicitly leaving projected terrain persistent;
9. all retained v1-v12 examples continue to compile deterministically.

The full gate passed on the mod-free Minecraft 26.1 `second` environment with `examples/portable-procedural-roguelike`. The 29 x 37 map was generated at runtime and projected incrementally; `/reload` reproduced the same first-floor RNG state and all six room coordinates. Advancing the same RNG stream produced a different second floor (`217 -> 224` projected floor cells), and a real `Camera2` D input moved the logical player from `(19,5)` to `(20,5)` even after the corresponding Minecraft block was replaced with black concrete, proving `grid.get` rather than projected terrain was authoritative. That move collected a topology-derived loot slot (`score 0 -> 1`); a second real-input setup entered an enemy slot (`score 1 -> 6`, enemy inactive), and stepping onto the generated exit advanced the game to floor 3 and completed another projection rebuild. The initial all-cell `fillRect` lowering hit Minecraft's 65,536-command execution limit; the final row-dispatch lowering completed repeated generation without recurrence. Final teardown ran `portable/cleanup`, removed all objectives and force-loads, removed owned/presentation entities, explicitly cleared the 1,073 projected blocks, deleted the datapack, and reloaded cleanly.

## Consequences

- The portable runtime gains one bounded indexed data structure without reopening arbitrary runtime JavaScript.
- Procedural dungeon topology can again be gameplay-authoritative and seed-reproducible on a vanilla server.
- Function macros become an internal compiler lowering technique, not a game-facing escape hatch.
- Fixed slot pools remain the preferred representation for bounded enemies/loot/rooms, keeping actor/presentation ownership static and cleanable.
- v13 solves procedural topology generation first; generic dynamic collections and pathfinding remain explicit future decisions.

This decision extends ADR 0005 and ADR 0016 and preserves their rule that generated topology is gameplay state while Minecraft terrain is a persistent projection of that state.
