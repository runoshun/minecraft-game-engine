# ADR 0041: Add constant scalar multiplication and division in Portable v28

## Status

Accepted and implemented.

## Context

Portable state is fixed-point, but through v27 mutable scalar state exposes only `set`, `add`, `sub`, and `negate`. Arcade physics needs bounded operations such as damping, restitution, gain, and unit scaling.

TypeScript/JavaScript has no general user-defined operator overloading for ordinary objects, so `velocity *= 0.98` cannot be made a Portable operation without introducing a compiler-specific TypeScript dialect. A general runtime expression language is also unnecessary for the current pinball use case.

## Decision

Portable v28 adds constant-factor multiplication and division to every mutable scalar state scope:

```ts
state.mul(factor: number): void
state.div(divisor: number): void
```

This applies to global state, persistent state, session state, session persistent state, player-local state, and placeable-local state. The factor/divisor is a compile-time JavaScript number; Portable value references are intentionally not accepted. Using either method raises inferred Portable version to v28.

### IR

V28 adds `mul` / `div`, `persistent_mul` / `persistent_div`, `player_mul` / `player_div`, and `placeable_mul` / `placeable_div` actions. Session scope continues to use the existing session-qualified shared/persistent action representation. Raw arithmetic actions are rejected below v28.

The parser scales the factor with the program `fixedPoint` using the same signed-32-bit constant rules as other Portable numbers. Division is rejected when the divisor quantizes to raw zero.

### Fixed-point lowering

For fixed-point scale `S`, target raw value `x`, and factor raw value `f`, multiplication represents `floor(x * f / S)` and division represents `floor(x * S / f)` after sign normalization, following Minecraft scoreboard integer behavior.

The compiler reduces the rational coefficient by GCD before emitting scoreboard operations. With `fixedPoint = 1000`, `velocity.mul(0.98)` quantizes to `980/1000`, reduces to `49/50`, and lowers conceptually to multiplication by 49 followed by division by 50. Negative factors negate the target first and then apply the positive reduced ratio. `mul(0)` lowers directly to exact zero.

### Overflow

V28 does not add arbitrary-precision, saturating, or generic checked arithmetic. The multiply step uses signed 32-bit scoreboard behavior. GCD reduction minimizes the emitted multiplier/divisor, which is suitable for intended arcade coefficients such as `0.98`, `0.75`, `1.1`, `2`, and `4`, but authored runtime values must remain far enough from signed-32-bit limits that the intermediate multiplication cannot overflow.

The compiler rejects a reduced numerator or denominator that itself cannot be represented as a positive signed scoreboard constant.

### Why constant-only

Constant factors cover the immediate physics cases:

```ts
vx.mul(0.98);
vy.mul(-1);
speed.div(2);
```

V28 deliberately does not add state-by-state multiplication/division or expression trees. Those would require temporary allocation, runtime division-by-zero semantics, and a broader overflow policy.

## Compatibility

Portable v1-v27 raw IR remains valid and keeps its previous lowering. Existing DSL sources that do not call `mul` or `div` retain their previous inferred Portable version. No runtime mod or client change is required; lowering uses ordinary Minecraft 26.1 scoreboard commands.

## Non-goals

- JavaScript/TypeScript operator overloading or AST rewriting for `*`, `/`, `*=`, or `/=`;
- state-by-state multiplication or division;
- floating-point runtime storage;
- generic checked/saturating arithmetic or arbitrary-precision integers;
- general expression trees or runtime local temporaries.
