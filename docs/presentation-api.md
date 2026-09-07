# Presentation boundary and planned runtime capabilities

## Goal

Game rules should be portable TypeScript. They should not know about Minecraft-specific presentation primitives such as action bars, titles, boss bars, mannequins, item displays, block displays, text displays, particles, or sound resource identifiers.

The presentation boundary therefore has two layers:

```text
Game Core (portable TypeScript)
  |
  | semantic game state / presentation intent
  v
Game Presentation Adapter (TypeScript, backend-specific)
  |
  | stable runtime capabilities
  v
MC Game Runtime (Fabric)
  |
  v
Minecraft primitives
```

The current single-file script limitation means the Core and adapter may initially live in different sections/objects of the same `main.ts`. Once module loading exists they should become separate modules.

## Layer 1: game-facing TypeScript

This interface belongs to the game, not to the Fabric runtime. The Core should depend on something shaped like this and should be testable with a fake implementation.

```ts
type Vec3 = { x: number; y: number; z: number };

type ActorView = {
  appearance: string;        // semantic key, e.g. "hero", "chaser", "boss.golem"
  position: Vec3;
  yaw?: number;
  pitch?: number;
  roll?: number;
  scale?: number | Vec3;
};

type StatusView = {
  hp?: number;
  maxHp?: number;
  room?: number;
  text?: string;
};

type MessageView = {
  kind: "info" | "success" | "warning" | "danger";
  heading: string;
  body?: string;
  durationTicks?: number;
};

type ProgressView = {
  label: string;
  value: number;             // normalized 0..1
  kind?: "normal" | "danger" | "success";
};

interface GamePresentation {
  spawnActor(id: string, view: ActorView): void;
  updateActor(id: string, patch: Partial<ActorView>): void;
  removeActor(id: string): void;

  setStatus(playerId: string, status: StatusView): void;
  showMessage(playerId: string, message: MessageView): void;
  setProgress(playerId: string, id: string, progress: ProgressView | null): void;

  playAudio(cue: string, at?: Vec3): void;
  emitFx(cue: string, at: Vec3): void;
}
```

Examples of Core calls:

```ts
view.setStatus(playerId, { hp: player.hp, maxHp: player.maxHp, room: roomIndex + 1 });
view.showMessage(playerId, { kind: "danger", heading: "YOU DIED", body: "Restarting..." });
view.spawnActor("boss", {
  appearance: "boss.golem",
  position: boss.position,
  yaw: boss.yaw,
  scale: 3,
});
view.playAudio("player.hurt", player.position);
```

The Core does **not** contain strings such as `minecraft:entity.player.hurt`, `bossbar`, `title`, `item_display`, or `minecraft:paper`.

## Layer 2: Minecraft TypeScript adapter

The adapter translates semantic appearance/cue keys to runtime capabilities. Backend-specific resource identifiers are allowed here.

Conceptually:

```ts
const appearances = {
  hero: { kind: "character" },
  chaser: { kind: "character" },
  "boss.golem": {
    kind: "model",
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

A future web adapter can map the same semantic keys to sprites, DOM/CSS HUD, WebAudio, and canvas/WebGL effects without changing the Core.

## Planned Mod capability: `render`

`render` is the stable projection API that supersedes game code depending directly on the mannequin-oriented `actors` API. `actors` should remain as a compatibility API during migration.

Proposed script types:

```ts
type RenderVec3 = { x: number; y: number; z: number };
type RenderScale = number | RenderVec3;

type RenderVisual =
  | { kind: "character"; texture?: string }
  | { kind: "model"; model: string }
  | { kind: "block"; block: string }
  | { kind: "text"; text: UiText };

type RenderTransform = {
  dimension?: string;
  x: number;
  y: number;
  z: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  scale?: RenderScale;
  offset?: RenderVec3;
};

type RenderSmoothing = {
  positionTicks?: number;
  transformTicks?: number;
};

type RenderSpawnOptions = RenderTransform & {
  visual: RenderVisual;
  smoothing?: RenderSmoothing;
  billboard?: "fixed" | "vertical" | "horizontal" | "center";
};

type RenderUpdateOptions = Partial<RenderTransform> & {
  visual?: RenderVisual;
  smoothing?: RenderSmoothing;
  billboard?: "fixed" | "vertical" | "horizontal" | "center";
};

declare const render: {
  spawn(id: string, options: RenderSpawnOptions): void;
  update(id: string, options: RenderUpdateOptions): void;
  remove(id: string): void;
};
```

Runtime mapping for Minecraft 26.1:

- `character` -> mannequin (current actor implementation)
- `model` -> item display with an internal carrier ItemStack and `DataComponents.ITEM_MODEL = <model>`
- `block` -> block display
- `text` -> text display
- `scale`, `offset`, `roll`, transformation interpolation -> Display transformation data where supported
- `positionTicks` -> Display position/rotation interpolation duration
- `transformTicks` -> Display transformation interpolation duration
- `billboard` -> Display billboard constraint

The runtime owns all created entities and removes them on script unload/reload.

### Display smoothing experiment

Minecraft 26.1 exposes separate synced interpolation state for position/rotation and for display transformation. The first experiment should use a moving `model` visual at 20 Hz with:

1. no interpolation
2. `positionTicks: 1`
3. `positionTicks: 2`

The top-down fixed camera makes jitter and visual latency easy to compare. `1` tick is the preferred starting point because it can bridge consecutive 50 ms server samples without intentionally adding multiple ticks of lag. Scale/rotation animation can use a separate `transformTicks` value.

The Core must never depend on a particular smoothing value. This belongs in the Minecraft appearance catalog/adapter.

### Large boss composition

A large boss can start as one custom item-model display with `scale: 3`. More complex bosses should be composed by the adapter from several render nodes:

```text
boss/root     logical game actor (Core)
  -> boss/body    model display
  -> boss/weapon  model display
  -> boss/aura    optional FX
```

The Core still owns one `boss` entity. Render-node composition is presentation-only.

## Planned Mod capability: `ui`

Do not expose Minecraft names such as `actionbar`, `title`, or `bossbar` as the game-facing API. Expose semantic channels and let the Minecraft runtime choose the primitive.

```ts
type UiTone = "normal" | "muted" | "info" | "success" | "warning" | "danger";

type UiSpan = {
  text: string;
  tone?: UiTone;
  bold?: boolean;
};

type UiText = string | UiSpan[];

declare const ui: {
  // Stateful short status. Runtime keeps it alive until replaced/cleared.
  status(playerIdOrName: string, value: UiText | null): void;

  // Transient prominent message.
  message(playerIdOrName: string, options: {
    heading: UiText;
    body?: UiText;
    tone?: UiTone;
    durationTicks?: number;
  }): void;

  // Stateful normalized progress indicator. Null/removal hides it.
  progress(id: string, options: {
    players: string[];
    label: UiText;
    value: number;            // clamp to 0..1
    tone?: UiTone;
  }): void;
  removeProgress(id: string): void;
};
```

Initial Minecraft mapping:

- `ui.status` -> action bar, automatically refreshed by the runtime so scripts only update on state change
- `ui.message` -> title/subtitle timing
- `ui.progress` -> server boss bar

This mapping is explicitly an implementation detail. A later backend may render the same API differently.

## Existing capabilities and adapter policy

The current `effects.sound` and `effects.particle` APIs can remain runtime-level Minecraft capabilities for now. Portable Core code should call semantic adapter functions (`playAudio("player.hurt")`, `emitFx("enemy.hit")`) rather than resource identifiers directly.

Similarly, map mutation through `world.setBlock` is a backend/level-adapter concern. Core room logic should eventually say things such as `level.openGate("room1.exit")`, with the Minecraft adapter deciding which blocks to change.

`camera` and `input` are engine/platform boundaries by nature. The Core should consume normalized logical input and camera intent through a game adapter when portability matters, but no new Mod API is required for that separation today.

## Mod implementation order

1. Add `render.spawn/update/remove` with `character` and `model` first.
2. Implement `model` through item display, including scale, offset, yaw/pitch/roll, and position/transform interpolation.
3. Validate a large moving boss under the fixed top-down camera with 0/1/2 tick smoothing.
4. Add `block` and `text` render visuals using the same lifecycle/transform machinery.
5. Add stateful `ui.status`, transient `ui.message`, and stateful `ui.progress`.
6. Migrate the roguelike to a `GamePresentation` adapter; keep Core logic free of Minecraft identifiers.
7. Keep `actors` as compatibility until the example no longer depends on it.

This order gives the game a broad presentation vocabulary while minimizing future Mod changes.
