# Compiler and Datapack Operations

This document records the current operational workflow. Design/API semantics belong in `docs/architecture.md` and ADRs.

## Canonical artifact

For a portable game, the canonical deployment artifact is the directory emitted by the Node portable compiler. Generated packs belong under `build/` and are not committed.

The target may be a vanilla Minecraft 26.1 server. No runtime JAR, Fabric loader, Java, GraalVM, or Node.js is required on the target server.

## Toolchain

The validated compiler toolchain is Node.js 22. `.mise.toml` pins the repository version.

```bash
node --version
npm test
```

The repository intentionally has no Java/Gradle/Fabric build path.

## Compile a portable source

General form:

```bash
npm run compile:portable -- \
  --source <path/to/main.ts> \
  --namespace <namespace> \
  --output <generated-directory>
```

Examples:

```bash
npm run compile:portable -- \
  --source examples/portable-breakout-core/datapack/data/portable_breakout/mcgame/main.ts \
  --namespace portable_breakout \
  --output build/portable/portable_breakout

npm run compile:portable -- \
  --source examples/portable-pinball-core/datapack/data/portable_pinball/mcgame/main.ts \
  --namespace portable_pinball \
  --output build/portable/portable_pinball

npm run compile:portable -- \
  --source examples/jrpg-demo/datapack/data/jrpg_demo/mcgame/main.ts \
  --namespace jrpg_demo \
  --output build/portable/jrpg_demo
```

The output contains `.mcgame-portable-generated`. Re-running the compiler may replace a directory carrying that marker; it refuses to delete an unrelated non-empty directory.

## Compiler validation

Every compiler change must run:

```bash
npm test
```

For changes to lowering, also compile the affected representative examples. For changes involving Minecraft command syntax or behavior, run a focused mod-free Minecraft 26.1 acceptance pass rather than relying only on generated text.

Important real-client checks include:

- held input actually changes the intended scoreboard state;
- camera behavior is visually stable and does not mutate gamemode unexpectedly;
- text/actionbar/sidebar components render rather than merely parse;
- actor appearances and state-backed transforms match declarations;
- particles/sounds execute when their conditions become true;
- collision behavior is verified with known overlap and miss cases;
- ownership reload does not duplicate generated entities;
- cleanup removes generated objectives/entities/force-loads.

## Deploying with devcontainer-mcp and mc-mcp

For `mc-mcp` deployment from the development container, prefer file-sharing URL transfer rather than embedding base64 in a tool call:

1. compile the generated datapack under `build/`;
2. create a `tar.gz` whose archive root is the generated datapack contents;
3. publish/share that archive through the devcontainer file-sharing capability;
4. immediately pass the short-lived HTTPS URL to `mc-mcp` using its archive deployment path and replace the target pack directory;
5. compare the downloader-reported SHA-256 with the local archive hash when validating transfer;
6. reload and inspect datapack state.

Mint a fresh shared URL for every deployment; shared URLs are short-lived. Base64 is a fallback only when URL transfer is unavailable.

Replacing a pack directory that was previously disabled does not automatically enable it. If the generated pack is present but disabled, explicitly enable it and reload before diagnosing missing functions/objectives as compiler failures.

## Minecraft acceptance environment

Portable compiler/backend acceptance should use a **mod-free** Minecraft 26.1 environment. Existing project convention is to use `second` for generated-pack acceptance and avoid moving or repurposing `main` unless explicitly requested.

Keep a real client/player online for tests that depend on ticking or visual/player-input behavior.

## Ownership-region programs

For v10+ entity-heavy programs, declare a bounded `ownership` rectangle around generated entity projections.

Acceptance should verify:

- generated `#ready` reaches `1`;
- declared chunks remain force-loaded while active;
- namespace owner-entity count is stable across at least two `/reload` cycles;
- player gamemode/tags are not taken over by the generated camera;
- `portable/cleanup` returns owner entities, owned force-loads, and generated objectives to zero.

Before final deletion/replacement, run `<namespace>:portable/cleanup` when the pack is still enabled.

## World projection teardown

`worldBatch` / `worldFill` intentionally write persistent terrain. `portable/cleanup` does not restore blocks. Acceptance tests must explicitly restore or clear any temporary world footprint after cleanup.

The retained JRPG example, for example, requires explicit arena-footprint teardown after its generated resources are cleaned.

## Camera acceptance

For v10 `position_lock`, verify the selected non-spectator controller remains at the generated carrier, held input continues to update portable state, and no generated player tags/gamemode debt remains.

For v11 `mode: "spectate"`, place the acceptance controller in Spectator explicitly before the test. Verify it observes the generated shared carrier, held input still updates state, and generated tick/cleanup functions never issue `gamemode spectator` or `gamemode adventure`. Restore the controller's desired gamemode as explicit test teardown because gamemode is outside compiler ownership.

## Multiplayer v12

Use `examples/portable-multiplayer-core` as the focused v12 acceptance pack. Acceptance must use at least two simultaneous clients and verify:

- both participants are initialized before their first authored player rule;
- A/D or equivalent held input changes each participant's own `player.state` without changing the other participant's value;
- a held Jump increments the example's edge counter once until released, independently per participant;
- `player.hud(...)` renders each participant's own player-local values while shared values remain readable;
- one shared camera carrier applies to every eligible audience member (`position_lock` to non-spectators or `spectate` to spectators) without `limit=1`, player names/UUIDs, generated controller tags, or gamemode mutation;
- disconnect/reconnect during the same active game preserves player-local scoreboard entries;
- `/reload` resets player-local state for the new game instance;
- `portable/cleanup` removes the complete 32-slot player-state bank, all eight fixed player-input objectives, the initialization marker, and the 32-slot HUD scratch bank, including entries belonging to offline players.

The generated marker file records the concrete player-state/input objective mapping used by a build.

The first v12 acceptance completed on `second` with two simultaneous test participants and the real render client; all checks above passed, including offline cleanup. Breakout and Pinball were then regenerated and replayed as v1-v11 compatibility regressions.

For shared `spectate` camera acceptance, use two simultaneous real render clients rather than mineflayer participants. Select mc-mcp render client `1` (`Camera`) and `2` (`Camera2`) independently with `playtest_client`, place both in Spectator, and keep both connected at the same time. Verify both clients converge to the single generated camera carrier and remain there under attempted look/movement input. Then drive A/D (or equivalent) independently on each client and verify the corresponding player-local state changes without changing the other client. The generated pack must not add player tags or issue gamemode commands; cleanup must leave both externally-selected Spectator gamemodes unchanged while removing generated objectives and force-loads.

This two-real-client spectate acceptance passed on `second`: `Camera` and `Camera2` both observed the same carrier at `[240,100,0]`, A on client 1 changed only `Camera`'s meter to `-9000`, D on client 2 changed only `Camera2`'s meter to `8000`, and opposite mouse-look attempts on the two clients both returned to the carrier rotation `[180,15]`. Cleanup left both players in Spectator, with no generated player tags, no player-state objectives, and no force-loaded chunks. The v12 shared-spectate-camera multiplayer E2E gate is therefore closed.

## Procedural grid v13 acceptance

ADR 0022 defines the accepted v13 compiler core and procedural-roguelike milestone. Use a mod-free Minecraft 26.1 `second` environment for regressions.

For compiler-core changes, first use a small generated grid smoke pack to verify dynamic macro-backed `get`/`set`, clipped `fillRect`, deterministic RNG reset/reload behavior, incremental grid-world projection, `ready`, complete grid-objective cleanup, and no force-load debt. For large grids, also validate that `fillRect` row-dispatch lowering stays below Minecraft's command-chain limit during a complete procedural-generation tick.

The full-milestone reference acceptance must prove that the final dungeon topology is generated at runtime rather than embedded at compile time, that the same declared seed and action sequence reproduce the same first floor across `/reload`, and that advancing the RNG stream produces a different subsequent floor. Runtime `grid.get` must be the gameplay collision source of truth. This gate has passed; rerun it when grid/RNG/projection lowering changes.

For `game.forSinglePlayer`, validate cardinality explicitly: zero participants must not execute the callback, exactly one participant must execute it and may update shared state from that player's real input, and two simultaneous participants must suppress the callback rather than choosing either participant.

Grid-world projection must rebuild the fixed footprint in bounded `cellsPerTick` slices and keep gameplay gated until `projection.ready` becomes true. Cleanup must remove the complete grid-objective bank, RNG/projection scratch state, generated entities, and force-loads. As with v8 world projection, projected terrain is persistent and acceptance teardown must explicitly clear or restore the temporary test footprint after `portable/cleanup`.

Dynamic grid indexes use Minecraft 26.1 function macros internally. A `second` probe verified that a value stored as `i=42` can drive a macro scoreboard holder `g$(i)`, with both set and get resolving to `g42`. The v13 core smoke subsequently exercised the same lowering through generated `grid.get`/`grid.set`. Temporary probe resources must be removed after validation.

Do not assume JavaScript-style integer arithmetic when diagnosing grid/RNG lowering. Minecraft 26.1 scoreboard division rounds negative values toward negative infinity (`-1500 / 1000 -> -2`) and positive-divisor modulo is floor-mod (`-3 % 2 -> 1`). ADR 0022 makes those behaviors part of v13 coordinate conversion and RNG semantics.

The initial v13 core acceptance passed on `second` with a generated 4 x 3 grid. Dynamic grid access, clipped rectangle fill, out-of-bounds fallback, deterministic reload replay, three-slice terrain projection, fixed-point `ready`, and zero force-load debt all passed. With only real client `Camera2` online, real A input advanced a shared edge counter `0 -> 1000` through `forSinglePlayer`; after a second participant joined, the same real A input left the counter and singleton tick state at `0`. Final cleanup removed grid/player/main objectives, restored the 12 temporary projected blocks to air, and removed the smoke datapack.

The full 29 x 37 procedural-roguelike acceptance subsequently passed. `/reload` reproduced the first floor exactly at the RNG/room-coordinate level; the next consumed RNG state changed the topology and projected floor count (`217 -> 224`). For the collision proof, replace the Minecraft block under a known floor grid cell with black concrete while leaving the Grid unchanged, then use a real client input to enter it: the accepted run moved logical position `(19,5) -> (20,5)` and collected loot (`score 0 -> 1`) despite the black projected block. A second real input entered an enemy slot (`score 1 -> 6`), and a real step onto the generated exit advanced to floor 3. The initial large-grid run hit the 65,536-command limit; after `fillRect` was changed to row dispatch, repeated reload/generation completed without another limit event. Teardown ran `portable/cleanup`, verified zero objectives / zero force-loads / zero owned entities, explicitly cleared all 1,073 projected blocks, deleted the test pack, and reloaded without problems.

## Planned team PlayerSet v14 acceptance

ADR 0023 defines the planned v14 membership/audience acceptance. Use the mod-free Minecraft 26.1 `second` environment and two real clients. Create two external vanilla scoreboard teams and assign one real client to each before the generated pack is exercised; team creation and membership are test/session setup, not portable lifecycle.

The acceptance must prove team-filtered real input/state isolation, per-team exact-cardinality `forSinglePlayer`, disjoint player HUDs, and distinct team camera carriers. Also keep an unrelated online player outside the referenced teams for at least one check and verify it is not initialized/sampled as a participant. Cleanup must remove portable objectives, owned camera entities, and force-loads while leaving the external teams and their memberships unchanged; remove the temporary teams explicitly as test teardown after portable cleanup.
