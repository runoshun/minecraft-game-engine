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
npm run compile:portable -- --source examples/portable-breakout-core/datapack/data/portable_breakout/mcgame/main.ts --namespace portable_breakout --output build/portable/portable_breakout

npm run compile:portable -- --source examples/portable-pinball-cabinet/datapack/data/portable_pinball_cabinet/mcgame/main.ts --namespace portable_pinball_cabinet --output build/portable/portable_pinball_cabinet

npm run compile:portable -- --source examples/portable-multiplayer-lab/datapack/data/portable_multiplayer_lab/mcgame/main.ts --namespace portable_multiplayer_lab --output build/portable/portable_multiplayer_lab

npm run compile:portable -- --source examples/portable-persistence-lab/datapack/data/portable_persistence_lab/mcgame/main.ts --namespace portable_persistence_lab --output build/portable/portable_persistence_lab
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

## Multiplayer/session acceptance (v12, v14-v17)

Use `examples/portable-multiplayer-lab` for current real-client multiplayer/session smoke testing. The lab intentionally infers Portable v17 because one program combines the accumulated model: player-local state/input/HUD from v12, team-backed PlayerSets/cameras from v14, logical sessions from v15, session GridWorld projection from v16, and reductions from v17. Version-specific raw-IR gates and scope errors remain covered by compiler tests.

Create external vanilla teams `lab_red` and `lab_blue` and assign one real client to each. The generated pack must never create, remove, join, or leave those teams.

Acceptance should verify:

- A on the red client and D on the blue client mutate only that player's local score and only that session's shared/Grid/RNG state;
- both sessions intentionally reuse the same scalar/Grid/RNG names without cross-session collision;
- each client is held by its own team camera and sees only its team HUD;
- both session GridWorld footprints become ready and rebuild independently;
- the same RNG seed starts both sessions identically, then consuming one session's stream does not advance the other;
- `count`, `sum`, `min`, `max`, `any`, and `all` reductions use only members of the matching session PlayerSet and retain the documented empty-set values;
- unrelated online players outside both teams receive no participant-local initialization/input state;
- `/reload` resets active-instance scalar/player/Grid/RNG state while leaving external team membership unchanged;
- `portable/cleanup` removes generated objectives/entities/force-loads while leaving the external teams intact.

For a change isolated to one historical version, run the corresponding Node tests (`v12` through `v17`) in addition to this integrated lab. The detailed historical acceptance evidence remains in the version ADRs.

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

## Persistence v18-v19 acceptance and lifecycle

Use `examples/portable-persistence-lab` with one real client in externally managed team `lab_persist`. The lab infers v19 and combines global/session persistent scalar state with global/session persistent Grids. Version-specific v18/v19 validation remains covered by compiler tests.

Acceptance should verify:

- A updates global `campaign` / `legacy` scalars and global Grid `world`; D updates session `wins` and session Grid `stash`;
- Grid reads expose the authored stored values and the declared out-of-bounds fallback;
- `/reload`, ordinary `portable/cleanup`, and same-namespace replacement preserve persistent values;
- active-instance player/session scratch state still follows normal reload cleanup;
- `portable/reset_persistent` restores currently declared scalar/Grid defaults and schema markers;
- `portable/purge_persistent` removes persistent objectives/storage for explicit destructive teardown;
- schema reset/preserve behavior and structural Grid shape resets remain covered by the dedicated v18/v19 Node tests;
- external team membership is never owned or modified by generated lifecycle functions.

Run cleanup before deleting the pack, then use `purge_persistent` only when the acceptance test explicitly intends to remove persisted data.

## Native dialog UI v20-v21 acceptance and registry lifecycle

Use `examples/portable-dialog-ui` with real client `Camer` in externally managed team `v21_party`. The human-facing gallery now contains both the v20 bounded selection surface and the v21 confirmation/typed-form surfaces in one staged flow.

Because these features create dialog registry resources, installing/removing/changing registry entries requires cleanup where applicable, file replacement/removal, and then server/world restart. Ordinary `/reload` is valid after the registry contents have already been bootstrapped.

Acceptance should verify:

- the first stage renders the bounded selection with option and cancel results;
- the second stage renders rich styled confirmation text plus the item body;
- boolean, option, and integer-range forms submit expected fixed-point results;
- cancel paths resolve the declared negative result and rearm the surface;
- repeated level-triggered `open()` does not replace/reset an already-pending surface;
- advancing to a different generated surface rearms/replaces the previous pending transport correctly;
- `/reload` resets active-instance player/result/transport state while preserving external team membership;
- `portable/cleanup` closes pending generated dialog state and removes all selection/form objective banks.

Raw v20 selection gating and v21 rich/form validation remain in `selection-ui.test.mjs` and `dialog-ui.test.mjs`; the consolidated example is the current visual/runtime gallery.

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

## World interaction/controller v23-v24 acceptance

The standalone v23/v24 examples have been retired from `examples/`. Version-specific parser/lowering contracts remain covered by `interaction.test.mjs` and `interaction-controller.test.mjs`. For current real-client integrated smoke testing, use `examples/portable-pinball-cabinet`, whose placeable child interaction exercises `onUse`, controller claim, exact-player `forPlayer`, generation replacement, and controller invalidation as part of the retained v26 game.

Acceptance for changes touching v23/v24 lowering should verify:

- a real right-click on the compiler-owned interaction dispatches once to the real target player;
- repeated distinct uses remain observable while one recorded use is not replayed on later ticks;
- claiming binds only the exact player who used the interaction;
- input from an unrelated second real client cannot drive controller-only actions;
- a newer claim advances generation and leaves the old token stale;
- reconnect without an intervening claim can resume the current token, while reconnect after a newer claim cannot resurrect the stale token;
- `/reload` resets controller generations/tokens and active-instance player state by design;
- `portable/cleanup` removes interaction/controller objectives and generated entities/force-loads.

Use the dedicated Node suites when the change needs to prove raw v23/v24 version gating independently of the current v26 pinball source.

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


## Compound conditions v27 acceptance

ADR 0040 defines Portable v27 recursive `all` / `any` / `not` conditions. Use `examples/portable-othello` on mod-free Minecraft 26.1 `second` with real clients `Camera` and `Camera2`. V27 adds generated function/scoreboard control flow only, so ordinary archive replacement plus `/reload` is sufficient; no server restart, Fabric mod, or resource pack is required.

Compile and package with:

```bash
npm run compile:portable --   --source examples/portable-othello/datapack/data/portable_othello/mcgame/main.ts   --namespace portable_othello   --output build/portable/portable_othello

tar -C build/portable/portable_othello   -czf build/portable_othello.tar.gz .
sha256sum build/portable_othello.tar.gz
```

Acceptance must verify:

- the generated marker reports `portable_version=27` and generated `condition_NNN.mcfunction` evaluators are present;
- `/reload` on Minecraft 26.1 reports no datapack problems;
- the initial Othello GridWorld is 60 empty/green cells, two black, and two white;
- real client Camera claims Black and Camera2 claims White through the two seat interactions; the compound seat-presence predicate moves the game into `PLAYING`;
- Camera physically uses legal opening cell `(2,3)`; the bracketed white stone flips, score becomes Black `4` / White `1`, and the next turn remains White rather than falling through to a sibling branch;
- the board footprint after the move is 59 green / four black / one white;
- the full Node regression suite passes and only the Othello example infers v27 among the retained examples;
- `portable/cleanup` removes generated objectives/entities/force-loads before pack removal, and acceptance terrain is explicitly restored because GridWorld projection writes real blocks.

The accepted 2026-09-18 run installed archive SHA-256 `68bddf83f36929e9168b101cccac10d0dbd87cbaadaa2d2f127f0c18c0147ef8`. The pack exposed 65 generated condition evaluators and loaded with no problems. Initial board scan returned 60 green / two black / two white. Real simultaneous seat use produced Camera color raw `1000`, Camera2 color raw `2000`, both seat-presence values raw `1000`, and `phase=1000`. Camera's real use of cell `(2,3)` produced score raw `4000/1000`, board counts 59/4/1, `turn=2000` (White), `phase=1000`, and `consecutivePasses=0`.

The Node suite is 70/70 green. All 22 checked-in examples compile and version inference remains unchanged for the 21 examples that do not use v27 compound conditions.

## Portable v28 arithmetic acceptance

ADR 0041 constant-factor scalar arithmetic changes generated scoreboard math and therefore requires focused Minecraft 26.1 validation when its lowering changes.

Use a small mod-free `second` smoke pack with `fixedPoint=1000` and known scalar inputs. At minimum verify:

- `mul(0.98)` applies the reduced `49/50` coefficient;
- `div(2)` halves the fixed-point raw value;
- a negative factor applies the documented sign/floor behavior;
- `mul(0)` produces exact zero;
- cleanup removes the generated objective state.

Compiler tests must also reject a divisor that quantizes to raw zero and raw mul/div IR below Portable v28.

The accepted 2026-09-19 run used archive SHA-256 `a0c0b2c3dfc2e5df9105e4fcb18bebe928ac964aa7d0d00087d5ad1df2764021`. With raw inputs `1234`, `1235`, `1001`, `1001`, and `1000`, the generated pack produced `1209` for `mul(0.98)`, `617` for `div(2)`, `-501` for both negative-factor probes, and `0` for `mul(0)`. A subsequent `/reload` reproduced the values. Cleanup removed the generated objective and the smoke pack was then deleted, leaving the pre-existing Othello acceptance pack untouched.
