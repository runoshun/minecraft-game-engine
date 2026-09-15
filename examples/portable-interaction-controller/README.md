# Portable Interaction Controller v24

Acceptance example for active-instance controller binding on a compiler-owned world interaction.

Right-clicking the cabinet runs `cabinet.onUse(player => ...)` and claims that exact player with `cabinet.controller.claim(player)`. Later ticks use `cabinet.controller.forPlayer(player => ...)`, which runs for at most the currently claimed online player. The callback increments a player-local controller tick count and accepts Space/Jump only from the bound controller.

A new claim advances an opaque generation token and replaces the previous controller even if the previous player is offline. An offline controller keeps its player token, so reconnecting during the same active game instance resumes control only if nobody else has claimed the cabinet in the meantime. `/reload` removes and recreates the controller objective bank and resets generation state, so every binding is cleared, including scores belonging to offline players. `portable/cleanup` removes the same resources.

The binding is intentionally not persistent state and does not survive reload. V24 does not expose player UUIDs, tags, selectors, or generic identity storage to game source.
