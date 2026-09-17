# ADR 0040: Add bounded compound conditions in Portable v27

## Status

Proposed. Not implemented.

## Context

Portable v1-v26 represents an ordinary condition as one scalar comparison:

```ts
{ op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte", left, right }
```

ADR 0038 added authoring-only `whenAll`, `whenAny`, `unless`, `choose`, and `match` without changing that IR. The helpers deliberately expand to existing nested `if` actions so old programs retain their Portable version and backend contract.

Othello acceptance showed the cost of that compatibility shape. A large `whenAny([a, b, c], body)` must repeat `body` under each alternative because v1-v26 has no IR node that can represent `a || b || c`. The first Othello draft exceeded the global 2,048-action bound even though the authored algorithm itself was bounded. Refactoring to one state-driven scan pipeline reduced the program to 1,575 actions and proved that the runtime capability is sufficient, but it also demonstrated that action count can be dominated by IR expansion rather than game logic.

This problem is distinct from reusable runtime procedures. A compound condition can remove duplicated branch bodies while keeping the existing action tree and execution model. Runtime procedures would add callable authored action blocks, call-graph validation, recursion rules, parameter/local-state semantics, and lexical PlayerContext/SessionContext/PlaceableInstanceContext questions. Those concerns should not be coupled to the first condition-tree extension.

## Decision

Portable v27 will add a bounded recursive condition tree. Existing scalar comparisons remain valid leaves.

### IR shape

The proposed v27 condition type is:

```ts
type PortableV27Condition =
  | PortableV25Comparison
  | { op: "all"; conditions: PortableV27Condition[] }
  | { op: "any"; conditions: PortableV27Condition[] }
  | { op: "not"; condition: PortableV27Condition };
```

The value vocabulary of comparison leaves remains the current v26 value vocabulary. V27 adds no new scalar value, identity, query, collection, or mutation primitive.

Every IR surface that currently consumes a Portable comparison should consume `PortableV27Condition` in a v27 program:

- ordinary `if` actions;
- player/session reduction `any` and `all` selector conditions;
- block/text/item-display/actor/interaction lifetime or visibility `when`;
- world-batch, particle, and sound `when`;
- any other existing declarative condition field that is semantically the same pure scoreboard predicate.

This keeps one condition language instead of creating separate action-only and presentation-only boolean systems.

### Bounds

Compound conditions remain statically bounded:

- `all.conditions` and `any.conditions`: 1..16 children;
- maximum recursive condition depth: 8;
- maximum total condition nodes for one condition tree: 64;
- comparison leaves retain all existing value/scope/version validation.

The parser rejects empty boolean nodes, trees beyond either bound, and v27 boolean operators in Portable versions below 27.

These are per-condition-tree bounds. Existing action, declaration, reduction, and program bounds remain unchanged.

### Authoring API

V27 adds explicit condition constructors rather than silently changing ADR 0038 helpers:

```ts
const canMove = game.condition.all([
  phase.eq(PLAYING),
  cell.eq(EMPTY),
  game.condition.not(locked.eq(1)),
]);

const wantsMove = game.condition.any([
  player.input.left.eq(1),
  player.input.right.eq(1),
]);

game.when(canMove, () => {
  // one branch body in IR
});

game.text("ready", {
  text: "READY",
  x: 0, y: 65, z: 0,
  when: game.condition.all([
    phase.eq(WAITING),
    playerCount.gte(2),
  ]),
});
```

The proposed API is:

```ts
game.condition.all(conditions)
game.condition.any(conditions)
game.condition.not(condition)
```

Each returns the existing opaque `PortableDslCondition` handle. Construction performs the same lexical scope checks as comparison creation/serialization.

ADR 0038 helpers remain source-compatible authoring sugar and continue to expand to v1-v26 `if` trees. They do **not** automatically opt existing source into v27. Authors choose v27 when they construct a compound condition explicitly. This preserves the current guarantee that old `whenAll/whenAny` source does not unexpectedly change Portable version or generated structure.

After v27 exists, documentation should recommend:

- `whenAll/whenAny` for small compatibility-oriented branches;
- `game.condition.all/any/not` when the condition is reused, used by declarative `when:`, or guards a non-trivial body.

A later deprecation/simplification decision may revisit the duplicate APIs, but v27 does not silently reinterpret existing source.

### Lexical scope

A compound condition is pure and may only contain comparison leaves valid in the lexical context where the condition is created and consumed.

The DSL condition handle carries the union of the existing player/session/placeable scope identities of its descendants. Construction and serialization must reject:

- a player-scoped descendant escaping its exact PlayerContext;
- a session-scoped descendant escaping or crossing SessionContext;
- a placeable-scoped descendant escaping or crossing its exact placeable slot;
- combinations that could not have been written as nested v26 `game.when` calls in that same context.

No player name, UUID, selector, entity query, or runtime identity value is introduced.

### Evaluation semantics

Conditions are side-effect-free reads. V27 defines logical semantics independent of lowering:

- `all`: true iff every child is true;
- `any`: true iff at least one child is true;
- `not`: logical negation of its child;
- comparison leaves retain existing fixed-point comparison semantics.

The observable result must be equivalent to evaluating one boolean value at the condition point and then dispatching from that value. Authored branch actions cannot cause a sibling branch to become eligible by mutating condition inputs. ADR 0039 remains the branch-exclusivity contract.

Short-circuit evaluation is permitted and preferred for generated-command efficiency, but authored code cannot observe whether later pure children were evaluated.

### Vanilla lowering

The compiler should lower compound trees through generated condition-evaluator functions that return a numeric boolean result.

Conceptually:

```mcfunction
# portable/condition_000
execute unless score #phase <obj> = #playing <obj> run return 0
execute unless score #cell <obj> = #empty <obj> run return 0
return 1
```

For `any`, the evaluator returns `1` on the first true child and `0` after all children fail. `not` inverts the child result.

Nested compound children may call generated child evaluators. The caller materializes the returned 0/1 result into compiler-private scratch before using it:

```mcfunction
execute store result score #cond <obj> run function <ns>:portable/condition_000
```

The scratch holder is compiler-private. Because Minecraft command/function execution is sequential, the result is consumed immediately before another authored condition evaluation can reuse the holder. Where a caller needs both positive and negative behavior, it dispatches from the materialized result once, preserving ADR 0039 semantics.

Comparison-only conditions should keep the existing direct `execute if/unless score` fast path when that does not duplicate evaluation. V27 should not make simple legacy comparisons more expensive merely because the program version is 27.

For declarative presentation/lifetime conditions, a compound tree is evaluated once for that declaration update and the resulting private boolean drives the existing spawn/hide/kill/write behavior. No persistent authored state is created.

### Version inference and raw IR

Using `game.condition.all/any/not` sets the inferred Portable version to at least 27.

Existing source that uses only comparison conditions, including ADR 0038 `whenAll/whenAny/unless/choose/match`, retains its prior inferred version unless it independently uses another later feature.

Raw IR with `op: "all" | "any" | "not"` is rejected below version 27.

### Action-count accounting

A compound condition tree counts as condition nodes, not duplicated action subtrees. The guarded `then` and `else` action lists each appear once in IR.

The existing 2,048 action limit is unchanged. V27 therefore removes a known source of artificial action multiplication without increasing the allowed amount of authored runtime work.

Generated condition helper functions and condition nodes need their own compiler accounting/limits; they must not be smuggled into the program as unbounded generated code.

## Compatibility

V1-v26 raw IR and comparison-only lowering remain valid.

ADR 0038 remains valid: its helpers are authoring-time compatibility sugar. V27 is an explicit opt-in condition representation, not a reinterpretation of those helpers.

A v27 program may freely mix comparison leaves and compound condition nodes. Comparison semantics, fixed-point scaling, scope rules, action ordering, reload, cleanup, and persistence semantics do not change.

No Fabric/client mod, resource pack, registry resource, new scoreboard objective bank, or Minecraft world ownership primitive is required. Generated condition helpers use the existing namespace function/objective lifecycle.

## Non-goals

Portable v27 does not add:

- reusable runtime procedures/rules;
- parameters, local variables, a runtime call stack, recursion, or mutual recursion;
- generic boolean-valued scalar state or boolean arithmetic;
- arbitrary predicates, command strings, selectors, NBT/storage expressions, entity/world queries, or packet events;
- dynamic/unbounded condition arrays;
- runtime-created condition trees;
- changes to player/session/placeable identity or lifecycle.

### Follow-up: reusable runtime rules

Othello also showed a separate authoring/compiler issue: ordinary TypeScript helper calls are compile-time macros, so calling the same large gameplay algorithm from two authored sites duplicates that action tree.

If retained games continue to hit this after v27, the next control-flow IR proposal should be a bounded runtime-rule facility rather than increasing the action limit. That design must answer, before implementation:

1. whether rules are parameterless state-driven functions or accept bounded scalar parameters;
2. whether rules may capture global/session/player/placeable lexical state;
3. how a rule is specialized per PlayerContext/SessionContext/placeable slot;
4. how recursion and cycles are statically rejected;
5. whether rule calls count toward action budgets separately from rule bodies;
6. whether rule calls may cross cardinality/mutation boundaries; and
7. how generated mcfunction calls preserve `@s`, dimension, position, and executor context.

V27 deliberately leaves those questions open.

## Acceptance gate

Before Portable v27 is accepted/implemented:

1. raw parser/type coverage must accept bounded nested `all/any/not` only in v27 and reject old-version/empty/deep/oversized trees;
2. DSL tests must verify lexical player/session/placeable scope enforcement and explicit v27 inference;
3. `if` with a large compound guard must contain one copy of each branch action list in parsed IR;
4. reduction and every declarative `when` surface must accept the same compound condition type where its leaf scopes are legal;
5. generated Minecraft functions must preserve exclusive branch semantics when a chosen branch mutates values used by the condition;
6. comparison-only programs must retain the existing fast lowering and old inferred version;
7. the Othello reference (or a focused stress fixture derived from its directional scan) must demonstrate materially lower action count than equivalent ADR 0038 expansion without increasing the 2,048-action ceiling; and
8. the complete regression suite plus mod-free Minecraft 26.1 focused acceptance must pass.
