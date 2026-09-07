# ADR 0004: Separate game presentation intent from Minecraft primitives

## Status

Accepted and implemented in runtime 0.2.0.

## Context

The TypeScript game is growing beyond movement/combat into HUD, shops, reward chests, bosses, richer visuals, audio, and effects. Minecraft provides useful primitives such as scoreboards, dialogs, container menus, mannequins, and display entities, but making game rules depend directly on those concepts would make the TypeScript Core Minecraft-specific and would force presentation decisions into gameplay code.

Display entities are useful for large bosses and world-space UI because they support arbitrary scale/transforms and client interpolation. Minecraft 26.1 also provides Dialog custom-click actions and standard container screens that can be driven from a server-only mod with vanilla clients.

The fixed top-down camera currently uses Spectator mode. Survival HUD elements such as hearts, hunger, and the normal XP bar are therefore not suitable as the primary HUD surface.

## Decision

Use a two-layer presentation boundary:

1. Portable game TypeScript depends on a game-owned presentation interface expressed in semantic concepts such as appearance keys, panels, menus, audio cues, and FX cues.
2. A Minecraft TypeScript adapter maps those semantics to stable runtime capabilities and Minecraft resource identifiers.

Expose three broad runtime presentation capability families:

- `render.spawn/update/remove/attach/detach` for world-space character/model/block/text projections, transforms, scale, billboard, interpolation, and simple translation-follow composition
- runtime render nodes, not Minecraft entities, are the authoritative presentation state; backing render entities are transient/non-persistent and only materialized in already-loaded chunks, so presentation does not force-load the world
- `ui.panel` for a persistent per-player informational panel
- `menu.open/update/close/onAction` for interactive item-grid and choice UI

Minecraft mappings are implementation details:

- `character` -> mannequin
- `model` -> item display
- `block` -> block display
- `text` -> text display
- `ui.panel` -> packet-only scoreboard sidebar
- `menu kind=items` -> virtual vanilla chest menu
- `menu kind=choice` -> Minecraft Dialog with runtime-owned custom click tokens

Do not expose hearts, hunger, XP, action bar, title, or boss bar as current public HUD capabilities. New HUD channels should only be added when an actual game need cannot be expressed through the panel, world-space render nodes, or menus.

Existing `actors` remains available as a compatibility API while games migrate toward `render`.

## Consequences

- Core combat/AI/room/economy logic can be tested without Minecraft.
- Large bosses can use custom item models and arbitrary scale without a boss-specific Mod API.
- Enemy labels and HP bars can be composed from attached world-space Display nodes.
- Shops, reward chests, and choices can use one action-ID event model even though Minecraft renders them with different native screens.
- Scoreboard sidebar state remains presentation-only and does not pollute the authoritative world scoreboard.
- A future web/debug renderer can implement the same game-facing presentation interface.
- `render.attach` is deliberately simpler than a full transform hierarchy; complex articulated bosses may need explicit adapter-side child transforms later.
- Vanilla clients remain sufficient.
