# ADR 0006: Expose server-observable semantic input actions

Status: accepted

## Context

The initial input API exposed only `ServerPlayer.getLastClientInput()`: movement, jump, sneak, and sprint. Games also need actions commonly bound to F, Q, mouse buttons, and hotbar selection, but the runtime must remain usable with an unmodified vanilla client.

A server-only mod cannot read arbitrary keyboard state. Vanilla sends protocol messages for gameplay actions, not physical keys, and some client-local keys such as ordinary E inventory open, Esc, Tab, F1, and F5 do not produce a usable server action.

## Decision

Keep held movement state from `getLastClientInput()` and additionally capture relevant vanilla serverbound gameplay packets in a server networking Mixin. Convert them into semantic per-player action counters. Each script compares its own counter baseline once per server tick and exposes the resulting rising-edge names through `pressedActions` and `input.pressed(player, action)`.

The public names describe actions rather than bindings: for example `swap_offhand`, `drop`, `attack`, `swing`, and `use`. Hotbar selection is exposed as zero-based `hotbarSlot`, `hotbarChanged`, and the `hotbar_changed` action. A slot change does not claim that a number key was pressed because the same packet can result from the mouse wheel.

## Consequences

- no client mod or custom payload is required
- player key rebinding continues to work because scripts consume semantic actions
- F/Q/mouse gameplay actions and hotbar changes are available to games
- arbitrary physical keys remain intentionally unavailable when vanilla does not transmit them
- packet actions are accumulated with per-player counters so multiple scripts can observe the same action without consuming it from each other
