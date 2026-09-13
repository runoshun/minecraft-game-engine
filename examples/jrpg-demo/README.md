# Portable JRPG mechanics demo

This retained example is authored entirely with `portableDsl` and compiles to an ordinary Minecraft 26.1 datapack. The deployed game does **not** require Fabric, MC Game Runtime, GraalJS, or runtime TypeScript callbacks.

Implemented mechanics:

- fixed-camera grid movement with rising-edge W/A/S/D input;
- NPC bump-to-talk dialogue with three steps;
- merchant shop with gold, potion purchasing, and a one-time sword upgrade;
- turn-based two-slime combat with Attack / Potion / Run commands;
- portable state for HP, attack, inventory, gold, XP, enemy HP, turn progression, victory, and defeat recovery;
- bounded actor/block/text projection, actionbar + sidebar UI, sound/particle feedback;
- bounded static arena projection with `worldFill` / `worldBatch`;
- v10 ownership-region lifecycle and deterministic generated-entity cleanup.

The former Fabric-host version used `/function jrpg_demo:start` / `stop`, mutable runtime actors/render nodes, packet-local `ui.panel`, and a second battle camera. Those are intentionally replaced by generated-load startup, declarative projections/global sidebar, and one fixed portable camera. This keeps the retained gameplay loop inside the portable contract instead of adding new Fabric-only semantics.

## Compile

Use Java 25:

```bash
JAVA_HOME=/home/dev/.local/share/mise/installs/java/25.0.2 \
  ./gradlew --no-daemon --max-workers=1 compilePortable \
  -PportableSource=examples/jrpg-demo/datapack/data/jrpg_demo/mcgame/main.ts \
  -PportableNamespace=jrpg_demo \
  -PportableOutput=build/portable/jrpg_demo
```

Copy `build/portable/jrpg_demo` into the target world's `datapacks/` directory and reload. The game initializes automatically.

## Controls

| Context | Controls |
| --- | --- |
| Field | W/A/S/D moves the projected hero one tile |
| NPC dialogue | Space advances; Sneak closes |
| Shop | W/S changes selection; Space buys/confirms; Sneak leaves |
| Battle | W/S changes command; Space confirms |

Bump into the Guide or Merchant to interact. Bump into either slime to enter battle. Sidebar `MODE` values are `0=field`, `1=dialogue`, `2=shop`, `3=battle`, `4=victory`, `5=defeat`.

## Cleanup

Generated terrain intentionally persists. Before removing the pack, run:

```text
/function jrpg_demo:portable/cleanup
```

Then remove/disable the pack and explicitly restore the arena footprint if the test environment needs to return to all-air state.
