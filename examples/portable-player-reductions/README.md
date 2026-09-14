# Portable player/session reductions (v17 acceptance)

This example exercises all six v17 session reductions against one externally managed vanilla team, `v17_party`. The compiler does not create, join, leave, or delete the team.

Each player owns identity-local `score` and `ready` state. A/left adds 1 to that player's score on a rising edge, D/right adds 2, and Jump sets that player ready. The session then recomputes:

- `count` — current online members in `v17_party`;
- `total` — sum of player scores;
- `minimum` / `maximum` — score extrema, with explicit empty value `-1`;
- `anyReady` / `allReady` — readiness reductions.

With two members starting at zero the aggregate is `N=2 SUM=0 MIN=0 MAX=0 ANY=0 ALL=0`. After one player presses A and the other presses D it becomes `N=2 SUM=3 MIN=1 MAX=2`. Jump on only one player yields `ANY=1 ALL=0`; after both jump it yields `ANY=1 ALL=1`. When both players leave the team, the defined empty-set result is `N=0 SUM=0 MIN=-1 MAX=-1 ANY=0 ALL=1`.

Compile with:

```bash
npm run compile:portable -- \
  --source examples/portable-player-reductions/datapack/data/portable_reductions/mcgame/main.ts \
  --namespace portable_reductions \
  --output build/portable/portable_reductions
```
