# ADR 0028: Add bounded persistent scalar state in Portable IR v18

## Status

Accepted and implemented. Portable v18 compiler support and the focused Minecraft 26.1 persistence lifecycle gate passed on the mod-free `second` environment.

## Context

Portable state through v17 is active-instance state. `/reload`, generated-pack replacement, and ordinary compiler lifecycle recreate shared/session/player state from declarations. That is correct for match state but cannot represent progression, unlocks, resumable campaign values, or other world-long data.

Persistence must not weaken the existing ownership model. It needs an explicit lifecycle distinct from normal generated resources, stable identity across replacement, deterministic schema behavior, bounded declaration count, and an explicit destructive reset path. Player-identity persistence additionally requires offline-player identity and migration semantics; that is a separate design problem and is not bundled into this first persistence version.

## Decision

Portable IR v18 adds bounded **global and session-scoped persistent scalar state**. Player-persistent state is deferred.

### Authoring API

```ts
const campaign = game.persistentState("campaign", 10, {
  schema: 1,
  onSchemaMismatch: "reset",
});

game.session("party", party, session => {
  const wins = session.persistentState("wins", 3, {
    schema: 1,
    onSchemaMismatch: "reset",
  });
});
```

`schema` defaults to `1`. `onSchemaMismatch` defaults to `"reset"` and may be `"reset"` or `"preserve"`.

Persistent values are ordinary fixed-point readable scalars for comparisons, arithmetic sources, reduction selectors, collision values, and HUD/text/sidebar reads where the corresponding ordinary scalar kind is already allowed. Mutations are explicit `persistent_set/add/sub/negate` IR actions. Global persistent mutation follows global shared-state scope rules; session persistent mutation follows session-shared rules and is rejected inside multi-player `session.forEachPlayer`.

### Storage and identity

Persistent values live in a dedicated namespace-derived scoreboard objective, separate from the active-instance objective. Each declared global/session persistent state receives a stable fake-player holder derived from its semantic key (`global:<name>` or `session:<session>:<name>`), not declaration order. A compile-time hash collision is rejected.

A namespace-owned storage marker records that the persistent objective has been initialized. Ordinary `/reload` and same-namespace generated-pack replacement therefore reuse the existing objective and scores rather than recreating them.

At most 64 persistent scalar declarations exist across global plus all sessions in one program.

### Schema behavior

Each persistent declaration has an independent integer schema marker stored alongside its value in the persistent objective.

- `reset`: if the stored schema does not equal the declared schema, load replaces that value with the newly declared initial value, then records the new schema.
- `preserve`: if the schema differs, load keeps the existing numeric value and records the new schema.
- a newly introduced declaration initializes from its declared initial value.

V18 intentionally does not execute arbitrary migration callbacks. Authors choose reset or numeric preservation for this bounded scalar version. Rich structural migrations belong to a future persistence design.

Renaming a persistent key creates a new identity. Historical holders can remain until explicit purge; the persistent objective is namespace-owned and `purge_persistent` is the compaction/destructive teardown boundary.

### Lifecycle

Generated functions have distinct semantics:

- `portable/cleanup`: removes active-instance generated resources but **preserves persistent objective and metadata**.
- `portable/reset_persistent`: restores every currently declared persistent value to its declared initial value and current schema marker; it preserves the persistent objective.
- `portable/purge_persistent`: removes the persistent objective and initialization metadata. This is destructive and is intended for explicit world-data reset or final test teardown, not ordinary replacement.

Same-namespace replacement should run ordinary `portable/cleanup` before replacing the pack, preserving persistence. A later load recreates active-instance resources while reusing persistent values.

### Scope exclusions

V18 does not add player-persistent state, offline-player identity storage, persistent Grid/RNG collections, arbitrary NBT structures, migration callbacks, cross-namespace persistence, or automatic backup/restore.

## Consequences

- campaign/session progression can survive reload and pack replacement without making all state persistent;
- cleanup/replacement is no longer synonymous with deleting all namespace-owned data, so operators must use reset/purge intentionally;
- per-field schema policy makes incompatible scalar changes explicit;
- player/offline persistence remains a separate capability because its identity semantics are materially different;
- interactive selection UI becomes the next ADR 0026 roadmap priority after v18 acceptance.

## Acceptance gate

1. Node tests cover global/session persistent values, mutation/read lowering, schema reset/preserve, scope/version/collision/bound checks, and cleanup/reset/purge generation.
2. Retained v1-v17 examples are byte-for-byte identical to pre-v18 commit `a262bf1`.
3. Minecraft 26.1 acceptance mutates global and session persistent values through a real client, verifies `/reload` preservation, and verifies normal `portable/cleanup` leaves persistent data intact.
4. Same-namespace pack replacement preserves same-schema values.
5. A schema-changing replacement proves `reset` and `preserve` policies independently.
6. `reset_persistent` restores current declaration defaults; `purge_persistent` removes the persistent objective/metadata.
7. Final teardown leaves no temporary objectives/teams/datapacks.

## Acceptance result

The gate passed with `examples/portable-persistent-state` and the Node regression suite 25/25 green. All retained v1-v17 generated examples were byte-for-byte identical to pre-v18 commit `a262bf1`.

On mod-free Minecraft 26.1 `second`, external team `v18_party` contained real client `Camera`. The initial persistent values were global `campaign=10000`, global `legacy=5000`, and session `wins=3000` at fixed point 1000. Real A/left input changed `campaign` to `11000` and `legacy` to `15000`; real D/right changed session `wins` to `4000`. `/reload` preserved all three values and preserved external team membership.

Normal `portable/cleanup` removed every active-instance objective while leaving exactly the persistent objective `mcpe25a87fb`, its values `11000 / 15000 / 4000`, and the initialization marker intact. Replacing the generated pack under the same namespace with the same schema and reloading preserved those values.

A second same-namespace replacement changed all declaration schemas from 1 to 2 and changed declaration defaults to `campaign=100`, `legacy=500`, and `wins=200`. After reload, reset-policy `campaign` became `100000`, preserve-policy `legacy` remained `15000`, and reset-policy session `wins` became `200000`; all schema markers became `2`. `portable/reset_persistent` then produced `100000 / 500000 / 200000` as declared. A final ordinary cleanup again left only the persistent objective while the external team still retained Camera. `portable/purge_persistent` removed that objective and the initialization marker. Final teardown removed the team and acceptance datapack; the server ended with zero objectives and zero teams, with only the pre-existing disabled video packs available.
