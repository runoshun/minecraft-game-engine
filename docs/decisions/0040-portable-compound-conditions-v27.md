# ADR 0040: Add bounded compound conditions in Portable v27

## Status

Accepted and implemented.

## Context

Portable v1-v26 represents a condition as one scalar comparison:

```ts
{ op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte", left, right }
```

That representation is sufficient for individual tests but not for a reusable boolean expression shared across action guards, reductions, and declarative presentation/lifetime fields.

The Othello reference made the limitation concrete. Move admission repeatedly needs conjunctions such as "waiting AND both seats occupied" or "request pending AND scanner idle". Encoding those only as nested action branches makes the source noisier and cannot be reused by declarative `when:` fields or reduction predicates as one condition value.

The condition language therefore needs an IR extension rather than more branch-specific source sugar.

This problem is distinct from reusable runtime procedures. Compound conditions remove duplicated boolean control structure while keeping the existing action execution model. Runtime procedures would additionally require call-graph validation, parameter/local-state semantics, recursion rules, and lexical execution-context decisions.

## Decision

Portable v27 adds a bounded recursive condition tree. Existing scalar comparisons remain valid leaves.

### IR shape

```ts
type PortableV27Condition =
  | PortableV25Comparison
  | { op: "all"; conditions: PortableV27Condition[] }
  | { op: "any"; conditions: PortableV27Condition[] }
  | { op: "not"; condition: PortableV27Condition };
```

The comparison leaf value vocabulary remains the v26 value vocabulary. V27 adds no scalar value, player identity, selector, query, collection, or mutation primitive.

The same condition type is accepted anywhere the existing compiler consumes a portable predicate:

- ordinary `if` actions;
- player/session reduction `any` and `all` predicates;
- block/text/item-display/actor/interaction `when:`;
- world-batch, particle, and sound `when:`;
- other existing declarative condition surfaces with the same pure scoreboard semantics.

### Bounds

Compound conditions are statically bounded:

- `all.conditions` and `any.conditions`: 1..16 children;
- maximum recursive depth: 8;
- maximum total nodes in one tree: 64;
- comparison leaves retain existing value/scope/version validation.

Raw IR below v27 rejects `all`, `any`, and `not`.

### Authoring API

The DSL exposes one compound-condition API:

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
  // ...
});
```

The API is:

```ts
game.condition.all(conditions)
game.condition.any(conditions)
game.condition.not(condition)
```

Each method returns the normal opaque `PortableDslCondition`.

Using any compound constructor raises inferred Portable version to at least 27. Ordinary comparisons, `unless`, `choose`, and `match` do not.

### Lexical scope

A compound condition is pure and may contain only leaves valid in its lexical context.

The DSL carries the existing player/session/placeable scope identity through the compound handle. Construction and later serialization reject escaped or crossed PlayerContext, SessionContext, and PlaceableInstanceContext values.

A global condition may be consumed inside a narrower lexical context. A player/session/placeable-scoped condition may not escape that context.

### Evaluation semantics

- `all`: true iff every child is true;
- `any`: true iff at least one child is true;
- `not`: logical negation of its child;
- comparisons retain existing fixed-point semantics.

Conditions are side-effect-free reads. Generated evaluation may short-circuit because authored code cannot observe whether a later pure child was evaluated.

A branch consumes one boolean result at the branch point. Authored branch mutation cannot make its sibling branch eligible in the same invocation; ADR 0039 remains the exclusive-branch contract.

### Vanilla lowering

Comparison-only conditions retain the existing direct `execute if/unless score` fast path.

A compound tree lowers to bounded generated `condition_NNN.mcfunction` evaluators that return numeric 0/1 with Minecraft `return`. The caller stores that result into compiler-private scratch and tests the scratch score.

Conceptually:

```mcfunction
# portable/condition_000
execute unless score #phase <obj> = #playing <obj> run return 0
execute unless score #cell <obj> = #empty <obj> run return 0
return 1
```

Caller:

```mcfunction
execute store result score #k0 <obj> run function <ns>:portable/condition_000
execute if score #k0 <obj> matches 1 run function <branch>
```

Nested compound children may invoke generated child evaluators. Evaluation is sequential and bounded.

For reduction predicates, the evaluator runs as each selected player and stores the boolean result on that player's compiler-private score in the main objective before the reduction update command consumes it. This preserves `@s` semantics for player-local leaves.

No new scoreboard objective bank is introduced.

### Action-count accounting

A compound condition is represented as condition nodes rather than duplicated action subtrees. A guarded branch body appears once in IR regardless of the number of boolean alternatives.

The existing 2,048-action limit is unchanged. Condition trees have their own 16-child / depth-8 / 64-node bounds.

The migrated Othello reference uses v27 condition conjunctions and compiles with fewer generated branch functions than its pre-v27 nested-expansion form.

## Compatibility

Portable v1-v26 raw IR remains valid.

This project has not shipped a stable public DSL release, so the implementation does not retain an experimental parallel compound-branch API. Compound boolean composition is represented only by `game.condition.all/any/not`.

Programs that use only ordinary comparison conditions retain their previous inferred Portable version and direct comparison lowering.

## Non-goals

Portable v27 does not add:

- reusable runtime procedures/rules;
- parameters, local variables, recursion, or a runtime call stack;
- generic boolean-valued state or boolean arithmetic;
- arbitrary predicates, command strings, selectors, NBT/storage expressions, or entity/world queries;
- dynamic/unbounded condition arrays;
- runtime-created condition trees.

### Follow-up: reusable runtime rules

TypeScript helper calls are compile-time authoring macros, so calling the same large gameplay algorithm from multiple sites still duplicates its action tree.

If retained games make this a practical blocker, a separate runtime-rule IR must decide:

1. parameterless state-driven functions vs bounded scalar parameters;
2. lexical capture of global/session/player/placeable state;
3. specialization across PlayerContext/SessionContext/placeable slots;
4. static recursion/cycle rejection;
5. action-budget accounting of calls vs bodies;
6. cardinality/mutation boundaries; and
7. preservation of executor, dimension, and position context.

V27 deliberately does not couple those semantics to compound conditions.

## Acceptance

The implemented v27 compiler has regression coverage for:

1. explicit v27 inference and raw IR version gating;
2. nested `all/any/not` parsing and bounds;
3. lexical PlayerContext scope enforcement;
4. ordinary action guards without branch-body duplication;
5. compound player-reduction predicates;
6. declarative `when:` use;
7. comparison-only fast-path preservation; and
8. the migrated Othello reference remaining within existing bounded program limits.

### Acceptance result

Accepted on 2026-09-18 on mod-free Minecraft 26.1 `second` with real clients `Camera` and `Camera2` and checked-in `examples/portable-othello`.

- The generated marker reported `portable_version=27`; 65 `condition_NNN` functions loaded through `/reload` with no problems.
- The initial board was 60 green / two black / two white cells.
- Real seat use assigned Camera=Black and Camera2=White, and the compound seat-presence predicate advanced the game to `PLAYING`.
- Camera's real legal opening use at `(2,3)` changed the board to 59 green / four black / one white and score `2-2 -> 4-1`.
- After legality scanning, `turn=2000` (White), `phase=1000` (playing), and `consecutivePasses=0`, proving the condition evaluator plus ADR 0039 exclusive branch dispatch works under Minecraft execution.
- Node regression is 70/70 green; all 22 retained examples compile and only Othello infers v27.

Archive SHA-256 for the accepted pack was `68bddf83f36929e9168b101cccac10d0dbd87cbaadaa2d2f127f0c18c0147ef8`.
