# Runtime Operations

This document records operational knowledge that should survive individual development sessions. It complements `docs/architecture.md`; gameplay/runtime design belongs there, while release and deployment procedures belong here.

## Canonical artifacts

The source repository is public at `runoshun/minecraft-game-engine`.

For a portable game, the canonical deployment artifact is the directory emitted by `compilePortable`; copy it to the target world's `datapacks/` directory. The target may be a vanilla Minecraft 26.1 server. Generated game packs belong under `build/` and are not committed.

The Fabric runtime is now an optional compatibility/development backend. Built runtime JARs are **not** committed to the source tree. When a Fabric-runtime release is needed, tagged builds publish the runtime JAR and its SHA-256 checksum as GitHub Release assets.

For version `X.Y.Z`, the canonical download URL is:

```text
https://github.com/runoshun/minecraft-game-engine/releases/download/vX.Y.Z/mc-game-runtime-X.Y.Z.jar
```

The release asset, rather than a file under `dist/`, is the deployable artifact of record.

Before publishing an optional Fabric-runtime release:

1. update the project/runtime version consistently;
2. run a clean Gradle build;
3. record the SHA-256 of the generated runtime JAR;
4. commit and push the source change;
5. push tag `vX.Y.Z`;
6. wait for the tag GitHub Actions run to publish both the JAR and `.sha256` Release assets;
7. verify the unauthenticated public Release URL returns a real JAR and its SHA-256 matches the local build.

Do not place GitHub tokens, deploy keys, RCON credentials, `.env` files, or server-local secrets in repository resources or release artifacts. The GitHub Actions workflow's `${{ github.token }}` is an execution-time reference, not a committed credential value.

## Deploying the optional Fabric runtime with mc-mcp

`mc-mcp` is the deployment/test control plane for the development server. The runtime is a custom GitHub-hosted JAR rather than a Modrinth project.

For the `main` server, the established update sequence is:

1. `list_mods(main)` to inspect the current Fabric loader, staged Modrinth projects, and installed JARs.
2. `install_mod_jar(main, <GitHub Release URL>)` to stage the new runtime JAR.
3. `delete_mod_jar(main, <old runtime jar filename>)` to remove the superseded manually installed runtime JAR.
4. `set_mods(main, loader="fabric", mods=["fabric-api"], confirm=true)` to restart the server while preserving the Modrinth-managed Fabric API dependency.
5. `list_mods(main)` and `tail_server_log(main)` to verify exactly one runtime JAR is installed and Fabric reports the intended `mc_game_runtime` version.

Important details:

- `set_mods.mods` is an **absolute list of Modrinth projects**, not a list of every JAR in the mods directory.
- A custom JAR installed with `install_mod_jar` remains in the mods directory across `set_mods`; remove old runtime versions explicitly so Fabric never sees two runtime JARs.
- `install_mod_jar` accepts the public `github.com/.../releases/download/...` URL and follows GitHub's redirect to the release asset host.
- A runtime JAR is only loaded after a restart.

## Main validation environment

The primary validation server is currently:

```text
server: main
world: world2
Minecraft: Java 26.1
loader: Fabric
Fabric API: fabric-api
```

After a runtime update, validate at least:

- startup log reports the expected `mc_game_runtime` version;
- the existing `topdown_ts` script loads without requiring a manual recovery step;
- `/reload` still reloads TypeScript scripts;
- changed capabilities get a focused smoke test on `main` before calling the release validated;
- temporary smoke datapacks/entities are removed and the top-down example is returned to its normal Room 1 initial state.

Known unrelated reload noise from the `athletic` datapack (`body08`, `body09`, `body10` referencing unknown `minecraft:chain`) is not a runtime regression and should not be modified as part of MC Game Runtime work.

## Release validation lessons

Local Fabric dev-server smoke tests are useful but are not sufficient for entity lifecycle or cold-start behavior. `main` has exposed behavior hidden by a warm/local spawn-chunk test, including GraalJS cold initialization cost and Minecraft entity/chunk lifecycle differences when the server is empty or paused.

Therefore, changes involving the optional Fabric backend's script startup, watchdogs, render entities, chunk behavior, UI packets, menus, or player interaction must get a `main`-server validation pass before a Fabric release is considered finished. Portable compiler/backend changes must also get a mod-free `second` validation pass; vanilla behavior is now the primary acceptance path.

## Compiling the portable subset to a vanilla datapack

The ADR 0009/0010/0011/0012/0013/0014/0015/0016 path compiles one portable program from a TypeScript `main.ts` into a dedicated vanilla datapack directory. The source may use low-level `portable.define(...)` or the bundled `portableDsl(...)` frontend. Use Java 25 and provide all three Gradle properties explicitly:

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-breakout-core/datapack/data/portable_breakout/mcgame/main.ts \
  -PportableNamespace=portable_breakout \
  -PportableOutput=build/portable/portable_breakout
```

The v6 pinball retirement-gate example compiles with:

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-pinball-core/datapack/data/portable_pinball/mcgame/main.ts \
  -PportableNamespace=portable_pinball \
  -PportableOutput=build/portable/portable_pinball
```

The v7 bounded presentation acceptance example (actors + dynamic scalar labels) compiles with:

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-presentation-core/datapack/data/portable_presentation/mcgame/main.ts \
  -PportableNamespace=portable_presentation \
  -PportableOutput=build/portable/portable_presentation
```

The v8 bounded world-projection acceptance example compiles with:

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-world-core/datapack/data/portable_world/mcgame/main.ts \
  -PportableNamespace=portable_world \
  -PportableOutput=build/portable/portable_world
```

For a DSL-only source that uses only implemented portable primitives, the generated output is the deployment artifact: copy that directory into a Minecraft 26.1 world's `datapacks/` directory. Fabric, Fabric API, GraalJS, TypeScript, and MC Game Runtime are not required on that target server. They are build/runtime-development dependencies only. Portable v8 currently emits held player-input predicates, conditionally visible block/text-display projections, one spectator camera, particle/sound emitters, one actionbar HUD, 2D AABB and circle/circle collision, circle/static-segment-or-capsule collision, center-point AABB triggers, two-pose flippers, bounded mannequin/zombie/skeleton actor projections, bounded state/input-backed world-text tokens, bounded compile-time world batches/fills, and declarations expanded by compile-time `repeat`.

The output directory is treated as generated content and contains `.mcgame-portable-generated`. Re-running the compiler may replace a directory carrying that marker; it refuses to delete a non-empty directory without the marker. Generated output belongs under `build/` and is not committed.

Validation for compiler changes should include both `./gradlew test` and loading a generated pack on Minecraft 26.1. For camera/input changes, use a real 26.1 client: verify that the generated camera attaches, the view stays fixed, and held input predicates continue changing portable state while the player is spectating. For particle/sound changes, load the generated commands and capture a short run where the emitter condition becomes true. For text/HUD changes, verify the text display and actionbar on a real client. For collision changes, inspect generated state after a known overlap and a known miss for every affected shape family; v6 segment/capsule work also requires endpoint/interior coverage, while trigger work requires an inside and outside check. For flippers, use the real client and confirm A/D selects the active pose and produces the expected collision response rather than only checking generated text. For portable actors, verify state-backed position/yaw against entity `Pos`/`Rotation`, verify every supported appearance on the real client, and exercise false->true `when` lifetime so respawn re-applies appearance. For dynamic world text, mutate a referenced scalar and inspect/render the resulting `text_display.text` component, not only the generated mcfunction text. For v8 world projection, verify an unconditional batch on load plus a condition-driven batch using a real input predicate; inspect the actual blocks, and explicitly restore the test footprint because `portable/cleanup` intentionally does not roll terrain back. Do not validate zombie/skeleton by temporarily changing the server difficulty; the vanilla backend intentionally maps them through mannequin head equipment. For visibility changes, inspect the Display transformation before and after its `when` condition changes. Keep a player/bot online while observing `minecraft:tick` behavior because the development server can pause while empty. Run `portable/cleanup` before deleting or replacing a generated pack so spectator state, generated entities, and the objective are removed. Repeated load/restart testing has shown that entities in unloaded chunks can survive long enough to duplicate when the replacement load cannot select them; until gate 4 is closed, explicitly verify zero leftovers after cleanup/reload with the relevant chunks loaded and do not treat a syntax-clean reload alone as lifecycle acceptance.
