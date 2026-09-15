# ADR 0033: Allow bounded local TypeScript modules during portable extraction

## Status

Accepted.

## Context

Portable game source was originally restricted to one `main.ts`. That kept extraction simple, but larger games had to keep reusable helpers, constants, content declarations, and subsystem builders in one file even though those helpers still produced the same bounded `portableDsl` declarations and Portable IR.

Module authoring is a compiler-frontend concern rather than a new runtime semantic. Importing a helper must not add a new Portable IR version, change generated datapack ownership, expose the build host to game code, or let portable source depend on arbitrary filesystem/network/package state.

## Decision

The Node compiler accepts a bounded graph of local TypeScript modules rooted at the directory containing the `--source` entry file.

Supported module forms are static ES imports and re-exports whose specifier is relative:

- `./foo`
- `./foo.ts`
- `./dir/foo`
- `../foo` only when resolution remains inside the entry source directory

Extensionless imports resolve by appending `.ts`. Imported files must resolve to regular `.ts` files. Resolution uses real paths, so a symlink cannot be used to escape the entry source directory.

The compiler rejects:

- Node built-ins such as `node:fs`;
- npm/bare package specifiers;
- JSON, JavaScript, CSS, and other non-`.ts` module extensions;
- dynamic `import()`;
- authored `require(...)`;
- TypeScript `import = require(...)`;
- circular local imports;
- any import whose real path escapes the entry source directory.

The complete source graph is bounded to at most 64 TypeScript modules and 1,000,000 source bytes in aggregate, including the entry file.

## Extraction model

The host compiler resolves and reads the complete allowed module graph before game initialization runs. Each module is transpiled through the repository's bundled TypeScript 5.9.2 compiler to ES2022/CommonJS-shaped JavaScript.

The compiler then builds an internal module bundle whose module factories and dependency map execute entirely inside the existing isolated Node `vm` context. Game modules do not receive Node's host `require`, `process`, filesystem APIs, package resolution, or network APIs. The in-context loader can resolve only dependency edges that the host compiler already validated from static ES import/re-export declarations.

The existing `portableDsl` frontend is installed once in that same context. Evaluating the entry module must still result in exactly one captured `portable.define(...)` program. Imported modules may export ordinary constants/functions/classes used to construct declarations, but they do not become runtime Minecraft modules and do not survive as a deployment artifact.

The `vm` remains a build-tool containment measure rather than a security boundary for hostile source, consistent with the existing architecture. This decision specifically avoids adding new host capabilities to the evaluated source.

## Portable IR and datapack compatibility

This decision does not add or change Portable IR. IR v22 remains the current version. The module graph is flattened by build-time evaluation before Portable IR validation, so a modular source and an equivalent single-file source must produce the same IR and generated datapack.

The generated datapack layout, Minecraft runtime requirements, reload/cleanup semantics, and deployment procedure are unchanged. Only source authoring and compiler extraction change.

## Reference example

`examples/portable-breakout-core` now imports its brick-field builder from `./bricks`. The helper owns the 5 x 8 compile-time brick declaration while `main.ts` retains the arcade loop. Its generated datapack is byte-for-byte identical to the pre-split source.

## Consequences

- Larger games can separate reusable declaration builders and content without adding runtime semantics.
- Helper modules remain deterministic build input rather than arbitrary host plugins.
- There is intentionally no npm ecosystem, Node built-in access, JSON import, dynamic loading, or runtime module system.
- Cycles are rejected rather than emulating partial CommonJS/ESM initialization semantics.
- A future request for external packages, generated assets, or broader build plugins requires a separate architectural decision.

## Acceptance gate

1. Static relative imports, explicit `.ts` imports, nested imports, default/named exports, and re-exports compose one portable program.
2. Node built-ins, bare packages, non-TypeScript imports, dynamic import, authored `require`, source-root escape, and symlink escape are rejected.
3. Circular imports are rejected with a deterministic module chain.
4. The 64-module and 1,000,000-byte aggregate limits are enforced.
5. The modularized Breakout example generates byte-for-byte identical output to its pre-split form.
6. All retained checked-in examples still compile deterministically, and pre-existing examples produce byte-for-byte identical datapacks to pre-change commit `d091570`.
7. No Minecraft E2E is required because Portable IR and vanilla lowering/runtime semantics are unchanged.

## Acceptance result

Implemented and accepted in this change. The Node regression suite is 45/45 green. Module-specific coverage validates extensionless and explicit `.ts` imports, nested parent imports that remain inside the source root, default/named exports, re-exports, Node/package/non-TypeScript rejection, dynamic import and authored/CommonJS require rejection, real-path and symlink escape rejection, cycle rejection, the exact 64-module boundary, and the 1,000,000-byte aggregate source bound.

`examples/portable-breakout-core` was split so `main.ts` imports `./bricks`. Its generated datapack is byte-for-byte identical to the immediately pre-split source. All 18 retained checked-in examples were also compiled with this change and independently with pre-change commit `d091570`; every generated file was byte-for-byte identical.

No Minecraft E2E was run for ADR 0033 because neither Portable IR nor vanilla lowering/runtime semantics changed; the deployment artifact for every retained example is identical to the accepted pre-change compiler output.
