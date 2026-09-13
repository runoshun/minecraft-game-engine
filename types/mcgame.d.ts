/**
 * Build-time declarations for the portable TypeScript compiler.
 * Java/Fabric host-runtime APIs were retired; only portable IR/DSL authoring remains.
 */

type PortableStateRef = { state: string };
type PortableInputRef = { input: string };
type PortableValue = number | PortableStateRef | PortableInputRef;
type PortableComparison = {
  op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
  left: PortableValue;
  right: PortableValue;
};
type PortableAabb = { x: PortableValue; y: PortableValue; width: number; height: number };
type PortableCircle = { x: PortableValue; y: PortableValue; radius: number };
type PortableCapsule = { ax: number; ay: number; bx: number; by: number; radius: number };
type PortablePoint = { x: PortableValue; y: PortableValue };
type PortableAction =
  | { op: "set" | "add" | "sub"; target: string; value: PortableValue }
  | { op: "negate"; target: string }
  | { op: "if"; condition: PortableComparison; then: PortableAction[]; else?: PortableAction[] }
  | { op: "if_aabb"; a: PortableAabb; b: PortableAabb; then: PortableAction[]; else?: PortableAction[] }
  | { op: "if_circle"; a: PortableCircle; b: PortableCircle; then: PortableAction[]; else?: PortableAction[] }
  | { op: "if_circle_capsule"; circle: PortableCircle; capsule: PortableCapsule; then: PortableAction[]; else?: PortableAction[] }
  | { op: "if_trigger"; trigger: PortableAabb; point: PortablePoint; then: PortableAction[]; else?: PortableAction[] };
type PortableProgramSpecV1 = {
  version?: 1;
  fixedPoint?: number;
  state: Record<string, number>;
  tick: Exclude<PortableAction, { op: "if_aabb" } | { op: "if_circle" } | { op: "if_circle_capsule" } | { op: "if_trigger" }>[];
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
  when?: PortableComparison;
};
type PortableVanillaTextProjection = {
  id: string;
  dimension?: string;
  text: string | PortableHudToken[];
  x: PortableVanillaCoordinate;
  y: PortableVanillaCoordinate;
  z: PortableVanillaCoordinate;
  scale?: number | { x: number; y: number; z: number };
  billboard?: "fixed" | "vertical" | "horizontal" | "center";
  when?: PortableComparison;
};
type PortableVanillaActorProjection = {
  id: string;
  dimension?: string;
  entityType?: "minecraft:mannequin" | "minecraft:zombie" | "minecraft:skeleton";
  x: PortableVanillaCoordinate;
  y: PortableVanillaCoordinate;
  z: PortableVanillaCoordinate;
  yaw?: PortableVanillaCoordinate;
  when?: PortableComparison;
};
type PortableVanillaWorldBlockWrite = { x: number; y: number; z: number; block: string };
type PortableVanillaWorldBatch = {
  id: string;
  dimension?: string;
  blocks: PortableVanillaWorldBlockWrite[];
  when?: PortableComparison;
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
type PortableVanillaCameraV11 = PortableVanillaCamera & { mode?: "position_lock" | "spectate" };
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
type PortableVanillaSidebarRow = { id: string; tokens: PortableHudToken[] };
type PortableVanillaSidebar = { id: string; title: string; rows: PortableVanillaSidebarRow[] };
type PortableVanillaOwnershipRegion = { dimension?: string; minX: number; minZ: number; maxX: number; maxZ: number };
type PortableProgramSpecV2 = {
  version: 2;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: {
    inputs?: Record<string, PortableVanillaInputBindingV2>;
    projections?: Array<Omit<PortableVanillaBlockProjection, "when">>;
  };
  tick: Exclude<PortableAction, { op: "if_aabb" } | { op: "if_circle" } | { op: "if_circle_capsule" } | { op: "if_trigger" }>[];
};
type PortableProgramSpecV3 = {
  version: 3;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: {
    inputs?: Record<string, PortableVanillaInputBinding>;
    projections?: Array<Omit<PortableVanillaBlockProjection, "when">>;
    cameras?: PortableVanillaCamera[];
    particles?: PortableVanillaParticleEmitter[];
  };
  tick: Exclude<PortableAction, { op: "if_aabb" } | { op: "if_circle" } | { op: "if_circle_capsule" } | { op: "if_trigger" }>[];
};
type PortableProgramSpecV4 = {
  version: 4;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: {
    inputs?: Record<string, PortableVanillaInputBinding>;
    projections?: Array<Omit<PortableVanillaBlockProjection, "when">>;
    texts?: Array<Omit<PortableVanillaTextProjection, "when">>;
    cameras?: PortableVanillaCamera[];
    particles?: PortableVanillaParticleEmitter[];
    sounds?: PortableVanillaSoundEmitter[];
    huds?: PortableVanillaHud[];
  };
  tick: Exclude<PortableAction, { op: "if_circle" } | { op: "if_circle_capsule" } | { op: "if_trigger" }>[];
};
type PortableProgramSpecV5 = {
  version: 5;
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
  tick: Exclude<PortableAction, { op: "if_circle_capsule" } | { op: "if_trigger" }>[];
};
type PortableProgramSpecV6 = {
  version: 6;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: PortableProgramSpecV5["vanilla"];
  tick: PortableAction[];
};
type PortableProgramSpecV7 = {
  version: 7;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: PortableProgramSpecV5["vanilla"] & { actors?: PortableVanillaActorProjection[] };
  tick: PortableAction[];
};
type PortableProgramSpecV8 = {
  version: 8;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: PortableProgramSpecV7["vanilla"] & { worldBatches?: PortableVanillaWorldBatch[] };
  tick: PortableAction[];
};
type PortableProgramSpecV9 = {
  version: 9;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: PortableProgramSpecV8["vanilla"] & { sidebars?: PortableVanillaSidebar[] };
  tick: PortableAction[];
};
type PortableProgramSpecV10 = {
  version: 10;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: PortableProgramSpecV9["vanilla"] & { ownership?: PortableVanillaOwnershipRegion };
  tick: PortableAction[];
};
type PortableProgramSpecV11 = {
  version: 11;
  fixedPoint?: number;
  state: Record<string, number>;
  inputs?: Record<string, number>;
  vanilla?: Omit<NonNullable<PortableProgramSpecV10["vanilla"]>, "cameras"> & { cameras?: PortableVanillaCameraV11[] };
  tick: PortableAction[];
};
type PortableProgramSpec = PortableProgramSpecV1 | PortableProgramSpecV2 | PortableProgramSpecV3 | PortableProgramSpecV4 | PortableProgramSpecV5 | PortableProgramSpecV6 | PortableProgramSpecV7 | PortableProgramSpecV8 | PortableProgramSpecV9 | PortableProgramSpecV10 | PortableProgramSpecV11;

declare const portable: {
  define(spec: PortableProgramSpec): void;
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
  when?: PortableDslCondition;
};
type PortableDslTextSpec = {
  dimension?: string;
  text: string | Array<string | PortableDslState | PortableDslInput>;
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  scale?: number | { x: number; y: number; z: number };
  billboard?: "fixed" | "vertical" | "horizontal" | "center";
  when?: PortableDslCondition;
};
type PortableDslCameraSpec = {
  dimension?: string;
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  yaw?: number;
  pitch?: number;
  mode?: "position_lock" | "spectate";
};
type PortableDslActorSpec = {
  dimension?: string;
  entityType?: "minecraft:mannequin" | "minecraft:zombie" | "minecraft:skeleton";
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  yaw?: PortableDslCoordinate;
  when?: PortableDslCondition;
};
type PortableDslWorldBlockWrite = { x: number; y: number; z: number; block: string };
type PortableDslWorldBatchSpec = {
  dimension?: string;
  blocks: PortableDslWorldBlockWrite[];
  when?: PortableDslCondition;
};
type PortableDslWorldFillSpec = {
  dimension?: string;
  fromX: number; fromY: number; fromZ: number;
  toX: number; toY: number; toZ: number;
  block: string;
  when?: PortableDslCondition;
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
type PortableDslCircle = { readonly __portableDslCircle?: never };
type PortableDslCircleSpec = { x: PortableDslValue; y: PortableDslValue; radius: number };
type PortableDslSegment = { readonly __portableDslSegment?: never };
type PortableDslSegmentSpec = { ax: number; ay: number; bx: number; by: number };
type PortableDslCapsule = { readonly __portableDslCapsule?: never };
type PortableDslCapsuleSpec = PortableDslSegmentSpec & { radius: number };
type PortableDslTrigger = { readonly __portableDslTrigger?: never };
type PortableDslFlipper = { readonly __portableDslFlipper?: never };
type PortableDslFlipperSpec = {
  pivotX: number;
  pivotY: number;
  length: number;
  radius: number;
  restAngle: number;
  activeAngle: number;
  activeWhen: PortableDslCondition;
};
type PortableDslCollider = PortableDslBox | PortableDslCircle | PortableDslSegment | PortableDslCapsule | PortableDslFlipper;
type PortableDslHudSpec = { text: string | Array<string | PortableDslState | PortableDslInput> };
type PortableDslSidebarRow = { id: string; text: string | Array<string | PortableDslState | PortableDslInput> };
type PortableDslSidebarSpec = { title: string; rows: PortableDslSidebarRow[] };
type PortableDsl = {
  state(name: string, initial: number): PortableDslState;
  input(name: string, initial?: number, binding?: PortableDslInputBinding): PortableDslInput;
  tick(callback: () => void): void;
  repeat<T>(count: number, callback: (index: number) => T): readonly T[];
  when(condition: PortableDslCondition, thenCallback: () => void, elseCallback?: () => void): void;
  box(id: string, spec: PortableDslBoxSpec): PortableDslBox;
  circle(id: string, spec: PortableDslCircleSpec): PortableDslCircle;
  segment(id: string, spec: PortableDslSegmentSpec): PortableDslSegment;
  capsule(id: string, spec: PortableDslCapsuleSpec): PortableDslCapsule;
  trigger(id: string, spec: PortableDslBoxSpec): PortableDslTrigger;
  flipper(id: string, spec: PortableDslFlipperSpec): PortableDslFlipper;
  whenColliding(a: PortableDslBox, b: PortableDslBox, thenCallback: () => void, elseCallback?: () => void): void;
  whenColliding(a: PortableDslCircle, b: PortableDslCircle, thenCallback: () => void, elseCallback?: () => void): void;
  whenColliding(a: PortableDslCircle, b: PortableDslSegment | PortableDslCapsule | PortableDslFlipper, thenCallback: () => void, elseCallback?: () => void): void;
  whenColliding(a: PortableDslSegment | PortableDslCapsule | PortableDslFlipper, b: PortableDslCircle, thenCallback: () => void, elseCallback?: () => void): void;
  whenTriggered(trigger: PortableDslTrigger, watched: PortableDslCircle | PortableDslBox, thenCallback: () => void, elseCallback?: () => void): void;
  at(state: PortableDslState, base?: number): PortableDslCoordinate;
  block(id: string, spec: PortableDslBlockSpec): void;
  text(id: string, spec: PortableDslTextSpec): void;
  actor(id: string, spec: PortableDslActorSpec): void;
  worldBatch(id: string, spec: PortableDslWorldBatchSpec): void;
  worldFill(id: string, spec: PortableDslWorldFillSpec): void;
  camera(id: string, spec: PortableDslCameraSpec): void;
  particle(id: string, spec: PortableDslParticleSpec): void;
  sound(id: string, spec: PortableDslSoundSpec): void;
  hud(id: string, spec: PortableDslHudSpec): void;
  sidebar(id: string, spec: PortableDslSidebarSpec): void;
};

declare function portableDsl(build: (game: PortableDsl) => void): void;
declare function portableDsl(options: { fixedPoint?: number; ownership?: PortableVanillaOwnershipRegion }, build: (game: PortableDsl) => void): void;
