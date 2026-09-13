# ADR 0019: Portable v11 opt-in spectate camera

## Status

Accepted.

## Context

Portable v10 changed the vanilla camera mapping from spectator observation to position-locking the controller in Adventure mode. That closed the offline player tag/gamemode cleanup debt exposed during lifecycle validation, but repeatedly teleporting the real player can produce visible camera jitter. For presentation-heavy prototypes a spectator observing a stationary camera carrier is materially smoother.

The runtime must therefore support both mappings without making spectator gamemode ownership implicit again.

## Decision

Portable IR v11 adds `mode` to the single vanilla camera declaration. The TypeScript DSL exposes it as:

```ts
game.camera("main", {
  x: 0,
  y: 100,
  z: 0,
  yaw: 0,
  pitch: 20,
  mode: "spectate",
});
```

Supported modes are:

- `position_lock` — the existing default. Held input is sampled from the first non-spectator player and that player is teleported to the owned invisible camera carrier each tick. The generated pack does not change player gamemode or persist controller tags.
- `spectate` — held input is sampled from the first spectator player and that player is instructed to spectate the owned invisible camera carrier. The generated pack **does not change the player's gamemode**. Entering/leaving Spectator is external game/session lifecycle, not portable camera ownership.

The vanilla backend never emits `gamemode spectator` or `gamemode adventure` for a v11 spectate camera. This is deliberate: a datapack cannot deterministically restore an offline player's previous gamemode during cleanup. Requiring the controller to already be Spectator preserves v10 cleanup guarantees while allowing the smooth spectator camera path.

The camera carrier remains a generated owned armor stand and follows the same ownership-region/reload/cleanup rules as v10. Killing/replacing the carrier is sufficient to end observation of that entity; portable cleanup owns the entity, scoreboard objectives, sidebar, and force-loads, but not player gamemode.

## Consequences

- Games can choose smooth spectator observation where camera jitter matters.
- Existing camera declarations keep `position_lock` behavior and do not need a version bump.
- A DSL program using `mode: "spectate"` emits portable IR v11.
- Spectate-camera games must arrange Spectator mode outside the portable camera primitive and restore it according to their own session lifecycle.
- The single-controller limitation remains: `position_lock` selects the first non-spectator player; `spectate` selects the first spectator player.
- Portable input predicates remain usable while the controller is spectating the camera carrier on Minecraft 26.1; this must remain part of camera E2E acceptance.
