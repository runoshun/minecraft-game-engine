# ADR 0030: Add bounded interactive selection UI in Portable IR v20

## Status

Accepted and implemented. Portable v20 compiler support, backward-output parity, and focused Minecraft 26.1 native-dialog validation passed on the mod-free `second` environment.

## Context

Portable v19 can render passive world text, actionbars, and one global sidebar, and can sample held player keys. That is sufficient for movement and compact status display but is an awkward semantic boundary for dialogue choices, shops, confirmations, and menus. Games such as the retained JRPG currently synthesize selection UIs from world text plus left/right/jump conventions.

Minecraft Java 1.21.6+ provides datapack-defined `minecraft:dialog` resources, including `minecraft:multi_action`, and the `dialog show <targets> <dialog>` command. Static dialog actions may run ordinary click actions. A vanilla `trigger` scoreboard objective is permission-0 and therefore gives generated datapacks a bounded player-to-server result channel without exposing raw commands or requiring a client mod.

The portable contract should model a bounded choice, not Minecraft dialog JSON, arbitrary click events, commands, inventory slots, packet events, or generic forms.

## Decision

Portable IR v20 adds global **selection declarations** with player-local result handles.

### Authoring API

```ts
const shop = game.selection("shop", {
  title: "Shop",
  body: "Choose an item",
  options: [
    { label: "Potion - 5G", value: 1 },
    { label: "Sword - 12G", value: 2 },
    { label: "Leave", value: 3 },
  ],
  cancel: { label: "Cancel", value: -1 },
  columns: 1,
});

game.tick(() => {
  game.forEachPlayer(game.players(), player => {
    const choice = player.selection(shop);
    game.when(player.input.jump.eq(1), () => choice.open());
    game.when(choice.eq(1), () => {
      // game-specific response
      choice.clear();
    });
    game.when(choice.eq(-1), () => choice.clear());
  });
});
```

`game.selection(id, spec)` is a compile-time declaration. `player.selection(selection)` is lexical to PlayerContext and returns a player-local comparable value with `open()` and `clear()` actions. The handle may be read anywhere an ordinary player-local scalar may be read, including conditions, player HUD tokens, and read-only reduction selectors. It may not escape its PlayerContext.

Selection text is static in v20: `title`, optional `body`, option labels/tooltips, and cancel label are compile-time strings. Dynamic text inputs/forms are deliberately deferred.

### Result lifecycle

Each player/selection handle has three internal states:

- **idle** — initialized and rearmed by `clear()`; represented by a compiler-private raw sentinel;
- **pending** — `open()` has shown the dialog and result is raw zero;
- **resolved** — an option or cancel action has written its declared non-zero fixed-point value.

`open()` is idempotent while the handle is pending or resolved. It only transitions an idle handle to pending, enables its trigger objective, and shows the dialog. This prevents a level-triggered `open()` call from replacing the same dialog every tick and making button interaction impossible.

`clear()` closes the dialog only if that selection is currently pending, then returns the handle to idle. A resolved result remains readable until the author calls `clear()`.

Opening one selection automatically returns any *other pending selection* for that player to idle before showing the new dialog, because Minecraft has one current dialog screen per client.

Option/cancel logical values must scale to distinct signed 32-bit fixed-point values. Raw zero and the internal idle sentinel are reserved. `cancel` defaults to label `Cancel` and logical value `-1`; the parser rejects collisions with option values.

### Bounds

V20 supports at most:

- 8 selection declarations per program;
- 16 options per selection;
- 4 columns per selection.

Titles are limited to 128 characters, body text to 1024, option/cancel labels to 128, and tooltips to 256. These are portable compiler limits rather than a promise to expose every Minecraft dialog layout control.

### Vanilla lowering

Each declared selection receives one namespace-derived trigger objective with a stable slot chosen from sorted selection ids. The complete possible eight-objective bank is known so reload/cleanup can remove renamed/deleted selections without discovering runtime state.

Generated dialog resources live under:

```text
data/<namespace>/dialog/portable/selection/<id>.json
```

Each resource is a `minecraft:multi_action` dialog with `pause: false`, `after_action: "close"`, static body text, option buttons, and an exit/cancel action. Buttons perform only:

```text
trigger <compiler-owned-objective> set <raw-result>
```

The portable source cannot supply the command string, objective name, dialog resource id, or arbitrary click action.

`selection_open` lowering runs only from PlayerContext. It resets the selected trigger score to pending, enables the trigger, and executes `dialog show @s <generated-resource>`. `selection_clear` conditionally executes `dialog clear @s` only while that selection is pending, then restores its idle sentinel.

### Lifecycle and ownership

Selection trigger objectives and generated dialog resources are compiler-owned active-instance resources. `/reload` recreates the trigger bank and player initialization resets handles to idle. `portable/cleanup` clears a visible dialog only for players whose generated selection score is pending, removes the complete v20 selection objective bank, and leaves external teams/player gamemode untouched.

V20 selection state is not persistent state and does not survive reload/replacement. Minecraft 26.1 dialog definitions are registry data: the focused gate proved that adding a new generated dialog pack to an already-running server and issuing only `/reload` leaves the new dialog id unavailable while functions are parsed. A server/world restart with the pack already present bootstraps the dialog registry; subsequent ordinary `/reload` of that already-bootstrapped pack works and resets active-instance selection state. Therefore installation, replacement, or removal that changes generated dialog registry resources must run `portable/cleanup`, replace/remove the pack directory, then restart the server/world before using the new registry contents.

### Scope exclusions

V20 does not add free-form text/number/boolean inputs, dynamic dialog text, arbitrary click events, arbitrary commands, inventory/container GUI ownership, custom packets, quick-action/pause-screen registration, runtime-created menus, nested dialog graphs, or persistent selection state.

## Consequences

- Dialogue, shop, menu, and confirmation choices have a first-class vanilla-client surface instead of key-binding conventions.
- Selection results are player-local and naturally work with team/session PlayerContexts without adding session-owned UI registries.
- The trigger channel is an implementation detail and not an anti-cheat/security boundary; game authors do not receive the objective or command surface.
- Static text and bounded options keep generated resources deterministic and make lifecycle cleanup tractable.
- Rich form input remains a separate future capability rather than expanding v20 into a generic dialog wrapper.

## Acceptance gate

1. Node tests cover DSL/IR parsing, bounds, scope escape, fixed-point result values, idempotent open/clear lowering, stable objective naming, generated dialog JSON, and cleanup.
2. Retained v1-v19 examples compile byte-for-byte identically to pre-v20 commit `a2d324c`.
3. A checked-in v20 acceptance example displays a real Minecraft 26.1 dialog to a vanilla client.
4. Native real-client UI interaction resolves one option path and one Escape/cancel path into the expected player-local results without held-key selection logic.
5. Repeated `open()` while pending does not replace/reset the dialog result.
6. `/reload` resets selection handles to idle and normal cleanup removes selection objectives while external team membership survives.
7. Final teardown leaves no temporary objectives, teams, or acceptance datapacks.

## Acceptance result

The gate passed with `examples/portable-selection-ui` and the Node regression suite 31/31 green. Fifteen retained v1-v19 checked-in examples were compiled with both v20 and pre-v20 commit `a2d324c`; the generated datapacks were byte-for-byte identical.

On mod-free Minecraft 26.1 `second`, the acceptance pack was first copied into the running world and `/reload` was intentionally attempted. Minecraft rejected the generated function reference because the new `portable_selection_ui:portable/selection/shop` id was not yet present in the `minecraft:dialog` registry. Restarting the server with the pack already present registered the dialog cleanly, created the compiler-owned trigger/player objective bank, and made `dialog show ... shop` resolve. This establishes server/world restart, not reload-only deployment, as the deterministic registry bootstrap path for v20 dialog-resource changes.

Real client `Camera` in externally managed team `v20_party` rendered the generated `Portable Shop` native dialog with Potion, Sword, and Cancel controls. While the example intentionally called `choice.open()` every tick, the pending trigger score remained raw `0` for multiple ticks and the screen remained actionable, proving the idle-to-pending guard prevents repeated replacement. In one real-client input sequence, Jump reopened the menu and a mouse click selected Potion; the compiler-owned trigger emitted raw `1000`, authored rules copied logical choice `1` to `lastChoice`, disabled the menu, and rearmed the selection to the idle sentinel. A second real-client sequence used Jump then Escape and produced raw/logical `-1000 / -1` through the generated cancel exit action.

An ordinary `/reload` after registry bootstrap succeeded with no datapack problems, preserved the external team, reset `lastChoice` to raw `0`, reset `menuEnabled` to raw `1000`, reinitialized the selection handle, and the authored level-triggered open moved it to pending raw `0`. `portable/cleanup` then closed the pending dialog, removed every generated objective including the complete eight-slot selection bank, and left `v20_party` membership intact. Final teardown removed the team and pack and restarted the server to remove the dialog registry resource; the final state had zero objectives, zero teams, and only vanilla enabled.
