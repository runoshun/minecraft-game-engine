type McGameInputAction =
  | "forward" | "backward" | "left" | "right" | "jump" | "sneak" | "sprint"
  | "attack" | "swing" | "use" | "swap_offhand" | "drop" | "drop_stack" | "use_release"
  | "destroy_start" | "destroy_abort" | "destroy_stop" | "stab" | "pick"
  | "vehicle_inventory" | "riding_jump_start" | "riding_jump_stop" | "fall_flying_start"
  | "hotbar_changed";

type McGamePlayerInput = {
  id: string;
  name: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
  jumpPressed: boolean;
  sneakPressed: boolean;
  sprintPressed: boolean;
  hotbarSlot: number;
  hotbarChanged: boolean;
  pressedActions: McGameInputAction[];
};

type McGamePosition = {
  dimension?: string;
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  pitch?: number;
};

type UiTone = "normal" | "muted" | "info" | "success" | "warning" | "danger";
type UiSpan = { text: string; tone?: UiTone; bold?: boolean };
type UiText = string | UiSpan[];

type RenderVec3 = { x: number; y: number; z: number };
type RenderScale = number | RenderVec3;
type RenderVisual =
  | { kind: "character"; texture?: string }
  | { kind: "model"; model: string }
  | { kind: "block"; block: string }
  | { kind: "text"; text: UiText };

type RenderSmoothing = {
  positionTicks?: number;
  transformTicks?: number;
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

type UiPanelRow = {
  id: string;
  label: UiText;
  value?: UiText;
};

type MenuEntry = {
  id: string;
  label: UiText;
  description?: UiText;
  slot?: number;
  item?: string;
  model?: string;
  count?: number;
  width?: number;
};

type MenuSpec = {
  id: string;
  kind: "items" | "choice";
  title: UiText;
  body?: UiText;
  rows?: number;
  columns?: number;
  entries: MenuEntry[];
};

type MenuActionEvent = {
  playerId: string;
  playerName: string;
  menuId: string;
  actionId: string;
};

declare const game: {
  onStart(callback: () => void): void;
  onTick(callback: (ctx: { tick: number }) => void): void;
  log(...values: unknown[]): void;
};

declare const input: {
  players(): McGamePlayerInput[];
  get(playerIdOrName: string): McGamePlayerInput | null;
  pressed(playerIdOrName: string, action: McGameInputAction): boolean;
};

declare const actors: {
  spawn(id: string, options: McGamePosition & { texture?: string; entityType?: string }): void;
  move(id: string, options: McGamePosition): void;
  remove(id: string): void;
};

declare const render: {
  spawn(id: string, options: RenderSpawnOptions): void;
  update(id: string, options: RenderUpdateOptions): void;
  remove(id: string): void;
  attach(childId: string, parentId: string, offset: RenderVec3): void;
  detach(childId: string): void;
};

declare const ui: {
  panel(playerIdOrName: string, options: { title: UiText; rows: UiPanelRow[] } | null): void;
};

declare const menu: {
  onAction(callback: (event: MenuActionEvent) => void): void;
  open(playerIdOrName: string, spec: MenuSpec): void;
  update(playerIdOrName: string, spec: MenuSpec): void;
  close(playerIdOrName: string, menuId?: string): void;
};

declare const camera: {
  attach(playerIdOrName: string, options: McGamePosition): void;
  move(playerIdOrName: string, options: McGamePosition): void;
  detach(playerIdOrName: string): void;
};

type McGameBlockWrite = { x: number; y: number; z: number; block: string };

declare const world: {
  setBlock(options: { dimension?: string; x: number; y: number; z: number; block: string }): void;
  setBlocks(options: { dimension?: string; blocks: McGameBlockWrite[] }): void;
  fill(options: { dimension?: string; fromX: number; fromY: number; fromZ: number; toX: number; toY: number; toZ: number; block: string }): void;
};

declare const effects: {
  particle(options: { dimension?: string; particle: string; x: number; y: number; z: number }): void;
  sound(options: { dimension?: string; sound: string; x: number; y: number; z: number; volume?: number; pitch?: number }): void;
};
