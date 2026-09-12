# ADR 0017: Portable v9 bounded sidebar and input-action policy

Status: Accepted

Date: 2026-09-13

## Context

ADR 0013 retirement gate 3 requires every game-facing UI/input/presentation capability that remains a product requirement to have a portable mapping or to be explicitly out of scope before the Fabric runtime can be retired.

Presentation, actionbar HUD, world text, fixed camera, held movement input, and scalar state are already portable. The retained Fabric examples still use two higher-level UI shapes:

- `ui.panel(...)` for status, dialogue, shop, battle, and inventory information;
- `menu.open(...)` / `menu.onAction(...)` for the top-down roguelike's clickable inventory.

The JRPG already demonstrates that menu selection and confirmation do not require click callbacks: W/S + Jump/Sneak drive ordinary scalar mode/selection state while `ui.panel(...)` only presents that state. The top-down roguelike's potion/bomb chest can be migrated to the same model.

Minecraft 26.1 also provides enough vanilla scoreboard commands to render a bounded sidebar: an objective can own up to 15 fake-player rows, each row can receive a custom text-component display name, and its numeric score can be hidden with `scoreboard players display numberformat ... blank`.

## Decision

Portable IR v9 adds one bounded declarative sidebar.

The DSL form is:

```ts
game.sidebar("main", {
  title: "Portable UI",
  rows: [
    { id: "hp", text: ["HP ", hp] },
    { id: "help", text: "W/S SELECT   SPACE CONFIRM" },
  ],
});
```

The corresponding low-level metadata is `vanilla.sidebars[]`. v9 permits at most one sidebar, with 1..15 rows. The title is a static string. Every row has a stable portable id and 1..32 literal/state/input text tokens. Scalar values are rendered as logical integers, matching actionbar HUD and dynamic world-text token semantics.

The vanilla compiler owns a deterministic auxiliary scoreboard objective for the sidebar. On load it recreates that objective, gives each row a stable descending score, hides the numeric score, and selects it for the vanilla `sidebar` display slot. Each tick it refreshes row display-name components after portable rules execute, so the panel reflects current scalar state. `portable/cleanup` removes the owned sidebar objective. The main portable scoreboard remains the authoritative state store.

The vanilla scoreboard sidebar is server-global, unlike Fabric `ui.panel(...)`, which can be packet-scoped to one player. Portable v9 therefore defines the sidebar for the existing single-controller portable program model; all players on that server can see it. Per-player independent portable sidebars are out of scope until the portable controller model itself becomes multiplayer-aware.

The Fabric compatibility adapter maps `game.sidebar(...)` to the existing per-player `ui.panel(...)` for the first portable player. This is a compatibility projection, not a promise that the vanilla backend gains Fabric's packet-local visibility.

No new edge-event IR is added. Portable action edges are expressed with existing held-input registers and state. For example, a Jump rising edge stores the previous Jump value in a state register and runs the action only when `jump == 1 && jumpPrev == 0`, then copies `jump` into `jumpPrev`. This keeps input semantics deterministic and identical in the state machine, Fabric adapter, and vanilla scoreboard backend.

The following are explicitly **not** retirement-gate requirements:

- generic `menu.open/update/close` and `menu.onAction` chest/dialog click event bridging;
- generic `input.pressed(..., "attack" | "use" | "swap_offhand" | "drop" | ...)` packet-event bridging;
- arbitrary per-player UI trees or runtime-created menu entry collections;
- multiple simultaneous portable sidebars or per-player portable sidebar state.

Retained games that currently use the Fabric menu API must migrate interaction to bounded portable state plus existing held inputs, with `game.sidebar(...)`, actionbar HUD, and/or world text as presentation. A future game may justify a new portable input primitive, but it must have an independently verified vanilla-observable mapping rather than depending on Fabric packet hooks.

## Consequences

ADR 0013 gate 3 is satisfied by the v9 compiler/tests and mod-free Minecraft acceptance proving the sidebar and rising-edge recipe. The remaining Fabric-retirement blockers are gate 4 lifecycle hardening and gate 5 migration away from arbitrary runtime TypeScript/Fabric host calls.

The v9 sidebar owns a real vanilla scoreboard objective. It can conflict visually with another datapack that also owns the global sidebar slot; that coexistence problem is deliberately outside the current single-game portable deployment contract.

## Validation

The v9 acceptance ran on Minecraft 26.1 with `loader=vanilla`, `mods=[]`, and no runtime JAR. The real client rendered the generated sidebar, S/W changed the selection row through held-input predicates, a 1.2-second Space hold incremented the confirmation counter only once, and a post-release Space press incremented it a second time. Cleanup removed both generated objectives before the pack was deleted. During validation, leading-`#` fake row holders were found to be hidden from sidebar rendering; the compiler therefore uses visible row holders and custom display names.
