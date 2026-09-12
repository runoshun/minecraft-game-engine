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

type PortableStateRef = { state: string };
type PortableInputRef = { input: string };
type PortableValue = number | PortableStateRef | PortableInputRef;
type PortableComparison = {
  op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
  left: PortableValue;
  right: PortableValue;
};
type PortableAabb = { x: PortableValue; y: PortableValue; width: number; height: number };
type PortableAction =
  | { op: "set" | "add" | "sub"; target: string; value: PortableValue }
  | { op: "negate"; target: string }
  | { op: "if"; condition: PortableComparison; then: PortableAction[]; else?: PortableAction[] }
  | { op: "if_aabb"; a: PortableAabb; b: PortableAabb; then: PortableAction[]; else?: PortableAction[] };
type PortableProgramSpecV1 = {
  version?: 1;
  fixedPoint?: number;
  state: Record<string, number>;
  tick: Exclude<PortableAction, { op: "if_aabb" }>[];
};
type PortableVanillaInputBindingV2 = { source: "first_player_hotbar_slot" };
type PortableVanillaInputSource =
  | "first_player_hotbar_slot"
  | "first_player_forward"
  | "first_player_backward"
  | "first_player_left"
  | "first_player_right"
  | "first_player_jump"
  | "first_player_sneak"
  | "first_player_sprint";
type PortableVanillaInputBinding = { source: PortableVanillaInputSource };
type PortableVanillaCoordinate = number | { state: string; base?: number };
type PortableVanillaBlockProjection = {
  id: string;
  dimension?: string;
  block: string;
  x: PortableVanillaCoordinate;
  y: PortableVanillaCoordinate;
  z: PortableVanillaCoordinate;
  scale?: number | { x: number; y: number; z: number };
  translation?: { x: number; y: number; z: number };
};
type PortableVanillaTextProjection = {
  id: string;
  dimension?: string;
  text: string;
  x: PortableVanillaCoordinate;
  y: PortableVanillaCoordinate;
  z: PortableVanillaCoordinate;
  scale?: number | { x: number; y: number; z: number };
  billboard?: "fixed" | "vertical" | "horizontal" | "center";
};
type PortableVanillaCamera = {
  id: string;
  dimension?: string;
  x: PortableVanillaCoordinate;
  y: PortableVanillaCoordinate;
  z: PortableVanillaCoordinate;
  yaw?: number;
  pitch?: number;
};
type PortableVanillaParticleEmitter = {
  id: string;
  dimension?: string;
  particle: string;
  x: PortableVanillaCoordinate;
  y: PortableVanillaCoordinate;
  z: PortableVanillaCoordinate;
  delta?: number | { x: number; y: number; z: number };
  speed?: number;
  count?: number;
  force?: boolean;
  when?: PortableComparison;
};
type PortableVanillaSoundEmitter = {
  id: string;
  dimension?: string;
  sound: string;
  x: PortableVanillaCoordinate;
  y: PortableVanillaCoordinate;
  z: PortableVanillaCoordinate;
  volume?: number;
  pitch?: number;
  when?: PortableComparison;
};
type PortableHudToken = { text: string } | { value: PortableValue };
type PortableVanillaHud = { id: string; tokens: PortableHudToken[] };
type PortableProgramSpecV2 = {
  version: 2;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: {
    inputs?: Record<string, PortableVanillaInputBindingV2>;
    projections?: PortableVanillaBlockProjection[];
  };
  tick: Exclude<PortableAction, { op: "if_aabb" }>[];
};
type PortableProgramSpecV3 = {
  version: 3;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: {
    inputs?: Record<string, PortableVanillaInputBinding>;
    projections?: PortableVanillaBlockProjection[];
    cameras?: PortableVanillaCamera[];
    particles?: PortableVanillaParticleEmitter[];
  };
  tick: Exclude<PortableAction, { op: "if_aabb" }>[];
};
type PortableProgramSpecV4 = {
  version: 4;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: {
    inputs?: Record<string, PortableVanillaInputBinding>;
    projections?: PortableVanillaBlockProjection[];
    texts?: PortableVanillaTextProjection[];
    cameras?: PortableVanillaCamera[];
    particles?: PortableVanillaParticleEmitter[];
    sounds?: PortableVanillaSoundEmitter[];
    huds?: PortableVanillaHud[];
  };
  tick: PortableAction[];
};
type PortableProgramSpec = PortableProgramSpecV1 | PortableProgramSpecV2 | PortableProgramSpecV3 | PortableProgramSpecV4;

declare const portable: {
  define(spec: PortableProgramSpec): void;
  get(state: string): number;
  raw(state: string): number;
  setInput(input: string, value: number): void;
  input(input: string): number;
};

type PortableDslComparable = {
  eq(value: PortableDslValue): PortableDslCondition;
  ne(value: PortableDslValue): PortableDslCondition;
  lt(value: PortableDslValue): PortableDslCondition;
  lte(value: PortableDslValue): PortableDslCondition;
  gt(value: PortableDslValue): PortableDslCondition;
  gte(value: PortableDslValue): PortableDslCondition;
};
type PortableDslState = PortableDslComparable & {
  readonly name: string;
  set(value: PortableDslValue): void;
  add(value: PortableDslValue): void;
  sub(value: PortableDslValue): void;
  negate(): void;
};
type PortableDslInput = PortableDslComparable & { readonly name: string };
type PortableDslValue = number | PortableDslState | PortableDslInput;
type PortableDslCondition = { readonly __portableDslCondition?: never };
type PortableDslCoordinate = number | PortableDslState | { readonly __portableDslCoordinate?: never };
type PortableDslInputBinding = { source: PortableVanillaInputSource };
type PortableDslBlockSpec = {
  dimension?: string;
  block: string;
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  scale?: number | { x: number; y: number; z: number };
  translation?: { x: number; y: number; z: number };
};
type PortableDslTextSpec = {
  dimension?: string;
  text: string;
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  scale?: number | { x: number; y: number; z: number };
  billboard?: "fixed" | "vertical" | "horizontal" | "center";
};
type PortableDslCameraSpec = {
  dimension?: string;
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  yaw?: number;
  pitch?: number;
};
type PortableDslParticleSpec = {
  dimension?: string;
  particle: string;
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  delta?: number | { x: number; y: number; z: number };
  speed?: number;
  count?: number;
  force?: boolean;
  when?: PortableDslCondition;
};
type PortableDslSoundSpec = {
  dimension?: string;
  sound: string;
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  volume?: number;
  pitch?: number;
  when?: PortableDslCondition;
};
type PortableDslBox = { readonly __portableDslBox?: never };
type PortableDslBoxSpec = { x: PortableDslValue; y: PortableDslValue; width: number; height: number };
type PortableDslHudSpec = { text: string | Array<string | PortableDslState | PortableDslInput> };
type PortableDsl = {
  state(name: string, initial: number): PortableDslState;
  input(name: string, initial?: number, binding?: PortableDslInputBinding): PortableDslInput;
  tick(callback: () => void): void;
  when(condition: PortableDslCondition, thenCallback: () => void, elseCallback?: () => void): void;
  box(id: string, spec: PortableDslBoxSpec): PortableDslBox;
  whenColliding(a: PortableDslBox, b: PortableDslBox, thenCallback: () => void, elseCallback?: () => void): void;
  at(state: PortableDslState, base?: number): PortableDslCoordinate;
  block(id: string, spec: PortableDslBlockSpec): void;
  text(id: string, spec: PortableDslTextSpec): void;
  camera(id: string, spec: PortableDslCameraSpec): void;
  particle(id: string, spec: PortableDslParticleSpec): void;
  sound(id: string, spec: PortableDslSoundSpec): void;
  hud(id: string, spec: PortableDslHudSpec): void;
};

declare function portableDsl(build: (game: PortableDsl) => void): void;
declare function portableDsl(options: { fixedPoint?: number }, build: (game: PortableDsl) => void): void;

declare const game: {
  onStart(callback: () => void): void;
  onBeforeTick(callback: (ctx: { tick: number }) => void): void;
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
  hud(playerIdOrName: string, text: UiText | null): void;
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
  particle(options: {
    dimension?: string;
    particle: string;
    x: number;
    y: number;
    z: number;
    delta?: { x?: number; y?: number; z?: number };
    speed?: number;
    count?: number;
    force?: boolean;
  }): void;
  sound(options: { dimension?: string; sound: string; x: number; y: number; z: number; volume?: number; pitch?: number }): void;
};
