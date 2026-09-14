# Portable persistent state (v18 acceptance)

This example exercises global and session-scoped scalar persistence across `/reload`, normal `portable/cleanup`, and generated-pack replacement in the same namespace. External team `v18_party` supplies membership and remains outside compiler ownership.

`campaign` and session `wins` use schema-mismatch reset policy; `legacy` uses preserve policy. With one real client in the team, A/left increments `campaign` by 1 and `legacy` by 10, while D/right increments session `wins` by 1. The player HUD reads all three persistent values.

Normal `portable/cleanup` intentionally leaves the persistent objective/storage intact. `portable/reset_persistent` restores all currently declared persistent values to their declared initial values and schema markers. `portable/purge_persistent` removes the persistence objective and persistence metadata entirely and is intended for explicit destructive reset/teardown.

Compile with:

```bash
npm run compile:portable -- \
  --source examples/portable-persistent-state/datapack/data/portable_persistent/mcgame/main.ts \
  --namespace portable_persistent \
  --output build/portable/portable_persistent
```
