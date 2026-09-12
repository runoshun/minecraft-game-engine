# Runtime Operations

This document records operational knowledge that should survive individual development sessions. It complements `docs/architecture.md`; gameplay/runtime design belongs there, while release and deployment procedures belong here.

## Canonical binary distribution

The source repository is public at `runoshun/minecraft-game-engine`.

Built runtime JARs are **not** committed to the source tree. Tagged builds publish the runtime JAR and its SHA-256 checksum as GitHub Release assets.

For version `X.Y.Z`, the canonical download URL is:

```text
https://github.com/runoshun/minecraft-game-engine/releases/download/vX.Y.Z/mc-game-runtime-X.Y.Z.jar
```

The release asset, rather than a file under `dist/`, is the deployable artifact of record.

Before publishing a runtime release:

1. update the project/runtime version consistently;
2. run a clean Gradle build;
3. record the SHA-256 of the generated runtime JAR;
4. commit and push the source change;
5. push tag `vX.Y.Z`;
6. wait for the tag GitHub Actions run to publish both the JAR and `.sha256` Release assets;
7. verify the unauthenticated public Release URL returns a real JAR and its SHA-256 matches the local build.

Do not place GitHub tokens, deploy keys, RCON credentials, `.env` files, or server-local secrets in repository resources or release artifacts. The GitHub Actions workflow's `${{ github.token }}` is an execution-time reference, not a committed credential value.

## Deploying the runtime with mc-mcp

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

Therefore, changes involving script startup, watchdogs, render entities, chunk behavior, UI packets, menus, or player interaction must get a `main`-server validation pass before the release is considered finished.

## Compiling the portable subset to a vanilla datapack

The experimental ADR 0009/0010/0011/0012 path compiles one portable program from a TypeScript `main.ts` into a dedicated vanilla datapack directory. The source may use low-level `portable.define(...)` or the bundled `portableDsl(...)` frontend. Use Java 25 and provide all three Gradle properties explicitly:

```bash
./gradlew compilePortable \
  -PportableSource=examples/portable-breakout-core/datapack/data/portable_breakout/mcgame/main.ts \
  -PportableNamespace=portable_breakout \
  -PportableOutput=build/portable/portable_breakout
```

For a DSL-only source that uses only implemented portable primitives, the generated output is the deployment artifact: copy that directory into a Minecraft 26.1 world's `datapacks/` directory. Fabric, Fabric API, GraalJS, TypeScript, and MC Game Runtime are not required on that target server. They are build/runtime-development dependencies only. Portable v4 currently emits held player-input predicates, block/text-display projections, one spectator camera, particle/sound emitters, one actionbar HUD, and 2D AABB collision rules.

The output directory is treated as generated content and contains `.mcgame-portable-generated`. Re-running the compiler may replace a directory carrying that marker; it refuses to delete a non-empty directory without the marker. Generated output belongs under `build/` and is not committed.

Validation for compiler changes should include both `./gradlew test` and loading a generated pack on Minecraft 26.1. For camera/input changes, use a real 26.1 client: verify that the generated camera attaches, the view stays fixed, and held input predicates continue changing portable state while the player is spectating. For particle/sound changes, load the generated commands and capture a short run where the emitter condition becomes true. For text/HUD changes, verify the text display and actionbar on a real client. For collision changes, inspect the generated score state after a known overlap and a known miss. Keep a player/bot online while observing `minecraft:tick` behavior because the development server can pause while empty. Run `portable/cleanup` before deleting a generated pack so spectator state, generated entities, and the objective are removed, then remove temporary generated smoke packs from shared development worlds.
