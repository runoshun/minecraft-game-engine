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

v12 is not implemented yet. When implementation begins, acceptance must use at least two simultaneous clients and prove independent player-local state/input/HUD plus shared-camera audience behavior. ADR 0020 and `docs/architecture.md` define that future contract.
