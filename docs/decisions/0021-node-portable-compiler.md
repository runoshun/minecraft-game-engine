# ADR 0021: Move the portable compiler to Node.js before retiring Java/Fabric

Status: accepted and implemented for portable IR v1-v11.

## Context

The standalone datapack is the deployment artifact for portable games. The existing build path nevertheless ran through Gradle, Java 25, GraalJS, Fabric Loom configuration, and Java implementations of TypeScript transpilation, Portable IR parsing, and datapack generation. None of those Minecraft/Fabric runtime dependencies are required to generate a vanilla datapack.

The Fabric runtime is being retired. Portable multiplayer v12 is also a substantial compiler/IR change. Implementing v12 in the Java compiler and then immediately porting or deleting that implementation would create two moving targets and make parity harder to establish.

## Decision

Portable compilation is moved to a Node.js 22 CLI before any v12 work.

The canonical pipeline is:

```text
main.ts -> TypeScript 5.9.2 transpile -> sandboxed portableDsl evaluation
        -> validated Portable IR -> vanilla datapack
```

The implementation lives under `tools/portable-compiler/` and is invoked through `npm run compile:portable -- ...`. It uses Node's `vm` isolation for registration-time evaluation and exposes only registration/no-op host stubs while extracting `portable.define(...)`. Live Minecraft host state remains unavailable during compilation.

The v1-v11 migration gate is exact output parity with the existing Java compiler for representative programs covering scalar arithmetic, collision families, presentation, world projection, UI/sidebar, ownership lifecycle, JRPG composition, and v11 spectate camera behavior. Node regression tests then become the maintained compiler test suite.

The migration order is deliberately fixed:

1. finish and verify the Node v1-v11 compiler;
2. remove the Java/Graal/Fabric compiler/runtime implementation and associated build tooling;
3. implement Portable IR v12 multiplayer only in the Node compiler.

Portable IR semantics and generated datapack ABI are not changed by the v1-v11 Node migration. A v12 program is rejected until step 3.

## Consequences

- Building a portable datapack requires Node.js 22, not Java, Gradle, GraalVM, Fabric Loom, or Fabric API.
- Minecraft 26.1 remains the generated-pack target and does not require Node at runtime.
- `portableDsl` and the TypeScript compiler remain build-time assets of the repository.
- Compiler sandboxing is a Node build-tool boundary, not a Minecraft runtime security mechanism.
- The Java compiler may remain temporarily only as a parity oracle during the migration change; it is not a second canonical backend.
- v12 implementation begins only after Java/Fabric removal so there is one compiler and one semantic source of truth.
