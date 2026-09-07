# JRPG mechanics demo

This example is intentionally separate from `topdown-roguelike`. Minecraft provides the fixed camera, input, rendering, audio, and static plaza geometry; `main.ts` owns the JRPG state machine and all gameplay state.

Implemented mechanics:

- explicit `/function jrpg_demo:start` and `/function jrpg_demo:stop` commands
- grid movement under a fixed angled field camera, with a closer battle camera during combat
- NPC bump-to-talk dialogue with multi-line progression
- merchant shop with gold, potion purchasing, and a one-time sword upgrade
- turn-based slime combat with Attack / Potion / Run commands
- TypeScript-owned HP, attack, inventory, gold, XP, enemy HP, turn progression, victory, and defeat recovery
- deterministic cleanup of runtime-created actors/render nodes and player UI on stop/reload

## Start / stop

Run these as the player who should control the demo:

```text
/function jrpg_demo:start
/function jrpg_demo:stop
```

From console/RCON use `execute as <player> run function ...`.

## Controls

| Context | Controls |
| --- | --- |
| Field | W/A/S/D moves the projected hero one tile |
| NPC dialogue | Jump advances; Sneak closes |
| Shop | W/S changes selection; Jump buys/confirms; Sneak leaves |
| Battle | W/S changes command; Jump confirms |

Bump into the Guide or Merchant to interact. Bump into the slime to start battle.

## Initial layout

The hero starts near the plaza center. The Guide is northwest, the Merchant northeast, and two slime encounters are southeast. The start function rebuilds only this small static demo arena; the arena is not the source of truth for gameplay state.
