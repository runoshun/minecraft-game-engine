# ADR 0001: Embed TypeScript runtime in the Fabric server mod

Status: accepted for PoC

## Context

The initial prototype used datapack mcfunctions and then explored a remote TCP bridge to an external TypeScript process. External game logic gives excellent authoring ergonomics, but it adds a second process, deployment/configuration, synchronization, and an extra failure surface.

For rapid prototyping we want a game to be distributable similarly to a datapack and reloadable with `/reload`.

## Decision

Embed a sandboxed JavaScript runtime (GraalJS) and the TypeScript compiler in the server-side Fabric mod. Game code is stored as TypeScript resources inside datapacks and is transpiled/evaluated when datapacks load.

The Fabric mod exposes a narrow capability API and does not expose raw Java/Minecraft objects to scripts.

## Consequences

Positive:

- no Node.js/external process required on the game server
- `/reload` becomes the main edit/test loop
- game code can ship with datapack-like content
- Minecraft remains the renderer/input/world host
- TypeScript logic can be substantially cleaner and more testable than mcfunction logic

Negative/tradeoffs:

- runtime mod JAR becomes large because GraalJS and TypeScript are bundled
- script sandbox/resource governance becomes a runtime responsibility
- JS execution occurs in the Minecraft server process, so runaway scripts must be controlled
- TypeScript module resolution and tooling need explicit design work

An optional remote bridge may still be added later for languages or workloads that should run out-of-process.
