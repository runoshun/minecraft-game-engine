# ADR 0011: Add held input, spectator camera, and particle primitives to portable IR

Status: accepted as experimental API

## Context

Portable IR v2 could compile scalar arcade logic, hotbar selection, and block-display projections to a standalone datapack. That was enough to prove mod-free deployment, but it forced arcade controls onto the hotbar and left camera and effects in Fabric-only host glue.

Minecraft 26.1 exposes held player controls through the player `type_specific.input` entity predicate. Main-server validation also established that these predicates continue reporting controls while the same player is in Spectator mode and is spectating an entity. Existing pure datapacks on `main` already use ordinary vanilla particle commands for gameplay feedback. These mechanisms are sufficient for a fixed arcade camera, normal movement/jump controls, and bounded particle effects without requiring a server mod.

## Decision

Portable IR version 3 adds three backend-neutral declaration families while retaining v1/v2 compatibility:

- held first-controller input sources for `forward`, `backward`, `left`, `right`, `jump`, `sneak`, and `sprint`;
- at most one portable camera with dimension, position, yaw, and pitch; coordinates may be fixed or state-backed;
- bounded particle emitters with particle id, fixed/state-backed position, spread (`delta`), speed, count, force mode, and an optional portable condition.

The vanilla backend implements held input with generated `minecraft:entity_properties` predicates using the Minecraft 26.1 player `type_specific.input` fields. Without a camera, input uses the first non-spectator player. With a portable camera, the first non-spectator player is tagged as the controller, changed to Spectator mode, and made to spectate an owned invisible marker armor stand. Input is then read from that tagged spectator, so camera ownership does not suppress controls.

The vanilla camera entity and dynamic particle anchors are generated resources with deterministic tags. Initial creation briefly force-loads their declared initial chunks so `/reload` can replace stale entities. Dynamic coordinates are projected from scoreboard fixed-point state into entity `Pos` NBT each tick. Particle emitters execute vanilla `particle` commands after portable rules and state projections, so effects observe the current tick's state.

`portable/cleanup` first disables camera auto-attachment, then stops spectating, returns the tagged controller to Adventure mode, removes the controller tag, removes generated camera/particle/display entities, and removes the generated scoreboard objective. The tick-side auto-attach is guarded by an `#enabled` score so cleanup cannot immediately reattach the controller in the interval before the pack is deleted. Exact prior-gamemode restoration remains a known limitation shared with the current Fabric camera API.

The bundled DSL exposes these semantics as `input(..., { source })`, `camera(id, spec)`, and `particle(id, spec)`. Its Fabric adapter maps the same declarations to `input.players()`, `camera.attach`/`camera.move`, and `effects.particle`, respectively.

## Consequences

Positive:

- A/D/W/S, Space, Shift, and Sprint-style held controls can be authored once and work in both Fabric and generated vanilla datapacks.
- A fixed or state-positioned game camera no longer requires handwritten Fabric-only glue.
- Particle trails and conditional impact effects are portable presentation primitives.
- The generated datapack remains a normal Minecraft 26.1 datapack with no Fabric, GraalJS, TypeScript, or runtime-mod dependency on the target server.

Tradeoffs and limitations:

- the camera model is deliberately single-controller and supports one camera declaration per portable program;
- camera rotation is currently static declaration metadata; state-backed yaw/pitch and look-at constraints are not part of v3;
- generated camera cleanup returns the controller to Adventure instead of restoring the exact previous gamemode;
- held input predicates are level-triggered; edge behavior such as "press Space once" is authored with portable state (for example a `previousJump` register);
- particle emitters run at tick rate and are bounded declarations, not arbitrary command strings or a generic effect scripting API;
- dynamic particle positions use owned marker entities because vanilla commands cannot directly substitute scoreboard fixed-point values into particle coordinates.

ADR 0011 extends ADR 0009's portable backend contract and ADR 0010's authoring frontend. It does not make arbitrary TypeScript portable.
