# ADR 0004: Separate game presentation intent from Minecraft primitives

## Status

Accepted.

## Context

The TypeScript game is growing beyond movement/combat into HUD, bosses, richer visuals, audio, and effects. Minecraft provides useful primitives such as action bars, titles, boss bars, mannequins, and display entities, but making game rules depend directly on those concepts would make the TypeScript core Minecraft-specific and would force presentation decisions into gameplay code.

Display entities are especially useful for large bosses because they support arbitrary display transforms and client-side interpolation. Minecraft 26.1 has separate synchronized interpolation controls for entity position/rotation and display transformation, so the runtime can experiment with smoothing without changing authoritative game coordinates.

## Decision

Use a two-layer presentation boundary:

1. Portable game TypeScript depends on a game-owned `GamePresentation` interface expressed in semantic concepts such as actor appearance keys, status, messages, progress, audio cues, and FX cues.
2. A Minecraft TypeScript adapter maps those semantics to stable runtime capabilities and Minecraft resource identifiers.

Add two broad runtime capability families rather than adding a new Mod API for each Minecraft feature:

- `render.spawn/update/remove` for character/model/block/text visual projections, transforms, scale, billboard, and smoothing
- `ui.status/message/progress` for semantic HUD channels

`render` may internally choose mannequins or Minecraft display entities. `ui` may internally choose action bars, titles/subtitles, and boss bars. Those choices are not part of game rules.

Existing `actors` remains available during migration.

## Consequences

- Core combat/AI/room code can be tested without Minecraft.
- Large bosses can use item-display custom models and arbitrary scale without introducing a boss-specific Mod API.
- Display smoothing can be tuned in the Minecraft adapter without affecting logical positions or replay determinism.
- A future web/debug renderer can implement the same game-facing presentation interface.
- The runtime gets a somewhat larger generic rendering/UI surface, but this is preferable to repeated narrow Minecraft-specific additions.
- Resource identifiers and display implementation details still exist in the Minecraft adapter, where they are intentionally isolated.
