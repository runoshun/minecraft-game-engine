# Presentation boundary and runtime capabilities

## Goal

Game rules should stay portable TypeScript. They should not depend on Minecraft-specific primitives such as mannequins, display entities, scoreboard objectives, dialogs, chest menus, particle identifiers, or sound identifiers.

The presentation boundary has two layers:

```text
Game Core (portable TypeScript)
  |
  | semantic presentation intent
  v
Game Presentation Adapter (TypeScript, Minecraft-specific)
  |
  | stable runtime capabilities
  v
MC Game Runtime (Fabric)
  |
  v
Minecraft primitives
```

The current single-file limitation means the Core and adapter may initially be separate objects/sections in the same `main.ts`. When module loading is added, they should become separate modules.

## Game-facing TypeScript

The game should own an interface expressed in semantic concepts. One possible shape is:

```ts
type Vec3 = { x: number; y: number; z: number };

type ActorView = {
  appearance: string; // e.g. "hero", "chaser", "boss.golem"
  position: Vec3;
  yaw?: number;
  pitch?: number;
  roll?: number;
  scale?: number | Vec3;
};

type PanelView = {
  title: string;
  rows: Array<{ id: string; label: string; value?: string }>;
};

type MenuView = {
  id: string;
  kind: "items" | "choice";
  title: string;
  entries: Array<{ id: string; label: string; description?: string }>;
};

interface GamePresentation {
  spawnActor(id: string, view: ActorView): void;
  updateActor(id: string, patch: Partial<ActorView>): void;
  removeActor(id: string): void;

  setPanel(playerId: string, panel: PanelView | null): void;
  openMenu(playerId: string, menu: MenuView): void;
  closeMenu(playerId: string, menuId?: string): void;

  playAudio(cue: string, at?: Vec3): void;
  emitFx(cue: string, at: Vec3): void;
}
```

The Core should use semantic appearance, audio, FX, item, and action keys. It should not contain strings such as `minecraft:item_display`, `minecraft:diamond`, `minecraft:entity.player.hurt`, or scoreboard/dialog implementation details.

## Minecraft TypeScript adapter

The Minecraft adapter maps semantic keys to runtime capabilities and Minecraft resources. Resource identifiers are intentionally allowed in this layer.

```ts
const appearances = {
  hero: { kind: "character" as const },
  chaser: { kind: "character" as const },
  "boss.golem": {
    kind: "model" as const,
    model: "topdown:boss/golem",
    scale: 3,
    smoothing: { positionTicks: 1, transformTicks: 2 },
  },
};

const audio = {
  "player.hurt": "minecraft:entity.player.hurt",
  "room.clear": "minecraft:ui.toast.challenge_complete",
};
```

A future web/debug adapter can map the same semantic keys to sprites, DOM/CSS, WebAudio, or canvas/WebGL without changing the Core.

## Runtime capability: `render`

`render` is the generic world-space projection API. The older mannequin-oriented `actors` API remains for compatibility.

```ts
type RenderVec3 = { x: number; y: number; z: number };
type RenderScale = number | RenderVec3;

type UiTone = "normal" | "muted" | "info" | "success" | "warning" | "danger";
type UiSpan = { text: string; tone?: UiTone; bold?: boolean };
type UiText = string | UiSpan[];

type RenderVisual =
  | { kind: "character"; texture?: string }
  | { kind: "model"; model: string }
  | { kind: "block"; block: string }
  | { kind: "text"; text: UiText };

type RenderSmoothing = {
  positionTicks?: number;  // 0..100
  transformTicks?: number; // 0..100
};

type RenderSpawnOptions = {
  visual: RenderVisual;
  dimension?: string;
  x: number;
  y: number;
  z: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  scale?: RenderScale;
  offset?: RenderVec3;
  smoothing?: RenderSmoothing;
  billboard?: "fixed" | "vertical" | "horizontal" | "center";
};

type RenderUpdateOptions = Partial<Omit<RenderSpawnOptions, "visual">> & {
  visual?: RenderVisual;
};

declare const render: {
  spawn(id: string, options: RenderSpawnOptions): void;
  update(id: string, options: RenderUpdateOptions): void;
  remove(id: string): void;
  attach(childId: string, parentId: string, offset: RenderVec3): void;
  detach(childId: string): void;
};
```

Minecraft 26.1 mapping:

- `character` -> mannequin
- `model` -> item display with an internal paper carrier and `DataComponents.ITEM_MODEL`
- `block` -> block display
- `text` -> text display
- `scale`, `offset`, `roll`, `transformTicks` -> Display transformation state
- `positionTicks` -> Display position/rotation interpolation duration
- `billboard` -> Display billboard constraint

Display private setters are reached through Fabric Mixin invokers; scripts still receive no Java objects or unrestricted host access.

`render.attach(child, parent, offset)` is intentionally a translation-follow relationship, suitable for labels, overhead bars, and simple child projections. The runtime mirrors the child's logical world position and dimension from the parent node every tick; this does not require either backing Minecraft entity to be present. Removing a parent recursively removes attached descendants. It is not currently a full hierarchical rotation/scale transform graph.

Character projections currently use entity position/yaw/pitch. Display-only transform features such as arbitrary scale, roll, billboard, and transformation interpolation should be used with `model`, `block`, or `text` visuals.

### Display smoothing

Logical game coordinates remain authoritative in TypeScript. Display interpolation only changes client presentation.

Recommended starting point for a moving top-down actor:

```ts
smoothing: {
  positionTicks: 1,
  transformTicks: 2,
}
```

`positionTicks: 1` is intended to bridge consecutive 20 Hz server samples without intentionally adding multiple ticks of visual latency. Smoothing values belong in the Minecraft presentation adapter, not in Core gameplay rules.

### Large bosses and overhead UI

A large boss can be one custom item-model display:

```ts
render.spawn("boss", {
  visual: { kind: "model", model: "topdown:boss/golem" },
  x: 0.5,
  y: 101,
  z: 20.5,
  scale: 3,
  smoothing: { positionTicks: 1, transformTicks: 2 },
});
```

Overhead text can follow the boss without Core code knowing about text displays:

```ts
render.spawn("boss_label", {
  visual: { kind: "text", text: "GOLEM" },
  x: 0.5,
  y: 105,
  z: 20.5,
  billboard: "center",
});
render.attach("boss_label", "boss", { x: 0, y: 4, z: 0 });
```

An HP bar can be composed from one background Display and one foreground Display whose X scale reflects normalized HP. That composition belongs in the Minecraft adapter.

## Runtime capability: `ui.panel`

The only persistent screen HUD channel currently exposed is a semantic panel:

```ts
type UiPanelRow = {
  id: string;
  label: UiText;
  value?: UiText;
};

declare const ui: {
  panel(
    playerIdOrName: string,
    options: { title: UiText; rows: UiPanelRow[] } | null,
  ): void;
};
```

Minecraft implementation:

- rendered as the scoreboard sidebar
- per-player, packet-only projection
- does **not** create or persist objectives in the authoritative server scoreboard
- does **not** store gameplay state
- supports up to 15 rows, matching the sidebar display limit
- row identity is stable through `row.id`, and updates send only changed/removed score packets
- `null` removes the panel
- reconnecting players receive the current panel again while the script remains active

This avoids polluting the world scoreboard and keeps scoreboard values as presentation only. The sidebar is still a single vanilla HUD channel, so another plugin/datapack/client scoreboard update can replace it while active.

Example adapter call:

```ts
ui.panel(playerId, {
  title: "DUNGEON",
  rows: [
    { id: "hp", label: "HP", value: `${player.hp} / ${player.maxHp}` },
    { id: "gold", label: "GOLD", value: `${run.gold}` },
    { id: "room", label: "ROOM", value: `${roomIndex + 1} / ${rooms.length}` },
  ],
});
```

Hearts, hunger, and the XP bar are deliberately not exposed as UI channels. The current fixed-camera game uses Spectator mode, where those normal survival HUD elements are not rendered.

## Runtime capability: `menu`

`menu` is the interactive UI capability used for shops, reward chests, choices, and confirmations. Game Core should still use semantic menu/action IDs through its adapter.

```ts
type MenuEntry = {
  id: string;          // action id returned to TypeScript
  label: UiText;
  description?: UiText;

  // item-menu presentation fields
  slot?: number;       // 0..53
  item?: string;       // Minecraft adapter resource, default minecraft:paper
  model?: string;      // optional ITEM_MODEL resource
  count?: number;      // 1..64

  // choice-dialog presentation field
  width?: number;
};

type MenuSpec = {
  id: string;
  kind: "items" | "choice";
  title: UiText;
  body?: UiText;
  rows?: number;       // items: 1..6
  columns?: number;    // choice: 1..4
  entries: MenuEntry[];
};

type MenuActionEvent = {
  playerId: string;
  playerName: string;
  menuId: string;
  actionId: string;
};

declare const menu: {
  onAction(callback: (event: MenuActionEvent) => void): void;
  open(playerIdOrName: string, spec: MenuSpec): void;
  update(playerIdOrName: string, spec: MenuSpec): void;
  close(playerIdOrName: string, menuId?: string): void;
};
```

### `kind: "items"`

Implemented with a virtual vanilla chest menu (`GENERIC_9x1` through `GENERIC_9x6`). No block or container is placed in the world.

The displayed ItemStacks are UI tokens only:

- clicking a UI slot emits `menu.onAction`
- the player cannot pick up or move those display items
- player-inventory manipulation is ignored while this menu is open
- the game decides what a purchase/reward does after receiving the action event

This is suitable for shops, loot/reward selection, upgrades, and item grids.

### `kind: "choice"`

Implemented with Minecraft 26.1 `MultiActionDialog`. Each button uses a runtime-owned custom click action token. A server-side packet hook validates the player/token and converts the click into the same `menu.onAction` event used by item menus.

This is suitable for NPC choices, confirmation flows, simple stage selection, and compact option lists.

`menu.update` currently replaces/reopens the active menu with the new spec. It is an upsert-style convenience API, not an in-place widget diff protocol.

## Existing capabilities and adapter policy

`effects.sound` and `effects.particle` remain low-level Minecraft capabilities. Portable Core code should call semantic adapter functions such as `playAudio("player.hurt")` and `emitFx("enemy.hit")` rather than Minecraft resource IDs directly.

`world.setBlock` is similarly a platform/level capability. Core room logic should prefer semantic operations such as `level.openGate("room1.exit")`, with the Minecraft adapter deciding which blocks to mutate.

`camera` and `input` are engine/platform boundaries. No additional Minecraft-specific concepts need to leak into Core gameplay state.

## Lifecycle and ownership

All `render` entities are script-owned and removed on `/reload`, script failure, or server stop. Attached render descendants are removed recursively with their parent.

`ui.panel` packet state, open `menu` state, and dialog custom-click tokens are also script-owned. They are cleared when the script closes so a reloaded script cannot receive stale UI actions from the previous instance.

## Validation status

For 0.2.0, a standalone Fabric 26.1 dev-server smoke test executed:

- block display spawn with scale and 1/2-tick smoothing
- text display spawn with styled text and center billboard
- item display spawn using `ITEM_MODEL`
- `render.attach` label-follow relationship
- position, scale, and roll updates

The script reached both `PRESENTATION_SMOKE_START` and `PRESENTATION_SMOKE_UPDATED` without render/Mixin errors.

That local dev environment needed extra heap for the embedded TypeScript compiler. Main-server deployment of 0.2.0 then showed that applying the normal 100 ms budget to cold script evaluation/`onStart` could falsely disable a game after restart. Runtime 0.2.1 therefore keeps the 100 ms hard budget for normal ticks but gives script evaluation and `onStart` a 1000 ms startup budget. Main-server 0.2.0-0.2.2 testing also showed that trying to persist/reacquire Display entities couples projection correctness to asynchronous entity-chunk loading. Runtime 0.2.3 instead keeps `RenderNode` state authoritative, marks backing render entities non-persistent, materializes them only when the target chunk is already loaded, and recreates them after unload. `ui.panel` and menu open paths are validated on the main server; semantic container/Dialog click delivery still requires a client automation path that can activate GUI controls.
