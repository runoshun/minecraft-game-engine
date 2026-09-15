# ADR 0031: Expand bounded native-dialog UI in Portable IR v21

## Status

Accepted and implemented. Focused mod-free Minecraft 26.1 validation passed on `second` with real client `Camera`.

## Context

Portable v20 deliberately exposes only static multi-action selections. Minecraft 26.1 native dialogs can express richer static text components, item body elements, confirmation screens, and typed input controls. The retained JRPG and shop/menu use cases benefit from those capabilities without requiring inventory GUI ownership or client mods.

The vanilla transport boundary is stricter than the visual dialog schema. A non-operator vanilla player can safely return an integer through compiler-owned `trigger` objectives. `minecraft:dynamic/run_command` can substitute input values into that trigger command. Boolean and single-option controls can therefore emit compiler-selected integer transport codes, and an integer `number_range` can emit its displayed integer value. Free-form text cannot be returned through `trigger`, and `minecraft:custom` / `minecraft:dynamic/custom` payloads have no vanilla-server datapack handler. Executing higher-permission commands from dialog actions would violate the vanilla-client/permission-0 contract and may show command-confirmation UI. V21 therefore does not pretend arbitrary text input is portable when the vanilla host cannot deliver it to game rules.

## Decision

Portable IR v21 extends the v20 dialog boundary in four directions while keeping commands, raw dialog JSON, arbitrary click events, and custom packets compiler-private.

### Static rich text

Dialog titles, body text, option/confirmation/form button labels, tooltips, input labels, and item descriptions may use a bounded static rich-text value:

```ts
type RichText = string | TextSpan | Array<string | TextSpan>;
type TextSpan = {
  text: string;
  color?: NamedColor | `#${string}`;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
};
```

No score/selector/NBT components, hover/click events, arbitrary component objects, custom fonts, or dynamic game-state substitution are exposed in v21. This keeps dialog resources compile-time deterministic and prevents rich text from becoming a raw command/event escape hatch.

### Body elements and item display

V21 selection, confirmation, and form dialogs may use a bounded body list containing:

- `text` — static rich text with a bounded width;
- `item` — a static item id/count with optional rich-text description, tooltip/decorations flags, and bounded layout width/height.

Item components/NBT are not exposed in v21. Item body elements are presentation only and do not grant or mutate items.

### Native confirmation

`game.confirmation(id, spec)` declares a native `minecraft:confirmation` dialog. It returns the same declaration class accepted by `player.selection(...)`, so result lifecycle and v20 fixed-point choice semantics remain unchanged. `yes` and `no` each provide a rich label, optional tooltip, and distinct non-zero result value. Escape follows Minecraft's native confirmation `no` action.

Confirmation declarations share the existing eight-slot v20 selection objective bank and aggregate selection/confirmation count.

### Typed single-input forms

`game.form(id, spec)` declares one native form with exactly one compiler-owned input control. `player.form(form)` returns a lexical player-local comparable result handle with `open()` and `clear()`.

V21 supports three input kinds:

```ts
{ type: "boolean", label, initial?, trueValue?, falseValue? }
{ type: "option", label, options: [{ label, value }...], initial? }
{ type: "range", label, start, end, step?, initial?, width? }
```

Boolean defaults to logical `1` / `0`. Option values are arbitrary distinct fixed-point-safe logical numbers. Range start/end/step/initial are integers; the resolved logical value is the selected integer converted to the program fixed-point representation by generated server-side commands. Cancel defaults to logical `-1` and must not collide with a possible resolved input value.

A form has one input rather than a generic list because the permission-0 vanilla return channel is one `/trigger` integer per submit. Multi-field forms would require fragile packing rules or a higher-permission/custom-packet transport and are deferred.

Free-form `minecraft:text` controls are not exposed as readable Portable values in v21. The client can render such a field, but a vanilla datapack cannot receive its arbitrary string through the permission-0 trigger channel. This is a host limitation, not a missing parser branch. A future server/plugin/mod transport may add text forms under a separate capability decision.

### Form result lifecycle and lowering

Each form receives two namespace-derived player objectives with stable slots sorted by form id:

1. a `trigger` transport objective used only by the native dialog submit/cancel action;
2. a dummy fixed-point result objective read by Portable game rules.

The complete eight-slot bank of each objective kind is compiler-owned so renamed/deleted forms are cleaned deterministically.

Internal transport uses two reserved signed-int sentinels plus one cancel transport code. `open()` only opens an idle form, sets its transport to pending, enables the trigger, and shows the generated dialog. `minecraft:dynamic/run_command` submits boolean/option/range data through `trigger <transport> set $(v)`. Generated tick prelude maps the transport code/value into the declared fixed-point result and rearms the transport objective. The resolved result remains readable until `clear()` restores the result sentinel. Logical zero is therefore a valid form result.

Opening any v21 form rearms other pending forms and pending v20/v21 selections for that player before replacing the visible dialog. Opening a v21 selection/confirmation likewise rearms pending forms. Minecraft still has one current dialog screen per client.

### Bounds

V21 keeps v20 at most 8 selection/confirmation declarations and adds at most 8 form declarations. A form has exactly one input. Option forms have 1..16 options. Range forms use integer endpoints/steps that remain valid signed 32-bit transport values and whose fixed-point results remain signed 32-bit. Dialog bodies contain at most 16 elements.

Rich text is bounded to at most 32 spans per component, each literal at most 256 characters. Existing v20 string limits remain accepted. Body widths use Minecraft's 1..1024 range; item element width/height use 1..256.

### Generated resources and lifecycle

V21 keeps registry resources under `data/<namespace>/dialog/portable/...`. Selection/confirmation resources are generated under `portable/selection/`; forms under `portable/form/`.

Dialog registry deployment follows the v20 operational contract: installation/replacement/removal that changes generated dialog resources requires old-pack cleanup where applicable, file replacement/removal, then server/world restart so the registry is bootstrapped before functions reference the new ids. Ordinary `/reload` remains an active-instance lifecycle operation once the registry contents are already present from startup.

`portable/cleanup` clears a pending visible generated dialog, removes the complete selection and form objective banks, and leaves external teams and gamemode untouched. V21 dialog/form state is active-instance state, not persistent state.

## Consequences

- Shops and dialogue screens can show styled text and item icons without exposing raw text-component JSON.
- Destructive/important choices can use the native two-button confirmation layout.
- Boolean toggles, bounded option pickers, and integer sliders become readable player-local Portable values with vanilla clients and no elevated permission.
- Arbitrary text entry remains explicitly unsupported rather than being implemented through an unsafe or non-functional transport.
- Generic multi-field forms, item components/NBT, dynamic dialog text, arbitrary click actions, dialog graphs, inventory GUI ownership, custom packets, and persistent form state remain separate capabilities.

## Acceptance gate

1. Node tests cover rich-text/body validation, item lowering, native confirmation lowering, all three form input kinds, form result fixed-point conversion, zero-valued form results, cancel, scope escape, objective stability, cleanup, and bounds.
2. Retained v1-v20 examples compile byte-for-byte identically to pre-v21 commit `b000162`.
3. A checked-in v21 acceptance example renders rich styled text plus an item body in a real Minecraft 26.1 client.
4. The real client resolves one native confirmation path and boolean, option, and integer-range form submissions into expected authored player-local fixed-point state.
5. Form cancel, repeated `open()` while pending, dialog replacement between selection/form surfaces, `/reload`, and cleanup lifecycle are exercised.
6. Text input remains rejected by the Portable v21 API/docs with the vanilla permission-0 transport limitation documented.
7. Final teardown leaves no temporary objectives, teams, or acceptance datapacks.

## Acceptance result

Implemented and accepted in this change. The Node regression suite is 35/35 green, including rich-text/body validation, item lowering, confirmation, boolean/option/range forms, logical-zero result mapping, cancel, objective stability, replacement, cleanup, bounds, and rejection of unsupported text input. Sixteen retained v1-v20 examples compile byte-for-byte identically to pre-v21 commit `b000162`.

The checked-in `examples/portable-dialog-ui` pack was deployed to mod-free Minecraft 26.1 `second` and bootstrapped by server restart. Real client `Camera` rendered the styled `Arcane Purchase` confirmation with mixed-color text, diamond-sword item body/tooltip, and authored actions; the `Leave` path resolved logical `-10`. Real-client form submissions resolved boolean `1`, option `Mage=3`, and integer range `3` into authored player-local fixed-point state. Option/range cancel paths resolved logical `-1`. The acceptance source repeatedly called `open()` while armed; pending state remained stable. Replacing pending `hints` with `role` rearmed the old transport to idle and left only the new form pending.

After registry bootstrap, ordinary `/reload` reset stage/result/transport active-instance state while preserving external `v21_party` membership. `portable/cleanup` executed from a pending confirmation removed every generated objective while preserving that team. Final teardown removed the team and acceptance pack, restarted the server to remove registry entries, and left zero objectives, zero teams, and only vanilla enabled; the two pre-existing video packs remained disabled/available. Text input remains rejected and documented as outside the permission-0 integer trigger transport boundary.
