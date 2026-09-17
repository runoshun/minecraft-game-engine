# ADR 0038: Add bounded branch authoring sugar without changing Portable IR

## Status

Accepted and implemented.

## Context

Portable gameplay rules are recorded as an ordered action tree. The primitive branch API is `game.when(condition, then, else?)`.

State-machine dispatch and inverted branches are common enough that spelling them only through nested `game.when` callbacks is noisy. This is an authoring ergonomics issue rather than a runtime capability gap.

Compound boolean conditions are a different problem. They affect action guards, reductions, and declarative `when:` fields, and therefore belong in the Portable condition IR rather than in branch-specific source expansion. Portable v27 / ADR 0040 owns that capability.

## Decision

`portableDsl` provides three bounded branch helpers that compile to the existing ordinary `if` action tree:

```ts
game.unless(gameOver.eq(1), () => {
  tickGame();
});

game.choose([
  { when: phase.eq(WAITING), then: () => waitingTick() },
  { when: phase.eq(PLAYING), then: () => playingTick() },
], () => finishedTick());

game.match(phase, [
  [WAITING, () => waitingTick()],
  [PLAYING, () => playingTick()],
], () => finishedTick());
```

### Semantics

- `unless(condition, then, else?)` is the inverse branch form of `when`.
- `choose(cases, otherwise?)` is a first-match ordered branch. Only the first matching case executes.
- `match(value, cases, otherwise?)` is equality-dispatch sugar over `choose`; each case is a `[value, callback]` tuple.

`choose` and `match` lower to one nested `if -> else-if -> ... -> else` tree, not independent sibling `when` actions. ADR 0039 guarantees exclusive runtime dispatch even if a selected branch mutates the value used by later cases.

Case lists are bounded to 1..16 entries and continue to count against the existing action/depth bounds.

### Compound conditions

Branch helpers do not define a second boolean language.

Portable v27 adds `game.condition.all(...)`, `game.condition.any(...)`, and `game.condition.not(...)`. Those return the normal opaque `PortableDslCondition` and can be consumed by `game.when`, `unless`, `choose`, reductions, or declarative `when:` fields.

For example:

```ts
game.when(game.condition.all([
  phase.eq(PLAYING),
  cell.eq(EMPTY),
]), () => {
  placeStone();
});
```

## Scope and ordering

Conditions use the same lexical validation as `game.when`. Player-, session-, and placeable-scoped values cannot escape through `unless`, `choose`, or `match`.

Callbacks are compiler-time authoring callbacks exactly like `game.when`; they are not arbitrary runtime JavaScript callbacks.

## Compatibility

No Portable IR version is consumed by `unless`, `choose`, or `match` themselves.

This project has not shipped a stable public DSL release, so removed experimental authoring shapes are not retained solely for source compatibility. Compound boolean composition is represented only by the v27 `game.condition` API.

## Validation

The compiler regression suite verifies that:

1. `unless`, `choose`, and `match` expand only to existing `if` actions;
2. using only those helpers does not raise the inferred Portable version;
3. `choose` and `match` form ordered first-match else-if trees;
4. lexical scope checks remain enforced; and
5. invalid/oversized case lists are rejected during extraction.
