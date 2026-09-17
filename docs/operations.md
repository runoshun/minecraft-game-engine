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
  --source examples/portable-pinball-cabinet/datapack/data/portable_pinball_cabinet/mcgame/main.ts \
  --namespace portable_pinball_cabinet \
  --output build/portable/portable_pinball_cabinet

npm run compile:portable -- \
  --source examples/jrpg-demo/datapack/data/jrpg_demo/mcgame/main.ts \
  --namespace jrpg_demo \
  --output build/portable/jrpg_demo
```

The output contains `.mcgame-portable-generated`. Re-running the compiler may replace a directory carrying that marker; it refuses to delete an unrelated non-empty directory.

### Local TypeScript modules

The `--source` file is the module-graph root. Static relative ES imports/re-exports are resolved automatically, so no bundling flag or additional deployment artifact is required. Supported examples are `./bricks`, `./bricks.ts`, and `./rules/combat`; a `../shared` import is allowed only when its real path still remains under the entry file's directory. Extensionless imports append `.ts`.

The source graph is limited to 64 modules and 1,000,000 bytes total. Node built-ins, npm/bare packages, JSON/JavaScript/CSS or other non-`.ts` files, dynamic `import()`, authored `require(...)`, TypeScript `import = require(...)`, cycles, and real-path/symlink escapes are rejected. The compiler itself reads the validated module graph, but evaluated game code receives no filesystem/package/network loader capability.

`examples/portable-breakout-core` is the reference modular source: `main.ts` imports `./bricks`, and compiling the same entry command includes that helper automatically.

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
6. reload and inspect datapack state for ordinary reloadable resources. If the generated pack adds/removes/changes v20+ dialog registry resources, restart the server/world after file replacement instead of relying on `/reload` to bootstrap those registry entries.

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

## Team PlayerSet v14 acceptance

ADR 0023 defines the accepted v14 membership/audience contract. Use the mod-free Minecraft 26.1 `second` environment and two real clients. Create external vanilla scoreboard teams before the generated pack is exercised and assign one real client to each. Team creation/membership are session setup, not portable lifecycle; never make the generated pack own those teams.

For regression acceptance, keep both team clients online simultaneously. Drive a real held input for one team and verify only that player's local state and that team's `forSinglePlayer` edge state change while the other team remains unchanged, then repeat in the opposite direction. Verify each client is held by its own team camera and renders only its team's actionbar. Add an unrelated online player outside all referenced team sets and confirm that the namespace player-init and sampled-input objectives have no score for that player. Check that real players have no compiler-owned player tags.

The accepted reference run used `Camera` in `v14_red` and `Camera2` in `v14_blue`. Camera A produced meter `0 -> -14000` and `redHits 0 -> 1000` while blue stayed zero; Camera2 D then produced meter `0 -> 13000` and `blueHits 0 -> 1000` while red stayed unchanged. The two camera carriers resolved to `[248,140,8]` and `[280,140,8]`, and captures showed `RED METER -14 HIT 1` / `BLUE METER 13 HIT 1`. With both real clients online, `Test_v14out` had no init, left-input, or right-input score.

Cleanup must be tested before external-team teardown: the accepted run changed ownership force-loads from eight chunks to zero, removed every portable objective and owner/camera entity, while `team list v14_red` / `v14_blue` still reported their original members. Only after that assertion should test teardown remove the temporary teams, delete the datapack, and reload.


## Session-local v15 acceptance

ADR 0024 defines the accepted v15 logical-session gate. Use the mod-free Minecraft 26.1 `second` environment with two real clients assigned externally to two different vanilla teams. The generated acceptance pack must declare two compile-time sessions that intentionally reuse the same local scalar/Grid/RNG names so objective/holder qualification is exercised rather than hidden by source-level renaming. The checked-in reference is `examples/portable-session-local`.

Keep both real clients online for the isolation proof. A real input in session A must change only A's session scalar state, same-named Grid cell, and exact-cardinality session rule; session B must remain unchanged. Then drive B and prove the inverse. Initialize both session RNGs with the same seed, prove their first sample matches, consume an extra sample only in A, and verify B remains on its own deterministic stream. A per-session player HUD should render session-local scalar state so the read path is exercised by a real client.

The accepted reference run used `Camera` in `v15_red` and `Camera2` in `v15_blue`. Both RNG streams began at state `1879724910` with sample `31000`. Camera A changed only red `score`, `cell`, and `map[0,0]` from `0 -> 1000` and advanced only red RNG to `804324341` / sample `30000`; Camera2 D then produced the same transition in blue while red stayed unchanged. Captures showed `RED S 1 C 1 R 30` and `BLUE S 1 C 1 R 30`.

For lifecycle, temporarily empty one external team and verify its scalar/Grid/RNG values remain present and unchanged. In the accepted run, empty red retained `score=1000`, Grid `1000`, sample `30000`, and RNG `804324341`; after rejoining, the next A resumed at `score/Grid=2000` and RNG `372032720` while blue remained unchanged. `/reload` reset both sessions to declared scalar/Grid values, reproduced sample `31000` / RNG `1879724910`, and did not alter team membership.

Run `portable/cleanup` before external-team teardown. The accepted run removed all objectives, changed eight ownership force-loaded chunks to zero, and removed owner/camera entities while both external teams still retained their members. Only after that assertion were the temporary teams and acceptance datapack removed. Rerun this gate whenever session qualification, Grid/RNG lowering, PlayerSet cardinality, player HUD lowering, reload, or cleanup semantics change.

## Session GridWorld v16 acceptance

ADR 0025 defines the accepted v16 session-terrain boundary. Use `examples/portable-session-grid-world` on the mod-free Minecraft 26.1 `second` environment with two real clients assigned externally to `v16_red` and `v16_blue`. The example deliberately reuses local Grid `map` and GridWorld `terrain` in both sessions, but places them at separate explicit coordinates.

A v16 session GridWorld requires one shared `ownership` rectangle covering every session projection footprint. Treat ownership startup as part of the acceptance contract: verify `#ready=1` before interpreting projection state, verify the expected ownership chunks are force-loaded while active, and then verify both session-local `terrain.ready` values reach portable true (`1000` with the reference fixed point). Initial projected blocks must be present across each complete footprint before real input is tested.

Keep both real clients online simultaneously. Drive A/left on the red client and prove only red session state/Grid/terrain changes; blue must remain unchanged. Then drive D/right on blue and prove the inverse. Check both the session-qualified scoreboard values and the actual block footprints. A busy projection in one session must not prevent the other session from completing its own slice budget.

Run `/reload` with both external teams still configured. Both session logical states must reset to declarations, both terrain footprints must deterministically return to their initial palette state, both readiness values must return to true after staged startup, and team membership must remain unchanged.

For teardown, run `portable/cleanup` before deleting the generated pack or external teams. Verify the generated objective banks and ownership force-loads are gone while `v16_red` / `v16_blue` still retain their members. GridWorld blocks are persistent terrain, so explicitly clear or restore both temporary footprints after cleanup; if the chunks have already unloaded, temporarily force-load only the teardown area, restore it, and remove that temporary force-load. Remove the external teams and acceptance datapack only after those ownership assertions.

The accepted reference run used `Camera` in `v16_red` and `Camera2` in `v16_blue`. Staged startup reached `#ready=1`, both session GridWorld ready values and `readySeen` reached `1000`, eight ownership chunks were force-loaded, and both 4 x 4 footprints initially contained 16 black-concrete blocks. Real A input changed only red `hits` from `0 -> 1000` and red terrain to 15 black + one red block at `(404,100,4)` while blue remained 16 black / `hits=0`; real D then changed only blue `hits` to `1000` and blue terrain to 15 black + one blue block at `(436,100,4)` while red stayed unchanged.

A subsequent `/reload` reset both `hits` values to `0`, returned both footprints to 16 black blocks, restored both session readiness values to `1000`, and preserved both external team memberships. Final `portable/cleanup` removed every scoreboard objective and all eight ownership force-loaded chunks while the teams still retained `Camera` / `Camera2`. Teardown then cleared all 32 persistent test blocks, removed both temporary teams, deleted the acceptance datapack, and reloaded with zero objectives, zero force-loaded chunks, and zero teams. The Node regression suite was 19/19 green.

## Player/session reductions v17 acceptance

ADR 0027 defines the v17 reduction contract. Use `examples/portable-player-reductions` on the mod-free Minecraft 26.1 `second` environment with two simultaneous real clients in one externally managed team (`v17_party` in the checked-in example). The generated pack must not create or remove that team.

Validate the empty set first or after temporarily removing every member: `count=0`, `sum=0`, `any=0`, and `all=1` in logical units, while `min` / `max` equal their explicit authored empty value. Then keep both real clients online and prove independent player-local inputs feed the aggregate correctly. The accepted reference run initialized both scores to zero (`count=2`, `sum=0`, `min=0`, `max=0`), used Camera A/left to produce scores `1/0`, then Camera2 D/right to produce `1/2`, yielding `sum=3`, `min=1`, and `max=2`.

For boolean aggregation, set only one participant ready and verify `any=1` / `all=0`; set both ready and verify `any=1` / `all=1`. Remove both players from the team without cleaning up the pack and verify the aggregate returns to the empty values while their identity-local `player.state` entries remain intact. Rejoin them and verify the previous aggregate is reconstructed from those retained player values.

Run `/reload` while the external team still exists. Player-local active-instance state must reset through the normal v12 objective-bank lifecycle, external membership must survive, and the reductions must recompute from the reset players. In the accepted run the post-reload aggregate was `count=2`, `sum=0`, `min=0`, `max=0`, `any=0`, `all=0`.

For teardown, run `portable_reductions:portable/cleanup` before removing the team or datapack. Verify all generated objectives are gone while the external team still reports both members. Only then remove the temporary team, delete the acceptance pack, and reload. No terrain teardown is required because v17 reductions introduce no world mutation. The accepted run finished with zero objectives and zero teams.

## Persistent scalar v18 acceptance and lifecycle

ADR 0028 defines v18 persistence. Use `examples/portable-persistent-state` on mod-free Minecraft 26.1 `second` for focused validation.

Persistent lifecycle differs deliberately from ordinary generated resources:

- `portable/cleanup` must leave the namespace persistent objective and metadata marker intact;
- same-namespace generated-pack replacement should run ordinary cleanup first, replace the pack, then reload/load without purging persistence;
- `portable/reset_persistent` restores current declaration defaults/schema markers but keeps persistence infrastructure;
- `portable/purge_persistent` is destructive teardown and removes the persistent objective plus initialization marker; run it only when persistence should be discarded.

Acceptance must mutate at least one global and one session persistent scalar through real client input, verify values survive `/reload` and normal cleanup/reload, then replace the pack under the same namespace and prove same-schema values survive. Build a schema-changing replacement to prove both `onSchemaMismatch: "reset"` and `"preserve"`. Finally verify `reset_persistent`, destructive purge, and complete test teardown. Player/offline persistence is not part of v18 and must not be inferred from this gate.

The accepted reference run used real client `Camera` in `v18_party`. Starting values `campaign=10`, `legacy=5`, `wins=3` became `11 / 15 / 4` after real A and D inputs. `/reload`, normal cleanup, and same-schema replacement all preserved those values. A schema-2 replacement with defaults `100 / 500 / 200` yielded `100 / 15 / 200`, proving reset/preserve/reset behavior. `reset_persistent` then yielded `100 / 500 / 200`. Cleanup left only the persistent objective while the team still retained Camera; purge removed persistence, and final teardown left zero objectives and zero teams. The Node suite was 25/25 green and retained v1-v17 output parity against `a262bf1` was byte-identical.
## Persistent Grid v19 acceptance and lifecycle

ADR 0029 defines v19 persistent Grid semantics. Use `examples/portable-persistent-grid` on mod-free Minecraft 26.1 `second` for focused validation. The checked-in pack uses global reset-policy Grid `world` and session preserve-policy Grid `stash`, with externally managed team `v19_party`.

Persistent Grid lifecycle extends v18 rather than replacing it:

- cells are namespace-owned command-storage data; do not inspect or mutate those paths as a game-authoring API; direct `data` commands are acceptance/debug evidence only;
- `portable/cleanup` removes active-instance scoreboard/player resources while preserving persistent Grid storage;
- same-namespace replacement must run ordinary cleanup before replacing generated files, then reload/load with the real client/server ticking;
- `portable/reset_persistent` restores current scalar and Grid declaration defaults/schema;
- `portable/purge_persistent` is destructive and removes the namespace persistent Grid root plus scalar persistence infrastructure when present.

Acceptance must verify command-storage dynamic indexing through authored Grid operations rather than by writing storage directly: real A/left writes global `world[1,1]=7`, real D/right writes session `stash[0,0]=9`, and authored `get` values must report those values while an out-of-bounds global read remains `-1`. Verify persistence through `/reload`, ordinary cleanup/reload, and same-namespace same-schema replacement. Then install a same-shape schema-changing build: reset-policy `world` must reinitialize to its new default while preserve-policy `stash` retains its existing cells and advances schema. Node regression additionally covers the structural rule that width/height changes always reset regardless of preserve policy.

When using `second`, keep a real client connected while interpreting automatic load/tick behavior. An empty dedicated server may be in its configured no-player pause state; resource reload can complete while tick-triggered load behavior is not yet observable. For deterministic acceptance, connect the client/team first or explicitly distinguish resource reload from the subsequent load-tag tick.

For teardown, first prove ordinary cleanup leaves persistent storage and external team membership intact. Then run `purge_persistent`, remove the temporary datapack and `v19_party`, reload, and verify no generated objectives/teams/persistent v19 storage remain.

The accepted reference run used real client `Camera` in `v19_party`. Real A/left produced raw `world[1,1]=7000`; real D/right produced raw `stash[0,0]=9000`; authored reads returned `7000 / 9000`, with the out-of-bounds value `-1000`. `/reload`, cleanup/reload, and same-schema replacement preserved both arrays. Cleanup removed all nine active-instance objectives while storage and team membership remained. A schema-2 replacement with defaults `world=100` reset and `stash=500` preserve yielded world cells all `100000` and stash `[9000,5000,5000,5000]`; `reset_persistent` then yielded world all `100000` and stash all `500000`. Purge reduced namespace persistence storage to `{}`. Final teardown left zero objectives, zero teams, empty v19 storage, and only vanilla enabled. The Node suite was 28/28 green, and 14 retained v1-v18 generated examples were byte-identical to pre-v19 commit `d55cbbf`.

## Interactive selection UI v20 acceptance and registry lifecycle

ADR 0030 defines v20 selection semantics. Use `examples/portable-selection-ui` on mod-free Minecraft 26.1 `second` with real client `Camera` in externally managed team `v20_party`.

V20 adds a deployment caveat that does not apply to ordinary function/predicate-only packs: generated dialogs are entries in the `minecraft:dialog` registry. If a pack with new/changed/removed generated dialog resources is copied into an already-running world, `/reload` alone is not the deterministic registry bootstrap. The accepted run intentionally tried that and function parsing failed because `portable_selection_ui:portable/selection/shop` was absent from the current registry. Place the pack first, then restart the server/world. For replacement/removal, run the old pack's `portable/cleanup`, replace/remove files, and restart. Once the registry entry set has been bootstrapped at server startup, ordinary `/reload` remains a valid active-instance lifecycle test and succeeded in the accepted run.

Acceptance steps are:

- verify the generated `data/<namespace>/dialog/portable/selection/*.json` resource exists and the complete compiler-owned trigger bank is deterministic;
- connect the real client/team and confirm the native dialog renders, rather than accepting command parse as sufficient evidence;
- keep an authored level-triggered `choice.open()` active for multiple ticks and confirm the pending score remains raw `0` and the UI remains actionable;
- use one real-client sequence to reopen with Jump and choose an option with the native dialog mouse/button path; verify the declared fixed-point result reaches authored player-local state and the selection rearms;
- use another real-client sequence to reopen and press Escape; verify the cancel result reaches authored state;
- run `/reload` after registry bootstrap and verify player/selection active-instance state resets while external team membership survives;
- run `portable/cleanup` while a selection is pending and verify the dialog closes, the complete selection objective bank is removed, and the external team remains.

The accepted reference run rendered `Portable Shop` with Potion=`1`, Sword=`2`, and Cancel=`-1`. Real Jump followed by a Potion mouse click produced `lastChoice=1000`, `menuEnabled=0`, and the idle selection sentinel. A second real Jump followed by Escape produced `lastChoice=-1000`. After `/reload`, `lastChoice=0`, `menuEnabled=1000`, and the selection reached pending raw `0`; the team still contained Camera. Cleanup removed every generated objective and left that team intact. Teardown removed the team and pack and restarted the server, leaving zero objectives, zero teams, and only vanilla enabled. The Node suite was 31/31 green, and 15 retained v1-v19 generated examples were byte-identical to pre-v20 commit `a2d324c`.

## Rich/typed native dialog UI v21 acceptance

ADR 0031 defines v21 rich text/body, confirmation, and typed single-input form semantics. Use `examples/portable-dialog-ui` on mod-free Minecraft 26.1 `second` with real client `Camera` in externally managed team `v21_party`. The v20 registry lifecycle applies unchanged: new/changed/removed generated dialog resources require cleanup where applicable, file replacement/removal, then server/world restart; ordinary `/reload` is valid after the registry contents were bootstrapped at startup.

Acceptance must verify:

- generated confirmation/form dialog JSON loads cleanly after restart, including bounded rich text and `minecraft:item` body presentation;
- a confirmation action reaches the authored player-local fixed-point result;
- boolean, single-option, and integer-range forms submit through compiler-owned `trigger` transports and copy expected authored fixed-point values into player-local state; Node coverage must include logical zero as a valid boolean result;
- form cancel resolves the declared cancel result and rearms the transport;
- level-triggered `open()` leaves an already-pending surface stable, while opening a different generated selection/form rearms the previous pending surface before replacing the visible dialog;
- `/reload` resets all v21 active-instance player/result/transport state while preserving external team membership;
- `portable/cleanup` while a generated dialog is pending closes the surface, removes the complete selection/form objective banks, and preserves the external team.

The accepted reference run rendered the styled `Arcane Purchase` confirmation with mixed-color text, a diamond-sword item body and tooltip, and authored `Buy`/`Leave` actions. The confirmation `Leave` path reached logical `-10`. Real-client form submits produced boolean `1`, option `Mage=3`, and range `3`; option/range cancel paths also produced logical `-1`. Pending form transports remained at the pending sentinel under repeated authored `open()`. Replacing pending `hints` with `role` rearmed the old transport to idle and left only the new form pending. `/reload` reset stage/results/transports and preserved `v21_party`; cleanup from a pending confirmation left zero generated objectives while retaining Camera in that team. Final teardown removed the team and pack, restarted the server to remove registry entries, and finished with zero objectives, zero teams, only vanilla enabled, and the pre-existing disabled video packs still available. The Node suite was 35/35 green, and 16 retained v1-v20 examples were byte-for-byte identical to pre-v21 commit `b000162`.

## Expanded mannequin actor presentation v22 acceptance

ADR 0032 defines Portable v22 actor presentation. Use `examples/portable-actor-presentation` on mod-free Minecraft 26.1 `second` with exactly one real client online. Unlike v20/v21 dialog resources, v22 actor presentation adds only ordinary function/entity state, so a generated pack can be installed and exercised with `/reload`; a restart is not required unless the same change independently modifies dialog registry resources.

Compile and archive the acceptance pack with:

```bash
npm run compile:portable -- \
  --source examples/portable-actor-presentation/datapack/data/portable_actor_v22/mcgame/main.ts \
  --namespace portable_actor_v22 \
  --output build/portable/portable_actor_v22

tar -C build/portable/portable_actor_v22 -czf build/portable_actor_v22.tar.gz .
sha256sum build/portable_actor_v22.tar.gz
```

Deploy the archive with the normal devcontainer `publish_file` -> `mc-mcp.write_datapack_files` transfer. Keep a real client online before or immediately after `/reload` so the vanilla server is not paused for an empty world; the owned-init stage is scheduled two ticks after load.

Acceptance must verify:

- the generated marker reports `portable_version=22`, and extended actor spawn functions contain the bounded authored `profile`, `hidden_layers`, `pose`, `main_hand`, `equipment`, `immovable`, and pitch rotation fields;
- the real client renders the built-in Alex/Steve profiles, authored static equipment/poses, and the zombie-intent mob-head fallback without any client mod;
- with exactly one player online, A/D changes shared `heroYaw` through `forSinglePlayer`, Space/Shift changes shared `heroPitch`, and the owned hero mannequin's `Rotation[0]` / `Rotation[1]` follows the same fixed-point values;
- ordinary `/reload` returns yaw/pitch to authored initial values and recreates exactly one owned actor per declaration with its appearance/equipment intact;
- retained v1-v21 checked-in examples are byte-for-byte identical to pre-v22 commit `c7d3cc9`;
- `portable/cleanup` removes all generated objectives, owned entities, scheduled owned-init work, and ownership force-loads before deleting the acceptance pack.

The accepted reference run rendered the three authored characters described above. Real A input changed yaw raw `180000 -> 204000` and entity yaw to `204.0f`; Space produced pitch raw `-20000` / entity `-20.0f`, and Shift produced raw `15000` / entity `15.0f`. `/reload` restored yaw/pitch to `180000/0`, preserved exactly three owned mannequins, and restored authored profile/equipment. Cleanup removed all objectives/entities and reduced nine ownership force-loaded chunks to zero. Final pack deletion plus `/reload` left only vanilla enabled, with the pre-existing video packs still disabled/available. Node was 39/39 green and all 17 retained v1-v21 example outputs matched pre-v22 `c7d3cc9` byte-for-byte.

The accepted reference result is also recorded in ADR 0032 and `docs/architecture.md`; update all three records if the acceptance scenario or compiler ownership semantics change.

## World interaction/use v23 acceptance

ADR 0034 defines Portable v23 bounded world right-click input. Use `examples/portable-interaction` on mod-free Minecraft 26.1 `second` with one real client. v23 adds only ordinary entity/function state, so install/replacement uses `/reload`; a server restart is not required unless another capability in the same pack changes registry resources.

Compile the acceptance pack with:

```bash
npm run compile:portable -- \
  --source examples/portable-interaction/datapack/data/portable_interaction/mcgame/main.ts \
  --namespace portable_interaction \
  --output build/portable/portable_interaction
```

The generated marker must report `portable_version=23`. The reference pack declares one interaction-backed cabinet at the acceptance coordinates and increments both shared `totalUses` and player-local `cabinetUses` from `cabinet.onUse(player => ...)`.

Acceptance must verify:

- owned initialization creates exactly one `minecraft:interaction` with the compiler owner tag plus stable declaration tag and the authored width/height/response values;
- a real-client right click, not a directly invoked callback function, increments both the shared and clicking-player local state exactly once;
- after the callback runs, the entity has no `interaction` compound, and waiting without another click does not replay the event;
- a second distinct real right click increments both states a second time;
- `/reload` resets active-instance state, recreates exactly one interaction entity, and has no stale interaction event;
- all pre-existing retained examples remain byte-for-byte identical to parent compiler commit `ed4673e`;
- `portable/cleanup` removes objectives, interaction/Display entities, scheduled initialization, and owned force-loads before pack deletion.

The accepted reference run used real client `Camera`. Starting from raw shared/player-local values `0/0`, one physical right click produced `1000/1000`; the generated event-consumption command left no `interaction` compound. A second distinct click produced `2000/2000`. Ordinary `/reload` returned both values to `0`, recreated exactly one interaction entity, and left no pending record. Cleanup removed every objective/entity and reduced four ownership force-loaded chunks to zero. The acceptance pack and temporary floor were removed; the final world had no objectives or force-loads, only vanilla enabled, and the pre-existing `video_breakout` / `video_pinball` packs still disabled/available. Node regression was 50/50 green and all 18 pre-existing retained example outputs matched `ed4673e` byte-for-byte.

## Interaction controller v24 acceptance

ADR 0035 defines Portable v24 active-instance controller binding on top of v23 world interactions. Use `examples/portable-interaction-controller` on mod-free Minecraft 26.1 `second` with both real clients `Camera` and `Camera2`. V24 adds only ordinary scoreboard/function state, so no server restart is required. `/reload` is deliberately the controller reset boundary.

Compile the acceptance pack with:

```bash
npm run compile:portable -- \
  --source examples/portable-interaction-controller/datapack/data/portable_interaction_controller/mcgame/main.ts \
  --namespace portable_interaction_controller \
  --output build/portable/portable_interaction_controller
```

The generated marker must report `portable_version=24` and one `interaction.cabinet.controller=...;generation=...` mapping. The reference source calls `cabinet.controller.claim(player)` from the matching `cabinet.onUse(...)` callback, then uses `cabinet.controller.forPlayer(...)` for later player-local tick/input work.

Acceptance must verify:

- real client A right-clicks to claim generation `1`; A's controller callback advances while B's does not;
- B's real Space/Jump input does not run controller actions while A owns the cabinet, while A's input does;
- B right-clicks to reclaim; generation advances, A retains a stale old token, B receives the current token, and only B's later input executes controller actions;
- disconnecting and reconnecting the current controller without an intervening claim resumes controller execution in the same active instance;
- if the controller disconnects and another player claims before reconnect, the offline old token stays stale after reconnect and does not execute controller actions;
- `/reload` recreates the controller objective bank, resets generation to zero, clears online/offline controller scores, resets active-instance player state, and recreates exactly one interaction entity;
- generated claim lowering guards signed-32-bit generation exhaustion by clearing/recreating that interaction's controller objective before token reuse;
- all pre-existing retained v1-v23 examples are byte-for-byte identical to parent compiler commit `8af93f4`;
- `portable/cleanup` removes controller objectives plus ordinary generated objectives/entities/force-loads before deleting the pack.

The accepted reference run used Camera then Camera2. Camera claimed generation `1`; Camera2's Space did nothing, while Camera's Space changed shared raw `controlUses` from `0 -> 3000` and Camera-local `personalUses` to `3000`. Camera2 reclaimed generation `2`, leaving Camera token `1` and assigning Camera2 token `2`; Camera's controller tick counter stopped while Camera2's advanced. Camera's subsequent Space left `controlUses=3000`; Camera2's Space advanced it to `9000` and Camera2-local `personalUses` to `6000`.

Camera2 was disconnected and reconnected without another claim; token `2` remained current and its controller tick counter resumed. Camera2 was then disconnected again, Camera claimed generation `3`, and Camera2 remained offline with stale token `2`. After reconnect, Camera2's controller tick counter remained exactly raw `1209000` while Camera's continued advancing, proving stale offline ownership does not resurrect.

Ordinary `/reload` reset `claims`, `controlUses`, and generation to `0`, removed both players' controller scores entirely, reset both controller tick states to `0`, and recreated one interaction entity. The final signed-32-bit wrap path was then tested by forcing generation to `2147483647`, seeding `StaleController` with that same token, and issuing a real cabinet click. The click recreated the controller objective, returned generation and Camera2's token to `1`, and left `StaleController` with no score. Cleanup removed every objective/entity and all owned force-loads. The acceptance pack and temporary floor were removed and `/reload` left zero objectives, zero force-loaded chunks, only vanilla enabled, with the pre-existing `video_breakout` and `video_pinball` packs still disabled/available. Node regression was 54/54 green and all 19 pre-existing retained example outputs matched `8af93f4` byte-for-byte.

Controller state is not persistent. For ordinary v24-to-v24 changes, `/reload` is sufficient and intentionally releases every controller. If an installed v24 namespace is being replaced by source that no longer uses controller binding and therefore compiles back to v23 or earlier, run the installed v24 `portable/cleanup` **before** replacing/reloading the pack; historical v1-v23 output intentionally has no v24 controller-objective cleanup bank.


## Item-backed placeable objects v25 acceptance

ADR 0036 defines Portable v25 bounded item-backed placeable objects. Its accepted reference run used the pre-v26 `examples/portable-pinball-cabinet` source from commit `5a4b98b`; the current checked-in cabinet has moved to Portable v26 and is covered by the v26 section below. V25 uses ordinary functions/entities/scoreboards and does not add a registry resource, so install/replacement can use the normal `/reload` path. A custom `appearance.kind: "model"` can depend on an external resource pack, but the checked-in acceptance example uses `appearance.kind: "head"` and needs no resource pack or client mod.

Compile and package the reference pack with:

```bash
npm run compile:portable -- \
  --source examples/portable-pinball-cabinet/datapack/data/portable_pinball_cabinet/mcgame/main.ts \
  --namespace portable_pinball_cabinet \
  --output build/portable/portable_pinball_cabinet

tar -C build/portable/portable_pinball_cabinet \
  -czf build/portable_pinball_cabinet.tar.gz .
sha256sum build/portable_pinball_cabinet.tar.gz
```

For historical v25 reproduction, compile the `5a4b98b` source and deploy through the normal devcontainer `publish_file` -> `mc-mcp.write_datapack_files` path. Keep a real client online while interpreting placement/tick behavior. Validate that generated marker reports `portable_version=25`, item appearance/placeable slot metadata, and controller mappings for controller-enabled child interactions.

Acceptance must verify all of the following through generated behavior rather than by editing scoreboard state as a substitute for the player path:

- a Survival player receives the compiler-generated carrier, places two cabinets, consumes the item, and the two active slots capture exact placement anchors/cardinal orientation;
- the placed carrier is the compiler-authored Armor Stand Marker path (`Invisible`, `Marker`, `NoGravity`, owner/pending tags) and pending markers are consumed/retagged by allocation;
- two active slots keep independent local state and controller ownership with two real clients;
- pickup/replacement exercises all four cardinal orientations and local Display/interaction coordinates rotate around the slot anchor; inspect at least one live Display quaternion in addition to position changes;
- the checked-in head-backed `itemDisplay` exists without a custom resource pack; if testing a namespaced `kind: "model"`, treat the resource pack as an external visual dependency rather than a datapack/compiler artifact;
- Sneak + use pickup returns the carrier, frees/resets the slot, removes children, and advances controller generation; after the same slot is reused, a stale old controller token must not drive the new instance;
- placing with every slot full and placing outside the ownership rectangle both reject the Marker and leave one matching refund item at the attempted anchor in Survival;
- ordinary `/reload` clears every active/pending placeable instance, slot-local state, controller generation/token, and child entity by design;
- all retained v1-v24 examples remain byte-identical to the parent compiler output;
- final `portable/cleanup` leaves zero generated objectives, namespace-owned/pending entities, and force-loads.

The accepted 2026-09-16 run used `Camera` and `Camera2`. Two real Survival placements allocated `[731.5,65,732.5]` and `[741.5,65,742.5]`; the clients independently claimed and launched their own pinball state. Reusing slot 1 produced orientations `0/1/2/3` with the controls offset rotating to each expected cardinal side, and a live orientation-3 block Display used left rotation `[0.0f,0.7071068f,0.0f,0.7071068f]`. Pickup/reallocation advanced generation while the old Camera2 token stayed stale and could not launch the new instance. Full-capacity and outside-ownership placement each returned the same carrier stack. `/reload` cleared slots/tokens/entities, and cleanup left zero objectives/entities/force-loads. The acceptance pack and temporary floors were then removed, leaving only vanilla enabled; `video_breakout` / `video_pinball` remained disabled/available.

The final Node suite was 59/59 green, and all 20 retained v1-v24 examples matched parent commit `37b4b70` byte-for-byte.

V25 placeables are active-instance state. Do not rely on a placed cabinet surviving `/reload`, same-namespace replacement, or server-side pack reinstallation. Persistent placed furniture requires a separate design. Also remember that rejection refunds are dropped item entities; acceptance queries should be executed `at` the attempted placement/player position rather than from the RCON command origin.

Before removing or replacing a v25 pack, run its installed `portable/cleanup` while it is still enabled. Clear or restore any temporary test terrain separately; as with other ownership programs, cleanup owns generated runtime resources, not arbitrary test blocks. Player inventory items granted during acceptance are test state and should also be cleared explicitly during teardown.


## Interaction-controller camera v26 acceptance

ADR 0037 defines Portable v26 controller-backed camera routing and bounded return. The checked-in `examples/portable-pinball-cabinet` now uses a roughly block-sized placed cabinet as the interaction surface and a separate fixed remote playfield inside the same ownership rectangle. Using the cabinet claims its child interaction controller; one `position_lock` camera targets that controller handle. Sneak while controlling calls `returnToInteraction(player)`, returns to the cabinet interaction, and invalidates the token. No gamemode transition or client mod is involved.

Compile and package with the same pinball-cabinet command above. The generated marker must report `portable_version=26`; the controller objective/generation mapping remains present because the v26 camera audience reuses v24 controller state.

Focused acceptance on mod-free Minecraft 26.1 `second` should verify:

- place one cabinet in Survival and inspect that its visible footprint remains approximately one block wide/deep rather than embedding the full pinball board;
- keep the remote playfield spatially separate from the cabinet;
- use the cabinet with real client `Camera` and verify only `Camera` is teleported/held at the remote `pinball_view` carrier while `Camera2` remains unaffected;
- real A/D and Space from the controller mutate the pinball state, while equivalent input from the unrelated client does not;
- real Sneak returns `Camera` to the cabinet interaction and advances the controller generation so the subsequent camera-lock phase does not recapture it;
- use the cabinet again and verify a fresh generation can enter the remote view again;
- `/reload` clears controller tokens/placeable active state under the existing v24/v25 lifecycle;
- final cleanup removes generated objectives, owned entities, and ownership force-loads.

Unlike v25's earlier two-independent-cabinet acceptance, the current reference game intentionally uses one placeable cabinet and one shared remote pinball arena. V26 currently permits only one controller-backed camera, so simultaneous independent remote boards/cameras remain outside this reference and API contract.

The accepted 2026-09-17 run placed the cabinet at `[732.5,65,731.5]` and created its child interaction at `[732.5,65.65,731.98]`. Camera's real use advanced controller generation `1 -> 2`, assigned only Camera token `2`, and routed it to remote carrier `[770,104,778]`; Camera2 had no token. Camera2 `Space+A` left `launched=0` / `ballY=-1850`, while Camera Space launched the ball and advanced game state. Camera Sneak returned to the cabinet and advanced generation `2 -> 3` without camera recapture; a second use advanced `3 -> 4` and re-entered the remote view. `/reload` reset generation/token/slot/children, cleanup left zero objectives/entities/force-loads, and teardown restored vanilla-only enabled datapacks. Node regression finished 63/63 green, with byte-for-byte parity for all 21 pre-v26 example sources against parent commit `5a4b98b`.
