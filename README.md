# Minecraft Game Engine

A TypeScript DSL and Node.js compiler for building game prototypes as **vanilla Minecraft datapacks**. Minecraft supplies rendering, player input, world state, entities, particles, audio, networking, and level editing; game rules are authored with `portableDsl`, lowered to a bounded versioned IR, and compiled to scoreboard/mcfunction/Display resources.

The repository no longer contains a Fabric runtime. The supported path is:

```text
main.ts + local .ts modules -> Node.js compiler -> Portable IR -> generated datapack -> Minecraft 26.1
```

## Status

Early PoC targeting Minecraft Java Edition 26.1. Portable IR v1-v27 is implemented. v12 adds multiplayer `PlayerSet` / lexical `PlayerContext` with player-local state and input; v13 adds bounded runtime grids, deterministic RNG, incremental grid-to-world projection, and exact-cardinality `forSinglePlayer`; v14 adds externally managed vanilla-team PlayerSets with partitioned player rules, HUDs, and camera audiences; v15 adds team-bound logical sessions with independent shared scalar state, Grid state, and deterministic RNG streams; v16 adds explicit session-local GridWorld terrain footprints inside the shared ownership lifecycle; v17 adds bounded `count` / `sum` / `min` / `max` / `any` / `all` reductions over player sets and sessions; v18 adds bounded global/session persistent scalar state; v19 adds bounded global/session persistent Grid state backed by compiler-private command storage; v20 adds bounded player-local native-dialog selections backed by compiler-owned trigger results; v21 adds bounded static rich dialog text/item bodies, native confirmation, and readable boolean/option/integer-range single-input forms; v22 expands bounded mannequin actors with static profile/skin-layer/pose/hand/equipment presentation and state-backed pitch; v23 adds bounded compiler-owned world interaction hitboxes whose right-click handler runs as the real clicking player; v24 adds reload-scoped controller binding so the clicker can remain the exact input owner across later ticks and reconnects within one active instance; v25 adds bounded item-backed placeable world objects; v26 lets one position-lock camera target an exact interaction controller and adds bounded return to the source interaction; v27 adds bounded recursive `all` / `any` / `not` compound conditions shared by action guards, reductions, and declarative `when:` fields.

Current capabilities include fixed-point state, held input and hotbar input, state-authored rising edges, block/text Display projection, bounded actor projection, world batches/fills, particles, sounds, shared and player-local actionbar HUD, one global vanilla sidebar, AABB/circle/capsule collision primitives, triggers, two-pose flippers, compile-time `repeat`, bounded ownership lifecycle, `position_lock` / opt-in `spectate` camera modes, v12 player-local execution, v13 bounded grids/RNG/grid-world projection, v14 external-team PlayerSet filtering with disjoint team HUD/camera audiences, v15 team-bound logical sessions with session-local scalar/Grid/RNG state, v16 session-local GridWorld projection with compile-time footprint isolation, v17 bounded player/session reductions, v18 schema-aware global/session persistent scalar state, v19 bounded persistent Grids without exposing raw storage, v20 static native-dialog selection choices, v21 rich confirmation plus typed single-input native forms, v22 richer bounded mannequin actor appearance/equipment/pose with state-backed pitch, v23 bounded `minecraft:interaction` right-click/use input with exact clicking-player callbacks, v24 active-instance controller claim/iteration with offline-safe generation tokens and `/reload` reset, v25 bounded head/model-backed placeable object slots, v26 exact controller-camera routing plus `returnToInteraction`, and v27 bounded compound conditions through `game.condition.all/any/not`. v1-v11 `first_player_*` input remains supported for compatibility.

Post-v16 roadmap policy is recorded in ADR 0026. Bounded reductions are complete in v17; bounded global/session scalar persistence is complete in v18, bounded persistent Grid state in v19, interactive selection UI in v20, bounded rich/typed native-dialog UI in v21, mannequin/actor presentation expansion in v22, bounded world-object right-click input in v23, active-instance interaction controller binding in v24, bounded item/placeable objects in v25, controller-backed camera routing in v26, and bounded compound conditions in v27. The four ordered capability priorities are complete; arena allocation and related session infrastructure remain lower priority while explicit-coordinate/team-based workarounds are sufficient.

The compiler frontend also supports bounded static relative imports between local `.ts` files under the entry source directory (ADR 0033), plus authoring-only `unless`, first-match `choose`, and equality `match` branch helpers (ADR 0038). Compound boolean composition is a v27 IR feature exposed only as `game.condition.all/any/not` (ADR 0040).

## Requirements

- Node.js 22; `.mise.toml` pins the validated version.
- Minecraft 26.1 for generated-pack validation.
- No Java, Gradle, Fabric, GraalVM, or server mod is required to compile or run a portable game.

## Compile a game

```bash
npm run compile:portable -- \
  --source examples/portable-breakout-core/datapack/data/portable_breakout/mcgame/main.ts \
  --namespace portable_breakout \
  --output build/portable/portable_breakout
```

The entry source may use bounded static relative imports such as `./bricks` or `./bricks.ts`; the compiler resolves local `.ts` modules below the entry directory automatically. Node built-ins, npm packages, dynamic imports, and non-TypeScript imports are rejected. The output directory is the deployment artifact. Copy it into a Minecraft world's `datapacks/` directory. Ordinary function/predicate changes may be reloaded; a v20+ pack whose generated dialog registry resources are being added, changed, or removed requires a server/world restart after file replacement so Minecraft 26.1 bootstraps the dialog registry deterministically. V24+ controller bindings are intentionally cleared by `/reload`; when removing controller use so the same namespace compiles back to v23 or earlier, run the installed v24 `portable/cleanup` before replacement. Generated directories carry `.mcgame-portable-generated`; the CLI refuses to overwrite a non-empty directory without that marker.

Run compiler tests with:

```bash
npm test
```

## Minimal example

```ts
portableDsl({ fixedPoint: 1000 }, game => {
  const x = game.state("x", 0);
  const vx = game.state("vx", 0.2);

  game.block("ball", {
    block: "minecraft:sea_lantern",
    x: game.at(x, 10), y: 64, z: 0,
    scale: 0.4,
  });

  game.tick(() => {
    x.add(vx);
    game.when(x.gte(3), () => vx.negate());
    game.when(x.lte(-3), () => vx.negate());
  });
});
```

## Examples

`examples/` is intentionally small and human-facing. Version-specific compiler fixtures live under `tools/portable-compiler/test/`; historical acceptance evidence remains in the ADRs. See `examples/README.md` for the directory policy.

Complete games:

- `examples/portable-breakout-core` — compact brick-breaker and local TypeScript module reference.
- `examples/portable-pinball-cabinet` — placeable cabinet, interaction controller, remote camera, and pinball gameplay.
- `examples/portable-othello` — polished two-player Othello using Grid/GridWorld, interactions, reductions, and v27 compound conditions.
- `examples/portable-procedural-roguelike` — runtime Grid/RNG/GridWorld procedural topology game.
- `examples/jrpg-demo` — larger mechanics demo with movement, actors, UI, dialogue, shop, combat, world projection, sound, and particles.

Feature galleries/labs:

- `examples/portable-actor-presentation` — mannequin profile/pose/equipment presentation.
- `examples/portable-dialog-ui` — consolidated native selection, confirmation, and typed-form gallery.
- `examples/portable-multiplayer-lab` — consolidated player/team/session/Grid/RNG/GridWorld/camera/HUD/reduction reference.
- `examples/portable-persistence-lab` — consolidated persistent scalar/Grid reference.

Legacy host-runtime examples and narrow version-by-version acceptance examples are not kept here; equivalent version semantics are covered by compiler tests.

## Compiler architecture

The compiler uses the bundled TypeScript 5.9.2 distribution to load a bounded local `.ts` module graph rooted at `main.ts`, transpile it to ES2022, and evaluate it with a compiler-owned module loader plus the bundled `portableDsl` frontend in an isolated Node `vm` context. Minecraft host capabilities, Node built-ins, package resolution, and unrestricted filesystem/network access are unavailable to game modules. The compiler captures `portable.define(...)`, validates the resulting Portable IR, then emits ordinary datapack files.

This extraction step is intentionally not a general TypeScript runtime. Game code must express deployable behavior through portable IR/DSL declarations; live Minecraft state, filesystem/network access, arbitrary runtime callbacks, and host objects are not compiler capabilities.

See `docs/architecture.md` for the current design contract, `docs/operations.md` for compile/deploy/validation procedures, and `docs/decisions/README.md` for the indexed architectural decisions.

## Development rules

See `PROJECT_RULES.md`. Architecture/API/ownership changes must update the relevant design documentation in the same change.

## License

Project source is CC0-1.0. Bundled TypeScript retains its upstream license; see `THIRD_PARTY_NOTICES.md`.
