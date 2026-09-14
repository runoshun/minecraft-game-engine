# ADR 0026: Prioritize irreducible portable capability gaps after v16

## Status

Accepted as roadmap policy. This ADR orders post-v16 design work; it does not assign Portable IR version numbers or define final APIs for the listed capabilities.

## Context

Portable v16 can already build deterministic single- and multi-player prototypes with bounded state, input, collision, procedural Grid/RNG logic, declarative presentation, team-backed sessions, and explicit session-local GridWorld footprints. The remaining backlog mixes two different kinds of work:

1. capabilities that portable game source cannot express correctly with the current semantic boundary; and
2. convenience, automation, or isolation features that can currently be approximated with explicit coordinates, bounded slot pools, duplicated declarations, actionbar UI, or external session orchestration.

Implementing the second category first would improve ergonomics while leaving hard gameplay gaps unresolved. Post-v16 work should therefore prefer missing semantics with no satisfactory portable workaround.

Presentation breadth is also a product capability, not only ergonomics. The current bounded actor API is deliberately narrow: a vanilla actor is a mannequin with position/yaw/lifetime, and zombie/skeleton intents are approximated with mob heads. This is sufficient for logic acceptance but too restrictive for visually distinct game characters. Actor/mannequin expansion therefore belongs in the planned capability roadmap even though static actor pools already provide a workaround for actor *cardinality*.

## Decision

Use the following priority order for new Portable IR capability design. Each item still requires its own design/ADR, bounded lowering, regression tests, and focused Minecraft 26.1 acceptance before implementation is considered complete.

### Priority 1: bounded player/session reductions

Add an explicit deterministic way to derive shared or session-shared values from a `PlayerSet` without allowing arbitrary shared mutation from `forEachPlayer`.

Target use cases include participant count, alive count, ready checks, team totals, extrema, and boolean `any`/`all` conditions. The exact API, supported value kinds, empty-set behavior, fixed-point rules, and evaluation order are intentionally left to the implementation ADR.

This is first because the current lexical safety rule intentionally rejects the obvious workaround: a multi-player callback may not repeatedly mutate shared/session-shared state. Common multiplayer rules therefore cannot be expressed cleanly today.

### Priority 2: persistent portable state

Design bounded persistence that survives `/reload` and generated-pack replacement for selected game, session, and/or player progression data.

The persistence boundary must define schema/version ownership, initialization/migration behavior, cleanup/reset semantics, offline-player handling where applicable, and how persistent state differs from current active-instance scoreboard state. The storage mechanism is not selected by this roadmap ADR.

This is a semantic gap for progression, unlocks, campaigns, long-running worlds, and resumable runs; current portable state intentionally resets on reload/replacement.

### Priority 3: interactive selection UI

Add a portable, vanilla-client-compatible interaction surface for choices that cannot be represented well as passive actionbar/sidebar/world text plus held-key input.

Target use cases include dialogue choices, menus, shops, confirmations, and other bounded selections. Minecraft 26.1 dialog/inventory capabilities may be used by the backend, but game rules must receive a portable bounded interaction model rather than raw commands or arbitrary packet events.

### Priority 4: mannequin/actor presentation expansion

Expand bounded declarative actor presentation so game characters can be visually distinct without abandoning compiler-owned lifecycle or static declaration bounds.

The first design pass should evaluate mannequin-specific appearance/profile or skin controls supported by vanilla, equipment, pose/transform controls, and related bounded character presentation. Item/model display projections and attachment relationships may be included only where they preserve deterministic ownership and cleanup. Runtime-created/unbounded actor collections are not implied by this priority and remain a separate problem.

ADR 0015 remains the historical contract for v7: these features were non-goals of that version. This ADR changes their roadmap priority; it does not retroactively change v7 semantics.

## Lower-priority capability gaps

The following remain legitimate future work but come after the four priorities above unless a concrete retained game demonstrates a stronger blocker:

- 3D or swept collision beyond the current bounded 2D logic primitives;
- carefully scoped Minecraft world/entity queries that do not turn Portable IR into a raw command/query API;
- generic pathfinding or additional topology algorithms where Grid plus game-specific bounded logic is insufficient;
- generic runtime collections, runtime-created presentation collections, and richer dynamic string/rich-text systems.

## Workaround-covered infrastructure and ergonomics

The following are intentionally not the immediate roadmap despite being documented limitations:

- automatic arena coordinate allocation: authors can currently assign non-overlapping footprints explicitly;
- per-session ownership rectangles/dynamic chunk leasing: one bounded program ownership region can host multiple explicit session footprints;
- dynamic matchmaking/session creation: external vanilla-team/session orchestration remains usable;
- session-local block/text/actor declarations: bounded global declarations can currently be statically expanded per known session, although this is verbose;
- independent per-player vanilla sidebars: player actionbar HUDs provide a portable per-player UI surface for current games;
- module/import support: single-file authoring is inconvenient but does not remove runtime game semantics.

Client-private scene visibility remains a real capability gap when strict visual privacy is required, but spatial separation is sufficient for current prototype acceptance. It therefore stays behind the four priorities above until a retained game requires privacy rather than merely separate world footprints.

## Consequences

- The next design milestone should address reductions rather than automatic arena allocation.
- Persistence follows reductions because it unlocks game progression that cannot be represented by active-instance state.
- Interactive UI follows persistence and should remain vanilla-client compatible.
- Actor/mannequin presentation expansion is explicitly planned and should be treated as a gameplay-expression capability, not dismissed as cosmetic polish.
- Arena allocation, per-session ownership, and matchmaking remain documented but are not prerequisites for the next capability milestones.
- This ADR orders work only. Public APIs and IR version numbers are decided separately so implementation evidence can still change the detailed design.

## Progress

ADR 0027 completes Priority 1 with Portable IR v17 bounded player/session reductions. ADR 0028 completes the bounded global/session scalar portion of Priority 2 in Portable IR v18. Player/offline persistence remains deferred; interactive selection UI is the next roadmap priority.
