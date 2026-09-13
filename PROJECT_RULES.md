# Project Rules

These rules are part of the repository contract for humans and coding agents working on Minecraft Game Engine.

## Architecture documentation is authoritative

When a change modifies any of the following, update `docs/architecture.md` in the same commit/change:

- responsibility boundaries between the Node compiler, generated datapack, Minecraft, and game source;
- public Portable IR or `portableDsl` API;
- input, camera, presentation, ownership, reload, or cleanup semantics;
- compiler extraction/sandbox model;
- generated datapack layout or lifecycle;
- compatibility targets or required build/runtime dependencies.

Do not leave obsolete architecture text in place. Current behavior must be described as current; planned behavior must be labeled as planned. Significant architectural choices must add or supersede an ADR under `docs/decisions/`.

## Design principles

1. `portableDsl` plus versioned Portable IR is the game-facing semantic boundary.
2. The generated vanilla datapack is the deployment artifact and Minecraft 26.1 is the runtime host.
3. Game rules should remain backend-independent and deterministic where practical; do not expose raw command strings as the general game API.
4. Vanilla clients must remain sufficient unless a future decision explicitly changes that requirement.
5. Compiler evaluation must not depend on live Minecraft state, unrestricted filesystem/network access, or arbitrary host objects.
6. Generated entities, objectives, force-loads, UI resources, and other namespace-owned resources require deterministic reload/replacement/cleanup semantics.
7. Add new capabilities to Portable IR deliberately, with bounded vanilla lowering and tests.
8. Keep `mc-mcp` as the development, inspection, capture, deployment, and E2E-test control plane; it is not gameplay logic.

## Operational documentation

Compile, generated-artifact deployment, mc-mcp transfer, and Minecraft validation procedures live in `docs/operations.md`. Update it in the same change whenever those workflows or requirements change.

## Repository hygiene

- Keep generated compiler output under `build/` and out of Git.
- Do not commit credentials, server tokens, local worlds, Node caches, or temporary captures.
- Keep every retained example compilable against the current portable API.
- Run `npm test` after compiler changes.
- For behavior that depends on Minecraft semantics, also perform focused mod-free Minecraft 26.1 validation.
