# Project Rules

These rules are part of the repository contract and should be followed by humans and coding agents working on MC Game Runtime.

## Architecture documentation is authoritative

When a change modifies any of the following, update `docs/architecture.md` in the **same commit/change**:

- responsibility boundaries between Minecraft, the runtime mod, and game scripts
- script loading/reload lifecycle
- public TypeScript API or input model
- entity/camera ownership and cleanup semantics
- sandbox/security model
- execution/tick model or performance budgets
- datapack/script layout
- compatibility targets or required runtime dependencies

Do not leave obsolete architecture text in place. Rewrite it so the document describes the current implementation and clearly labels planned-but-not-implemented behavior.

For a significant architectural choice, also add or supersede an ADR under `docs/decisions/`.

## Runtime design principles

1. Minecraft is the view/input/world host; gameplay rules should live in script code where practical.
2. The Fabric mod should expose a small stable capability API rather than raw Minecraft Java objects.
3. Vanilla clients should remain sufficient unless a feature explicitly requires a client mod.
4. `/reload` is the primary prototype iteration loop.
5. Scripts must not receive unrestricted host/filesystem/network/reflection access.
6. Runtime-created entities/resources must have deterministic ownership and cleanup.
7. A bad game script should be isolated/disabled rather than intentionally crashing the whole server where feasible.
8. Keep `mc-mcp` compatible: it is the development, inspection, capture, world-editing, and E2E-test control plane; it is not the gameplay logic owner.

## Repository hygiene

- Keep generated Gradle output out of Git.
- Do not commit credentials, server tokens, or local world data.
- Keep example script packs runnable against the current public API.
- Build the project after changes to Java/runtime code when the environment permits.
