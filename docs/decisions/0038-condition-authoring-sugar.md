# ADR 0038: Add bounded conditional authoring sugar without changing Portable IR

## Status

Accepted and implemented.

## Context

Portable gameplay rules are recorded as an ordered action tree. Before this decision, authoring exposed only `game.when(condition, then, else?)` for ordinary scalar comparisons. Combining conditions therefore required nested callbacks such as `when(a, () => when(b, ...))`, and state-machine dispatch required several independent `when(...)` calls or a manually nested `if / else-if` tree.

Existing retained games already contain repeated two- and three-level `when` nesting for rising edges, collision guards, mode dispatch, and compound player input. An 8x8 board game such as Othello/Reversi makes this more visible: move validation and bounded directional scans need several guards, while turn/phase logic needs mutually exclusive branches. The runtime capability is already sufficient; the problem is authoring clarity.

This does not justify a new runtime condition language by itself. Portable IR already has the required ordered `if` action, lexical scope validation, fixed-point comparisons, and vanilla lowering. Adding compound boolean nodes to IR would widen every parser/lowering/presentation condition surface and require a new Portable version even though the same behavior is expressible today.

## Decision

`portableDsl` adds bounded build-time conditional sugar:

```ts
game.whenAll([a.eq(1), b.eq(2)], () => {
  result.set(1);
});

game.whenAny([left.eq(1), right.eq(1)], () => {
  moving.set(1);
});

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

These are authoring helpers only. They emit the existing `op: "if"` Portable IR tree and do not raise the inferred Portable version.

### Semantics

- `whenAll([a, b, ...], then, else?)` executes `then` only if every condition is true. Conditions are represented as nested existing `if` actions in array order.
- `whenAny([a, b, ...], then, else?)` executes `then` if at least one condition is true, with ordered short-circuit shape expressed through existing nested `if`/`else` actions.
- `unless(condition, then, else?)` is the inverse branch form of `when` and emits the normal `if` action with authored branches swapped.
- `choose(cases, otherwise?)` is a first-match ordered branch. Only the first matching case executes. It lowers to one `if -> else-if -> ... -> else` tree, not several independent `when` actions.
- `match(value, cases, otherwise?)` is `choose` sugar for ordered equality comparisons against one portable value. Cases use `[value, callback]` tuples.

`choose` and `match` first-match semantics are important for mutable state machines. If the first branch changes the dispatch state, later cases in the same `choose`/`match` are still unreachable in that invocation because they are nested under the first branch's `else` path. ADR 0039 guarantees this at vanilla runtime by selecting an ordinary `if/else` branch once before authored branch mutation can affect its sibling.

Each condition/case list is bounded to 1..16 entries. Expansion still counts toward the existing Portable action-count and nesting-depth limits; this API improves source readability rather than weakening compiler bounds. Because v1-v26 IR has only single-comparison `if`, some sugar shapes necessarily duplicate one branch in the expanded tree: `whenAny` repeats its `then` branch across alternatives, and `whenAll` with an `else` repeats that `else` branch across failed conjuncts. Small rule bodies are appropriate; large reusable algorithms should be factored into one shared state-driven pipeline rather than hidden behind a large `whenAny` body. A future compound-condition or reusable runtime-rule facility would require a separate IR decision.

### Scope and ordering

Condition serialization uses the same lexical checks as `game.when`. Player-, session-, and placeable-scoped values therefore cannot escape through these helpers. Callback actions are captured through the existing action sink, so mutation/cardinality restrictions are unchanged.

All callbacks are compiler-time authoring callbacks exactly like `game.when`; they are not arbitrary runtime JavaScript callbacks.

## Compatibility

No Portable IR version is added. Existing raw IR, parsers, vanilla lowering, generated datapack layout, lifecycle, and Minecraft runtime behavior are unchanged. Source that does not use the helpers is unaffected.

Compound boolean conditions are deliberately **not** added as a general `PortableDslCondition`. Declarative presentation fields such as `when:` therefore continue to accept one ordinary portable comparison. If compound declarative conditions become necessary, that is a separate IR/version decision rather than an implicit side effect of action authoring sugar.

## Validation

The compiler regression suite must verify that:

1. all helpers expand exclusively to existing `if` actions;
2. using the helpers does not raise the inferred Portable version relative to equivalent `when` source;
3. `choose` and `match` form ordered first-match else-if trees;
4. lexical PlayerContext escape checks remain enforced; and
5. invalid/oversized helper inputs are rejected during extraction.
