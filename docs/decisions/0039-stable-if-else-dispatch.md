# ADR 0039: Evaluate Portable if/else branch choice once

## Status

Accepted and implemented.

## Context

Portable IR has always represented an ordinary conditional action as one `if` node with a comparison plus `then` and optional `else` action lists. The intended semantics are conventional exclusive branching: evaluate the comparison at the branch point and execute exactly one side.

The vanilla lowering historically emitted a positive `execute if ... run function <then>` followed by a negative `execute unless ... run function <else>`. That looks equivalent only while branch actions do not mutate a value used by the comparison. If `then` changes that value, the later `unless` observes the changed state and can execute `else` in the same tick. For example:

```ts
game.when(phase.eq(1), () => phase.set(2), () => fallback.set(1));
```

could run both branches because the second command re-evaluated `phase == 1` after `then` changed `phase`.

ADR 0038 made the bug more visible because first-match `choose`/`match` deliberately lower to nested existing `if/else` nodes. Othello acceptance exposed it immediately: switching `BLACK -> WHITE` in the first match case made the sibling `WHITE` case visible to the re-evaluated else path and switched the turn back to `BLACK`.

Collision/trigger branch lowering does not have this defect. Those helpers first materialize the geometric result into compiler-private temporary scores before dispatch; authored branch actions cannot mutate those compiler-private flags. Ordinary scalar `if` needs the same exclusive-branch guarantee.

## Decision

When an ordinary Portable `if` has both non-empty `then` and `else` branches, the vanilla compiler emits an exclusive dispatch function:

```mcfunction
execute <positive comparison> run return run function <then-function>
return run function <else-function>
```

The caller invokes this dispatch function unconditionally.

The comparison is tested only on the first command. If it is true, `return run` executes the then function and exits the dispatch function, so the else path is unreachable even if the then function mutates comparison inputs. If it is false, execution falls through to the unconditional `return run` of the else function. The caller then continues with actions after the original `if` node.

An `if` with only a `then` branch keeps the existing single `execute if` lowering. An `if` with only an `else` branch keeps the existing single negative-test lowering. No extra dispatch function is needed in either case because only one conditional command exists.

Minecraft `return` is already part of the generated datapack runtime contract for ownership readiness guards. This decision additionally relies on Minecraft 26.1 `return run function` inside generated branch functions.

## Compatibility

This is a backend semantic correction and does not add or change Portable IR. No Portable version is consumed.

Generated mcfunction output changes for existing programs that contain ordinary `if` nodes with both non-empty branches. Programs that accidentally depended on both branches executing after a branch mutated its own condition will change behavior; that behavior contradicted the IR/API meaning and is not preserved.

Player/session/placeable execution context is preserved because the dispatch function is called under the same executor and execution context as the original branch command. Comparison/value scope validation is unchanged.

## Validation

The regression suite must verify that an if/else whose `then` mutates its comparison input compiles through one `return run` dispatch rather than separate positive/negative commands in the caller.

Minecraft 26.1 acceptance must verify `return run function` loads without datapack errors and that the Othello reference performs one turn transition after a legal move: Black's opening move flips the bracketed stone, updates the score from 2-2 to 4-1, and leaves White as the next player rather than executing a second sibling branch.
