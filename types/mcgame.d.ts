/**
 * Build-time declarations for the portable TypeScript compiler.
 * Java/Fabric host-runtime APIs were retired; only portable IR/DSL authoring remains.
 */

type PortableStateRef = { state: string };
type PortableInputRef = { input: string };
type PortablePlayerStateRef = { playerState: string };
type PortablePlayerInputRef = { playerInput: PortablePlayerInputName };
type PortableGridWorldReadyRef = { gridWorldReady: string };
type PortableSessionStateRef = { sessionState: { session: string; state: string } };
type PortablePlayerInputName = "hotbarSlot" | "forward" | "backward" | "left" | "right" | "jump" | "sneak" | "sprint";
type PortableValue = number | PortableStateRef | PortableInputRef;
type PortablePlayerValue = PortableValue | PortablePlayerStateRef | PortablePlayerInputRef;
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
type PortableVanillaActorProfileV22 = { texture?: string; cape?: string; elytra?: string; model?: "wide" | "slim" };
type PortableVanillaActorEquipmentV22 = { head?: string; chest?: string; legs?: string; feet?: string; mainhand?: string; offhand?: string };
type PortableVanillaActorProjectionV22 = PortableVanillaActorProjection & {
  pitch?: PortableVanillaCoordinate;
  profile?: PortableVanillaActorProfileV22;
  hiddenLayers?: Array<"cape" | "jacket" | "left_sleeve" | "right_sleeve" | "left_pants_leg" | "right_pants_leg" | "hat">;
  pose?: "standing" | "crouching" | "swimming" | "fall_flying" | "sleeping";
  mainHand?: "left" | "right";
  equipment?: PortableVanillaActorEquipmentV22;
};
type PortableVanillaInteractionV23 = {
  id: string;
  dimension?: string;
  x: PortableVanillaCoordinate;
  y: PortableVanillaCoordinate;
  z: PortableVanillaCoordinate;
  width?: number;
  height?: number;
  response?: boolean;
  when?: PortableV21Comparison;
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
type PortableVanillaCameraV12 = PortableVanillaCameraV11 & { audience?: "all_online" };
type PortablePlayerSetRefV14 = "all_online" | { team: string };
type PortableVanillaCameraV14 = PortableVanillaCameraV11 & { audience?: PortablePlayerSetRefV14 };
type PortableVanillaCameraV26 = Omit<PortableVanillaCameraV14, "audience"> & { audience?: PortablePlayerSetRefV14 | { interactionController: string } };
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
type PortablePlayerHudToken = { text: string } | { value: PortablePlayerValue };
type PortableVanillaPlayerHud = { id: string; audience: "all_online"; tokens: PortablePlayerHudToken[] };
type PortableVanillaPlayerHudV14 = { id: string; audience: PortablePlayerSetRefV14; tokens: PortablePlayerHudToken[] };
type PortableV15Value = PortableV13Value | PortableSessionStateRef;
type PortableSessionGridWorldReadyRef = { sessionGridWorldReady: { session: string; gridWorld: string } };
type PortableV16Value = PortableV15Value | PortableSessionGridWorldReadyRef;
type PortablePersistentStateRef = { persistentState: string };
type PortableSessionPersistentStateRef = { sessionPersistentState: { session: string; state: string } };
type PortableV18Value = PortableV16Value | PortablePersistentStateRef | PortableSessionPersistentStateRef;
type PortablePersistentStateSpec = { initial: number; schema?: number; onSchemaMismatch?: "reset" | "preserve" };
type PortableV16PlayerHudToken = { text: string } | { value: PortableV16Value };
type PortableV15PlayerHudToken = { text: string } | { value: PortableV15Value };
type PortableVanillaPlayerHudV15 = { id: string; audience: PortablePlayerSetRefV14; session?: string; tokens: PortableV15PlayerHudToken[] };
type PortableVanillaPlayerHudV16 = { id: string; audience: PortablePlayerSetRefV14; session?: string; tokens: PortableV16PlayerHudToken[] };
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
type PortablePlayerComparison = {
  op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
  left: PortablePlayerValue;
  right: PortablePlayerValue;
};
type PortablePlayerAabb = { x: PortablePlayerValue; y: PortablePlayerValue; width: number; height: number };
type PortablePlayerCircle = { x: PortablePlayerValue; y: PortablePlayerValue; radius: number };
type PortablePlayerPoint = { x: PortablePlayerValue; y: PortablePlayerValue };
type PortablePlayerAction =
  | { op: "player_set" | "player_add" | "player_sub"; target: string; value: PortablePlayerValue }
  | { op: "player_negate"; target: string }
  | { op: "if"; condition: PortablePlayerComparison; then: PortablePlayerAction[]; else?: PortablePlayerAction[] }
  | { op: "if_aabb"; a: PortablePlayerAabb; b: PortablePlayerAabb; then: PortablePlayerAction[]; else?: PortablePlayerAction[] }
  | { op: "if_circle"; a: PortablePlayerCircle; b: PortablePlayerCircle; then: PortablePlayerAction[]; else?: PortablePlayerAction[] }
  | { op: "if_circle_capsule"; circle: PortablePlayerCircle; capsule: PortableCapsule; then: PortablePlayerAction[]; else?: PortablePlayerAction[] }
  | { op: "if_trigger"; trigger: PortablePlayerAabb; point: PortablePlayerPoint; then: PortablePlayerAction[]; else?: PortablePlayerAction[] };
type PortableForEachPlayerAction = { op: "for_each_player"; players: "all_online"; actions: PortablePlayerAction[] };
type PortableProgramSpecV12 = {
  version: 12;
  fixedPoint?: number;
  state: Record<string, number>;
  playerState?: Record<string, number>;
  playerInputs?: PortablePlayerInputName[];
  vanilla?: Omit<NonNullable<PortableProgramSpecV10["vanilla"]>, "inputs" | "huds" | "cameras"> & {
    cameras?: PortableVanillaCameraV12[];
    playerHuds?: PortableVanillaPlayerHud[];
  };
  tick: Array<PortableAction | PortableForEachPlayerAction>;
};

type PortableGridSpec = { id: string; width: number; height: number; initial: number; outside: number };
type PortableRngSpec = { id: string; seed: number };
type PortableGridWorldSpec = {
  id: string;
  grid: string;
  dimension?: string;
  originX: number;
  y: number;
  originZ: number;
  palette: Array<{ value: number; block: string }>;
  cellsPerTick: number;
};
type PortableV13Value = PortablePlayerValue | PortableGridWorldReadyRef;
type PortableV13Comparison = {
  op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
  left: PortableV13Value;
  right: PortableV13Value;
};
type PortableV13Action =
  | PortableAction
  | { op: "player_set" | "player_add" | "player_sub"; target: string; value: PortableV13Value }
  | { op: "player_negate"; target: string }
  | { op: "grid_fill"; grid: string; value: PortableV13Value }
  | { op: "grid_get"; grid: string; x: PortableV13Value; z: PortableV13Value; target: string }
  | { op: "grid_set"; grid: string; x: PortableV13Value; z: PortableV13Value; value: PortableV13Value }
  | { op: "grid_fill_rect"; grid: string; x: PortableV13Value; z: PortableV13Value; width: PortableV13Value; height: PortableV13Value; value: PortableV13Value }
  | { op: "rng_reset"; rng: string }
  | { op: "rng_int"; rng: string; target: string; min: number; max: number }
  | { op: "grid_world_rebuild"; target: string }
  | { op: "if"; condition: PortableV13Comparison; then: PortableV13Action[]; else?: PortableV13Action[] }
  | { op: "for_each_player" | "for_single_player"; players: "all_online"; actions: PortableV13Action[] };
type PortableProgramSpecV13 = {
  version: 13;
  fixedPoint?: number;
  state: Record<string, number>;
  playerState?: Record<string, number>;
  playerInputs?: PortablePlayerInputName[];
  grids?: PortableGridSpec[];
  rngs?: PortableRngSpec[];
  vanilla?: Omit<NonNullable<PortableProgramSpecV12["vanilla"]>, "cameras"> & {
    cameras?: PortableVanillaCameraV12[];
    gridWorlds?: PortableGridWorldSpec[];
  };
  tick: PortableV13Action[];
};
type PortableV14Action =
  | Exclude<PortableV13Action, { op: "for_each_player" | "for_single_player" }>
  | { op: "for_each_player" | "for_single_player"; players: PortablePlayerSetRefV14; actions: PortableV14Action[] };
type PortableProgramSpecV14 = {
  version: 14;
  fixedPoint?: number;
  state: Record<string, number>;
  playerState?: Record<string, number>;
  playerInputs?: PortablePlayerInputName[];
  playerSets?: Array<{ team: string }>;
  grids?: PortableGridSpec[];
  rngs?: PortableRngSpec[];
  vanilla?: Omit<NonNullable<PortableProgramSpecV13["vanilla"]>, "cameras" | "playerHuds"> & {
    cameras?: PortableVanillaCameraV14[];
    playerHuds?: PortableVanillaPlayerHudV14[];
  };
  tick: PortableV14Action[];
};
type PortableV15Comparison = {
  op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte";
  left: PortableV15Value;
  right: PortableV15Value;
};
type PortableV15Aabb = { x: PortableV15Value; y: PortableV15Value; width: number; height: number };
type PortableV15Circle = { x: PortableV15Value; y: PortableV15Value; radius: number };
type PortableV15Point = { x: PortableV15Value; y: PortableV15Value };
type PortableV15Action =
  | { op: "set" | "add" | "sub"; target: string; value: PortableV15Value }
  | { op: "negate"; target: string }
  | { op: "player_set" | "player_add" | "player_sub"; target: string; value: PortableV15Value }
  | { op: "player_negate"; target: string }
  | { op: "grid_fill"; grid: string; value: PortableV15Value }
  | { op: "grid_get"; grid: string; x: PortableV15Value; z: PortableV15Value; target: string }
  | { op: "grid_set"; grid: string; x: PortableV15Value; z: PortableV15Value; value: PortableV15Value }
  | { op: "grid_fill_rect"; grid: string; x: PortableV15Value; z: PortableV15Value; width: PortableV15Value; height: PortableV15Value; value: PortableV15Value }
  | { op: "rng_reset"; rng: string }
  | { op: "rng_int"; rng: string; target: string; min: number; max: number }
  | { op: "grid_world_rebuild"; target: string }
  | { op: "if"; condition: PortableV15Comparison; then: PortableV15Action[]; else?: PortableV15Action[] }
  | { op: "if_aabb"; a: PortableV15Aabb; b: PortableV15Aabb; then: PortableV15Action[]; else?: PortableV15Action[] }
  | { op: "if_circle"; a: PortableV15Circle; b: PortableV15Circle; then: PortableV15Action[]; else?: PortableV15Action[] }
  | { op: "if_circle_capsule"; circle: PortableV15Circle; capsule: PortableCapsule; then: PortableV15Action[]; else?: PortableV15Action[] }
  | { op: "if_trigger"; trigger: PortableV15Aabb; point: PortableV15Point; then: PortableV15Action[]; else?: PortableV15Action[] }
  | { op: "for_each_player" | "for_single_player"; players: PortablePlayerSetRefV14; actions: PortableV15Action[] }
  | { op: "for_session"; session: string; actions: PortableV15Action[] };
type PortableSessionSpecV15 = {
  id: string;
  players: { team: string };
  state?: Record<string, number>;
  grids?: PortableGridSpec[];
  rngs?: PortableRngSpec[];
};
type PortableProgramSpecV15 = {
  version: 15;
  fixedPoint?: number;
  state: Record<string, number>;
  playerState?: Record<string, number>;
  playerInputs?: PortablePlayerInputName[];
  playerSets?: Array<{ team: string }>;
  sessions?: PortableSessionSpecV15[];
  grids?: PortableGridSpec[];
  rngs?: PortableRngSpec[];
  vanilla?: Omit<NonNullable<PortableProgramSpecV14["vanilla"]>, "playerHuds"> & {
    playerHuds?: PortableVanillaPlayerHudV15[];
  };
  tick: PortableV15Action[];
};
type PortableV16Comparison = { op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"; left: PortableV16Value; right: PortableV16Value };
type PortableV16Aabb = { x: PortableV16Value; y: PortableV16Value; width: number; height: number };
type PortableV16Circle = { x: PortableV16Value; y: PortableV16Value; radius: number };
type PortableV16Point = { x: PortableV16Value; y: PortableV16Value };
type PortableV16Action =
  | { op: "set" | "add" | "sub"; target: string; value: PortableV16Value }
  | { op: "negate"; target: string }
  | { op: "player_set" | "player_add" | "player_sub"; target: string; value: PortableV16Value }
  | { op: "player_negate"; target: string }
  | { op: "grid_fill"; grid: string; value: PortableV16Value }
  | { op: "grid_get"; grid: string; x: PortableV16Value; z: PortableV16Value; target: string }
  | { op: "grid_set"; grid: string; x: PortableV16Value; z: PortableV16Value; value: PortableV16Value }
  | { op: "grid_fill_rect"; grid: string; x: PortableV16Value; z: PortableV16Value; width: PortableV16Value; height: PortableV16Value; value: PortableV16Value }
  | { op: "rng_reset"; rng: string } | { op: "rng_int"; rng: string; target: string; min: number; max: number }
  | { op: "grid_world_rebuild"; target: string }
  | { op: "if"; condition: PortableV16Comparison; then: PortableV16Action[]; else?: PortableV16Action[] }
  | { op: "if_aabb"; a: PortableV16Aabb; b: PortableV16Aabb; then: PortableV16Action[]; else?: PortableV16Action[] }
  | { op: "if_circle"; a: PortableV16Circle; b: PortableV16Circle; then: PortableV16Action[]; else?: PortableV16Action[] }
  | { op: "if_circle_capsule"; circle: PortableV16Circle; capsule: PortableCapsule; then: PortableV16Action[]; else?: PortableV16Action[] }
  | { op: "if_trigger"; trigger: PortableV16Aabb; point: PortableV16Point; then: PortableV16Action[]; else?: PortableV16Action[] }
  | { op: "for_each_player" | "for_single_player"; players: PortablePlayerSetRefV14; actions: PortableV16Action[] }
  | { op: "for_session"; session: string; actions: PortableV16Action[] };
type PortableSessionSpecV16 = PortableSessionSpecV15 & { gridWorlds?: PortableGridWorldSpec[] };
type PortableProgramSpecV16 = {
  version: 16;
  fixedPoint?: number;
  state: Record<string, number>;
  playerState?: Record<string, number>;
  playerInputs?: PortablePlayerInputName[];
  playerSets?: Array<{ team: string }>;
  sessions?: PortableSessionSpecV16[];
  grids?: PortableGridSpec[];
  rngs?: PortableRngSpec[];
  vanilla?: Omit<NonNullable<PortableProgramSpecV15["vanilla"]>, "playerHuds"> & { playerHuds?: PortableVanillaPlayerHudV16[] };
  tick: PortableV16Action[];
};
type PortableV17Action =
  | { op: "set" | "add" | "sub"; target: string; value: PortableV16Value }
  | { op: "negate"; target: string }
  | { op: "player_set" | "player_add" | "player_sub"; target: string; value: PortableV16Value }
  | { op: "player_negate"; target: string }
  | { op: "grid_fill"; grid: string; value: PortableV16Value }
  | { op: "grid_get"; grid: string; x: PortableV16Value; z: PortableV16Value; target: string }
  | { op: "grid_set"; grid: string; x: PortableV16Value; z: PortableV16Value; value: PortableV16Value }
  | { op: "grid_fill_rect"; grid: string; x: PortableV16Value; z: PortableV16Value; width: PortableV16Value; height: PortableV16Value; value: PortableV16Value }
  | { op: "rng_reset"; rng: string } | { op: "rng_int"; rng: string; target: string; min: number; max: number }
  | { op: "grid_world_rebuild"; target: string }
  | { op: "player_reduce"; kind: "count"; players: PortablePlayerSetRefV14; target: string }
  | { op: "player_reduce"; kind: "sum"; players: PortablePlayerSetRefV14; target: string; value: PortableV16Value }
  | { op: "player_reduce"; kind: "min" | "max"; players: PortablePlayerSetRefV14; target: string; empty: number; value: PortableV16Value }
  | { op: "player_reduce"; kind: "any" | "all"; players: PortablePlayerSetRefV14; target: string; condition: PortableV16Comparison }
  | { op: "if"; condition: PortableV16Comparison; then: PortableV17Action[]; else?: PortableV17Action[] }
  | { op: "if_aabb"; a: PortableV16Aabb; b: PortableV16Aabb; then: PortableV17Action[]; else?: PortableV17Action[] }
  | { op: "if_circle"; a: PortableV16Circle; b: PortableV16Circle; then: PortableV17Action[]; else?: PortableV17Action[] }
  | { op: "if_circle_capsule"; circle: PortableV16Circle; capsule: PortableCapsule; then: PortableV17Action[]; else?: PortableV17Action[] }
  | { op: "if_trigger"; trigger: PortableV16Aabb; point: PortableV16Point; then: PortableV17Action[]; else?: PortableV17Action[] }
  | { op: "for_each_player" | "for_single_player"; players: PortablePlayerSetRefV14; actions: PortableV17Action[] }
  | { op: "for_session"; session: string; actions: PortableV17Action[] };
type PortableProgramSpecV17 = Omit<PortableProgramSpecV16, "version" | "tick"> & { version: 17; tick: PortableV17Action[] };
type PortableV18Comparison = { op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"; left: PortableV18Value; right: PortableV18Value };
type PortableV18Aabb = { x: PortableV18Value; y: PortableV18Value; width: number; height: number };
type PortableV18Circle = { x: PortableV18Value; y: PortableV18Value; radius: number };
type PortableV18Point = { x: PortableV18Value; y: PortableV18Value };
type PortableV18Action =
  | { op: "set" | "add" | "sub"; target: string; value: PortableV18Value }
  | { op: "negate"; target: string }
  | { op: "persistent_set" | "persistent_add" | "persistent_sub"; target: string; value: PortableV18Value }
  | { op: "persistent_negate"; target: string }
  | { op: "player_set" | "player_add" | "player_sub"; target: string; value: PortableV18Value }
  | { op: "player_negate"; target: string }
  | { op: "grid_fill"; grid: string; value: PortableV18Value }
  | { op: "grid_get"; grid: string; x: PortableV18Value; z: PortableV18Value; target: string }
  | { op: "grid_set"; grid: string; x: PortableV18Value; z: PortableV18Value; value: PortableV18Value }
  | { op: "grid_fill_rect"; grid: string; x: PortableV18Value; z: PortableV18Value; width: PortableV18Value; height: PortableV18Value; value: PortableV18Value }
  | { op: "rng_reset"; rng: string } | { op: "rng_int"; rng: string; target: string; min: number; max: number }
  | { op: "grid_world_rebuild"; target: string }
  | { op: "player_reduce"; kind: "count"; players: PortablePlayerSetRefV14; target: string }
  | { op: "player_reduce"; kind: "sum"; players: PortablePlayerSetRefV14; target: string; value: PortableV18Value }
  | { op: "player_reduce"; kind: "min" | "max"; players: PortablePlayerSetRefV14; target: string; empty: number; value: PortableV18Value }
  | { op: "player_reduce"; kind: "any" | "all"; players: PortablePlayerSetRefV14; target: string; condition: PortableV18Comparison }
  | { op: "if"; condition: PortableV18Comparison; then: PortableV18Action[]; else?: PortableV18Action[] }
  | { op: "if_aabb"; a: PortableV18Aabb; b: PortableV18Aabb; then: PortableV18Action[]; else?: PortableV18Action[] }
  | { op: "if_circle"; a: PortableV18Circle; b: PortableV18Circle; then: PortableV18Action[]; else?: PortableV18Action[] }
  | { op: "if_circle_capsule"; circle: PortableV18Circle; capsule: PortableCapsule; then: PortableV18Action[]; else?: PortableV18Action[] }
  | { op: "if_trigger"; trigger: PortableV18Aabb; point: PortableV18Point; then: PortableV18Action[]; else?: PortableV18Action[] }
  | { op: "for_each_player" | "for_single_player"; players: PortablePlayerSetRefV14; actions: PortableV18Action[] }
  | { op: "for_session"; session: string; actions: PortableV18Action[] };
type PortableSessionSpecV18 = PortableSessionSpecV16 & { persistentState?: Record<string, PortablePersistentStateSpec> };
type PortableProgramSpecV18 = Omit<PortableProgramSpecV16, "version" | "sessions" | "tick" | "vanilla"> & {
  version: 18;
  persistentState?: Record<string, PortablePersistentStateSpec>;
  sessions?: PortableSessionSpecV18[];
  vanilla?: Omit<NonNullable<PortableProgramSpecV16["vanilla"]>, "playerHuds"> & { playerHuds?: Array<{ id: string; audience: PortablePlayerSetRefV14; session?: string; tokens: Array<{ text: string } | { value: PortableV18Value }> }> };
  tick: PortableV18Action[];
};
type PortablePersistentGridSpec = {
  id: string; width: number; height: number; initial: number; outside: number;
  schema?: number; onSchemaMismatch?: "reset" | "preserve";
};
type PortableV19Action =
  | Exclude<PortableV18Action,
      { op: "if" } | { op: "if_aabb" } | { op: "if_circle" } | { op: "if_circle_capsule" } | { op: "if_trigger" } |
      { op: "for_each_player" | "for_single_player" } | { op: "for_session" }>
  | { op: "persistent_grid_fill"; grid: string; value: PortableV18Value }
  | { op: "persistent_grid_get"; grid: string; x: PortableV18Value; z: PortableV18Value; target: string }
  | { op: "persistent_grid_set"; grid: string; x: PortableV18Value; z: PortableV18Value; value: PortableV18Value }
  | { op: "persistent_grid_fill_rect"; grid: string; x: PortableV18Value; z: PortableV18Value; width: PortableV18Value; height: PortableV18Value; value: PortableV18Value }
  | { op: "if"; condition: PortableV18Comparison; then: PortableV19Action[]; else?: PortableV19Action[] }
  | { op: "if_aabb"; a: PortableV18Aabb; b: PortableV18Aabb; then: PortableV19Action[]; else?: PortableV19Action[] }
  | { op: "if_circle"; a: PortableV18Circle; b: PortableV18Circle; then: PortableV19Action[]; else?: PortableV19Action[] }
  | { op: "if_circle_capsule"; circle: PortableV18Circle; capsule: PortableCapsule; then: PortableV19Action[]; else?: PortableV19Action[] }
  | { op: "if_trigger"; trigger: PortableV18Aabb; point: PortableV18Point; then: PortableV19Action[]; else?: PortableV19Action[] }
  | { op: "for_each_player" | "for_single_player"; players: PortablePlayerSetRefV14; actions: PortableV19Action[] }
  | { op: "for_session"; session: string; actions: PortableV19Action[] };
type PortableSessionSpecV19 = PortableSessionSpecV18 & { persistentGrids?: PortablePersistentGridSpec[] };
type PortableProgramSpecV19 = Omit<PortableProgramSpecV18, "version" | "sessions" | "tick"> & {
  version: 19; persistentGrids?: PortablePersistentGridSpec[]; sessions?: PortableSessionSpecV19[]; tick: PortableV19Action[];
};
type PortablePlayerSelectionRef = { playerSelection: string };
type PortableV20Value = PortableV18Value | PortablePlayerSelectionRef;
type PortableV20Comparison = { op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"; left: PortableV20Value; right: PortableV20Value };
type PortableV20Aabb = { x: PortableV20Value; y: PortableV20Value; width: number; height: number };
type PortableV20Circle = { x: PortableV20Value; y: PortableV20Value; radius: number };
type PortableV20Point = { x: PortableV20Value; y: PortableV20Value };
type PortableSelectionSpec = {
  id: string; title: string; body?: string; columns?: number;
  options: Array<{ label: string; tooltip?: string; value: number }>;
  cancel?: { label?: string; value?: number };
};
type PortableV20Action =
  | { op: "set" | "add" | "sub"; target: string; value: PortableV20Value }
  | { op: "negate"; target: string }
  | { op: "persistent_set" | "persistent_add" | "persistent_sub"; target: string; value: PortableV20Value }
  | { op: "persistent_negate"; target: string }
  | { op: "player_set" | "player_add" | "player_sub"; target: string; value: PortableV20Value }
  | { op: "player_negate"; target: string }
  | { op: "selection_open" | "selection_clear"; selection: string }
  | { op: "grid_fill" | "persistent_grid_fill"; grid: string; value: PortableV20Value }
  | { op: "grid_get" | "persistent_grid_get"; grid: string; x: PortableV20Value; z: PortableV20Value; target: string }
  | { op: "grid_set" | "persistent_grid_set"; grid: string; x: PortableV20Value; z: PortableV20Value; value: PortableV20Value }
  | { op: "grid_fill_rect" | "persistent_grid_fill_rect"; grid: string; x: PortableV20Value; z: PortableV20Value; width: PortableV20Value; height: PortableV20Value; value: PortableV20Value }
  | { op: "rng_reset"; rng: string } | { op: "rng_int"; rng: string; target: string; min: number; max: number }
  | { op: "grid_world_rebuild"; target: string }
  | { op: "player_reduce"; kind: "count"; players: PortablePlayerSetRefV14; target: string }
  | { op: "player_reduce"; kind: "sum"; players: PortablePlayerSetRefV14; target: string; value: PortableV20Value }
  | { op: "player_reduce"; kind: "min" | "max"; players: PortablePlayerSetRefV14; target: string; empty: number; value: PortableV20Value }
  | { op: "player_reduce"; kind: "any" | "all"; players: PortablePlayerSetRefV14; target: string; condition: PortableV20Comparison }
  | { op: "if"; condition: PortableV20Comparison; then: PortableV20Action[]; else?: PortableV20Action[] }
  | { op: "if_aabb"; a: PortableV20Aabb; b: PortableV20Aabb; then: PortableV20Action[]; else?: PortableV20Action[] }
  | { op: "if_circle"; a: PortableV20Circle; b: PortableV20Circle; then: PortableV20Action[]; else?: PortableV20Action[] }
  | { op: "if_circle_capsule"; circle: PortableV20Circle; capsule: PortableCapsule; then: PortableV20Action[]; else?: PortableV20Action[] }
  | { op: "if_trigger"; trigger: PortableV20Aabb; point: PortableV20Point; then: PortableV20Action[]; else?: PortableV20Action[] }
  | { op: "for_each_player" | "for_single_player"; players: PortablePlayerSetRefV14; actions: PortableV20Action[] }
  | { op: "for_session"; session: string; actions: PortableV20Action[] };
type PortableProgramSpecV20 = Omit<PortableProgramSpecV19, "version" | "tick" | "vanilla"> & {
  version: 20; selections?: PortableSelectionSpec[]; tick: PortableV20Action[];
  vanilla?: Omit<NonNullable<PortableProgramSpecV18["vanilla"]>, "playerHuds"> & { playerHuds?: Array<{ id: string; audience: PortablePlayerSetRefV14; session?: string; tokens: Array<{ text: string } | { value: PortableV20Value }> }> };
};
type PortableDialogTextSpan = {
  text: string; color?: string; bold?: boolean; italic?: boolean; underlined?: boolean; strikethrough?: boolean;
};
type PortableDialogText = string | PortableDialogTextSpan | Array<string | PortableDialogTextSpan>;
type PortableDialogBodyElement =
  | { type: "text"; text: PortableDialogText; width?: number }
  | { type: "item"; item: string; count?: number; description?: PortableDialogText; descriptionWidth?: number; showTooltip?: boolean; showDecoration?: boolean; width?: number; height?: number };
type PortableSelectionSpecV21 = {
  id: string; kind?: "selection"; title: PortableDialogText; body?: string | PortableDialogBodyElement[]; columns?: number;
  options: Array<{ label: PortableDialogText; tooltip?: PortableDialogText; value: number }>;
  cancel?: { label?: PortableDialogText; tooltip?: PortableDialogText; value?: number };
};
type PortableConfirmationSpecV21 = {
  id: string; kind: "confirmation"; title: PortableDialogText; body?: string | PortableDialogBodyElement[];
  yes?: { label?: PortableDialogText; tooltip?: PortableDialogText; value?: number };
  no?: { label?: PortableDialogText; tooltip?: PortableDialogText; value?: number };
};
type PortableFormSpecV21 = {
  id: string; title: PortableDialogText; body?: string | PortableDialogBodyElement[];
  input:
    | { type: "boolean"; label: PortableDialogText; initial?: boolean; trueValue?: number; falseValue?: number }
    | { type: "option"; label: PortableDialogText; options: Array<{ label: PortableDialogText; value: number }>; initial?: number; width?: number; labelVisible?: boolean }
    | { type: "range"; label: PortableDialogText; start: number; end: number; step?: number; initial?: number; width?: number };
  submit?: { label?: PortableDialogText; tooltip?: PortableDialogText };
  cancel?: { label?: PortableDialogText; tooltip?: PortableDialogText; value?: number };
};
type PortablePlayerFormRef = { playerForm: string };
type PortableV21Value = PortableV20Value | PortablePlayerFormRef;
type PortableV21Comparison = { op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"; left: PortableV21Value; right: PortableV21Value };
type PortableV21Aabb = { x: PortableV21Value; y: PortableV21Value; width: number; height: number };
type PortableV21Circle = { x: PortableV21Value; y: PortableV21Value; radius: number };
type PortableV21Point = { x: PortableV21Value; y: PortableV21Value };
type PortableV21Action =
  | { op: "set" | "add" | "sub"; target: string; value: PortableV21Value }
  | { op: "negate"; target: string }
  | { op: "persistent_set" | "persistent_add" | "persistent_sub"; target: string; value: PortableV21Value }
  | { op: "persistent_negate"; target: string }
  | { op: "player_set" | "player_add" | "player_sub"; target: string; value: PortableV21Value }
  | { op: "player_negate"; target: string }
  | { op: "selection_open" | "selection_clear"; selection: string }
  | { op: "form_open" | "form_clear"; form: string }
  | { op: "grid_fill" | "persistent_grid_fill"; grid: string; value: PortableV21Value }
  | { op: "grid_get" | "persistent_grid_get"; grid: string; x: PortableV21Value; z: PortableV21Value; target: string }
  | { op: "grid_set" | "persistent_grid_set"; grid: string; x: PortableV21Value; z: PortableV21Value; value: PortableV21Value }
  | { op: "grid_fill_rect" | "persistent_grid_fill_rect"; grid: string; x: PortableV21Value; z: PortableV21Value; width: PortableV21Value; height: PortableV21Value; value: PortableV21Value }
  | { op: "rng_reset"; rng: string } | { op: "rng_int"; rng: string; target: string; min: number; max: number }
  | { op: "grid_world_rebuild"; target: string }
  | { op: "player_reduce"; kind: "count"; players: PortablePlayerSetRefV14; target: string }
  | { op: "player_reduce"; kind: "sum"; players: PortablePlayerSetRefV14; target: string; value: PortableV21Value }
  | { op: "player_reduce"; kind: "min" | "max"; players: PortablePlayerSetRefV14; target: string; empty: number; value: PortableV21Value }
  | { op: "player_reduce"; kind: "any" | "all"; players: PortablePlayerSetRefV14; target: string; condition: PortableV21Comparison }
  | { op: "if"; condition: PortableV21Comparison; then: PortableV21Action[]; else?: PortableV21Action[] }
  | { op: "if_aabb"; a: PortableV21Aabb; b: PortableV21Aabb; then: PortableV21Action[]; else?: PortableV21Action[] }
  | { op: "if_circle"; a: PortableV21Circle; b: PortableV21Circle; then: PortableV21Action[]; else?: PortableV21Action[] }
  | { op: "if_circle_capsule"; circle: PortableV21Circle; capsule: PortableCapsule; then: PortableV21Action[]; else?: PortableV21Action[] }
  | { op: "if_trigger"; trigger: PortableV21Aabb; point: PortableV21Point; then: PortableV21Action[]; else?: PortableV21Action[] }
  | { op: "for_each_player" | "for_single_player"; players: PortablePlayerSetRefV14; actions: PortableV21Action[] }
  | { op: "for_session"; session: string; actions: PortableV21Action[] };
type PortableProgramSpecV21 = Omit<PortableProgramSpecV20, "version" | "tick" | "selections" | "vanilla"> & {
  version: 21; selections?: Array<PortableSelectionSpecV21 | PortableConfirmationSpecV21>; forms?: PortableFormSpecV21[]; tick: PortableV21Action[];
  vanilla?: Omit<NonNullable<PortableProgramSpecV18["vanilla"]>, "playerHuds"> & { playerHuds?: Array<{ id: string; audience: PortablePlayerSetRefV14; session?: string; tokens: Array<{ text: string } | { value: PortableV21Value }> }> };
};
type PortableProgramSpecV22 = Omit<PortableProgramSpecV21, "version" | "vanilla"> & {
  version: 22;
  vanilla?: Omit<NonNullable<PortableProgramSpecV21["vanilla"]>, "actors"> & { actors?: PortableVanillaActorProjectionV22[] };
};
type PortableV23Action = PortableV21Action | { op: "interaction_use"; interaction: string; actions: PortableV21Action[] };
type PortableProgramSpecV23 = Omit<PortableProgramSpecV22, "version" | "tick" | "vanilla"> & {
  version: 23;
  tick: PortableV23Action[];
  vanilla?: NonNullable<PortableProgramSpecV22["vanilla"]> & { interactions?: PortableVanillaInteractionV23[] };
};
type PortableV24PlayerAction =
  | Exclude<PortableV21Action,
      | { op: "if" } | { op: "if_aabb" } | { op: "if_circle" } | { op: "if_circle_capsule" } | { op: "if_trigger" }>
  | { op: "interaction_controller_claim"; interaction: string }
  | { op: "if"; condition: PortableV21Comparison; then: PortableV24PlayerAction[]; else?: PortableV24PlayerAction[] }
  | { op: "if_aabb"; a: PortableV21Aabb; b: PortableV21Aabb; then: PortableV24PlayerAction[]; else?: PortableV24PlayerAction[] }
  | { op: "if_circle"; a: PortableV21Circle; b: PortableV21Circle; then: PortableV24PlayerAction[]; else?: PortableV24PlayerAction[] }
  | { op: "if_circle_capsule"; circle: PortableV21Circle; capsule: PortableCapsule; then: PortableV24PlayerAction[]; else?: PortableV24PlayerAction[] }
  | { op: "if_trigger"; trigger: PortableV21Aabb; point: PortableV21Point; then: PortableV24PlayerAction[]; else?: PortableV24PlayerAction[] };
type PortableV24Action =
  | Exclude<PortableV23Action, { op: "interaction_use" }>
  | { op: "interaction_use"; interaction: string; actions: PortableV24PlayerAction[] }
  | { op: "interaction_controller_player"; interaction: string; actions: PortableV21Action[] };
type PortableProgramSpecV24 = Omit<PortableProgramSpecV23, "version" | "tick"> & { version: 24; tick: PortableV24Action[] };
type PortablePlaceableStateRefV25 = { placeableState: { placeable: string; slot: number; state: string } };
type PortableV25Value = PortableV21Value | PortablePlaceableStateRefV25;
type PortableItemTemplateV25 = {
  id: string; name: string; maxStackSize?: number;
  appearance:
    | { kind: "head"; textureUrl: string }
    | { kind: "model"; model: string };
};
type PortablePlaceableSpecV25 = {
  id: string; item: string; maxInstances: number; orientation?: "cardinal"; state?: Record<string, number>;
};
type PortablePlaceableBindingV25 = { placeable: { id: string; slot: number } };
type PortableVanillaBlockProjectionV25 = Omit<PortableVanillaBlockProjection, "x" | "y" | "z" | "when"> & PortablePlaceableBindingV25 & {
  x: PortableV25Value; y: PortableV25Value; z: PortableV25Value; when?: PortableV25Comparison;
};
type PortableVanillaTextProjectionV25 = Omit<PortableVanillaTextProjection, "text" | "x" | "y" | "z" | "when"> & PortablePlaceableBindingV25 & {
  text: string | Array<{ text: string } | { value: PortableV25Value }>;
  x: PortableV25Value; y: PortableV25Value; z: PortableV25Value; when?: PortableV25Comparison;
};
type PortableVanillaInteractionV25 = Omit<PortableVanillaInteractionV23, "x" | "y" | "z" | "when"> & PortablePlaceableBindingV25 & {
  x: PortableV25Value; y: PortableV25Value; z: PortableV25Value; when?: PortableV25Comparison;
};
type PortableVanillaItemDisplayV25 = PortablePlaceableBindingV25 & {
  id: string; dimension?: string; item: string;
  x: PortableV25Value; y: PortableV25Value; z: PortableV25Value;
  scale?: number | { x: number; y: number; z: number };
  translation?: { x: number; y: number; z: number };
  when?: PortableV25Comparison;
};
type PortableV25Comparison = { op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte"; left: PortableV25Value; right: PortableV25Value };
type PortableV25PlayerAction =
  | PortableV24PlayerAction
  | { op: "item_give"; item: string; count?: number }
  | { op: "placeable_set" | "placeable_add" | "placeable_sub"; placeable: string; slot: number; target: string; value: PortableV25Value }
  | { op: "placeable_negate"; placeable: string; slot: number; target: string }
  | { op: "placeable_remove"; placeable: string; slot: number }
  | { op: "if"; condition: PortableV25Comparison; then: PortableV25PlayerAction[]; else?: PortableV25PlayerAction[] };
type PortableV25Action =
  | PortableV24Action
  | { op: "item_give"; item: string; count?: number }
  | { op: "placeable_set" | "placeable_add" | "placeable_sub"; placeable: string; slot: number; target: string; value: PortableV25Value }
  | { op: "placeable_negate"; placeable: string; slot: number; target: string }
  | { op: "placeable_remove"; placeable: string; slot: number }
  | { op: "placeable_tick"; placeable: string; slot: number; actions: PortableV25Action[] }
  | { op: "interaction_use"; interaction: string; actions: PortableV25PlayerAction[] }
  | { op: "interaction_controller_player"; interaction: string; actions: PortableV25PlayerAction[] };
type PortableProgramSpecV25 = Omit<PortableProgramSpecV24, "version" | "tick" | "vanilla"> & {
  version: 25;
  items: PortableItemTemplateV25[];
  placeables: PortablePlaceableSpecV25[];
  tick: PortableV25Action[];
  vanilla?: Omit<NonNullable<PortableProgramSpecV23["vanilla"]>, "projections" | "texts" | "interactions"> & {
    projections?: Array<PortableVanillaBlockProjection | PortableVanillaBlockProjectionV25>;
    texts?: Array<PortableVanillaTextProjection | PortableVanillaTextProjectionV25>;
    interactions?: Array<PortableVanillaInteractionV23 | PortableVanillaInteractionV25>;
    itemDisplays?: PortableVanillaItemDisplayV25[];
  };
};
type PortableV26PlayerAction =
  | Exclude<PortableV25PlayerAction, { op: "if" }>
  | { op: "interaction_controller_return"; interaction: string }
  | { op: "if"; condition: PortableV25Comparison; then: PortableV26PlayerAction[]; else?: PortableV26PlayerAction[] };
type PortableV26Action =
  | Exclude<PortableV25Action, { op: "interaction_controller_player" } | { op: "placeable_tick" }>
  | { op: "interaction_controller_player"; interaction: string; actions: PortableV26PlayerAction[] }
  | { op: "placeable_tick"; placeable: string; slot: number; actions: PortableV26Action[] };
type PortableProgramSpecV26 = Omit<PortableProgramSpecV25, "version" | "items" | "placeables" | "tick" | "vanilla"> & {
  version: 26;
  items?: PortableItemTemplateV25[];
  placeables?: PortablePlaceableSpecV25[];
  tick: PortableV26Action[];
  vanilla?: Omit<NonNullable<PortableProgramSpecV25["vanilla"]>, "cameras"> & { cameras?: PortableVanillaCameraV26[] };
};
type PortableV27Condition =
  | PortableV25Comparison
  | { op: "all" | "any"; conditions: PortableV27Condition[] }
  | { op: "not"; condition: PortableV27Condition };
type PortableV27PlayerAction =
  | Exclude<PortableV26PlayerAction, { op: "if" } | { op: "player_reduce"; kind: "any" | "all" }>
  | { op: "player_reduce"; kind: "any" | "all"; players: PortablePlayerSetRefV14; target: string; condition: PortableV27Condition }
  | { op: "if"; condition: PortableV27Condition; then: PortableV27PlayerAction[]; else?: PortableV27PlayerAction[] };
type PortableV27Action =
  | Exclude<PortableV26Action,
      | { op: "if" } | { op: "player_reduce"; kind: "any" | "all" }
      | { op: "for_each_player" | "for_single_player" | "for_session" }
      | { op: "interaction_use" | "interaction_controller_player" | "placeable_tick" }>
  | { op: "player_reduce"; kind: "any" | "all"; players: PortablePlayerSetRefV14; target: string; condition: PortableV27Condition }
  | { op: "if"; condition: PortableV27Condition; then: PortableV27Action[]; else?: PortableV27Action[] }
  | { op: "for_each_player" | "for_single_player"; players: PortablePlayerSetRefV14; actions: PortableV27Action[] }
  | { op: "for_session"; session: string; actions: PortableV27Action[] }
  | { op: "interaction_use"; interaction: string; actions: PortableV27PlayerAction[] }
  | { op: "interaction_controller_player"; interaction: string; actions: PortableV27PlayerAction[] }
  | { op: "placeable_tick"; placeable: string; slot: number; actions: PortableV27Action[] };
type PortableV27BlockProjection = Omit<PortableVanillaBlockProjection, "when"> & { when?: PortableV27Condition };
type PortableV27PlaceableBlockProjection = Omit<PortableVanillaBlockProjectionV25, "when"> & { when?: PortableV27Condition };
type PortableV27TextProjection = Omit<PortableVanillaTextProjection, "when"> & { when?: PortableV27Condition };
type PortableV27PlaceableTextProjection = Omit<PortableVanillaTextProjectionV25, "when"> & { when?: PortableV27Condition };
type PortableV27ActorProjection = Omit<PortableVanillaActorProjectionV22, "when"> & { when?: PortableV27Condition };
type PortableV27Interaction = Omit<PortableVanillaInteractionV23, "when"> & { when?: PortableV27Condition };
type PortableV27PlaceableInteraction = Omit<PortableVanillaInteractionV25, "when"> & { when?: PortableV27Condition };
type PortableV27ItemDisplay = Omit<PortableVanillaItemDisplayV25, "when"> & { when?: PortableV27Condition };
type PortableV27WorldBatch = Omit<PortableVanillaWorldBatch, "when"> & { when?: PortableV27Condition };
type PortableV27ParticleEmitter = Omit<PortableVanillaParticleEmitter, "when"> & { when?: PortableV27Condition };
type PortableV27SoundEmitter = Omit<PortableVanillaSoundEmitter, "when"> & { when?: PortableV27Condition };
type PortableProgramSpecV27 = Omit<PortableProgramSpecV26, "version" | "tick" | "vanilla"> & {
  version: 27;
  tick: PortableV27Action[];
  vanilla?: Omit<NonNullable<PortableProgramSpecV26["vanilla"]>,
    "projections" | "texts" | "actors" | "interactions" | "itemDisplays" | "worldBatches" | "particles" | "sounds"> & {
    projections?: Array<PortableV27BlockProjection | PortableV27PlaceableBlockProjection>;
    texts?: Array<PortableV27TextProjection | PortableV27PlaceableTextProjection>;
    actors?: PortableV27ActorProjection[];
    interactions?: Array<PortableV27Interaction | PortableV27PlaceableInteraction>;
    itemDisplays?: PortableV27ItemDisplay[];
    worldBatches?: PortableV27WorldBatch[];
    particles?: PortableV27ParticleEmitter[];
    sounds?: PortableV27SoundEmitter[];
  };
};
type PortableProgramSpec = PortableProgramSpecV1 | PortableProgramSpecV2 | PortableProgramSpecV3 | PortableProgramSpecV4 | PortableProgramSpecV5 | PortableProgramSpecV6 | PortableProgramSpecV7 | PortableProgramSpecV8 | PortableProgramSpecV9 | PortableProgramSpecV10 | PortableProgramSpecV11 | PortableProgramSpecV12 | PortableProgramSpecV13 | PortableProgramSpecV14 | PortableProgramSpecV15 | PortableProgramSpecV16 | PortableProgramSpecV17 | PortableProgramSpecV18 | PortableProgramSpecV19 | PortableProgramSpecV20 | PortableProgramSpecV21 | PortableProgramSpecV22 | PortableProgramSpecV23 | PortableProgramSpecV24 | PortableProgramSpecV25 | PortableProgramSpecV26 | PortableProgramSpecV27;

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
type PortableDslPersistentStateOptions = { schema?: number; onSchemaMismatch?: "reset" | "preserve" };
type PortableDslPersistentState = PortableDslComparable & {
  readonly name: string;
  set(value: PortableDslValue): void; add(value: PortableDslValue): void; sub(value: PortableDslValue): void; negate(): void;
};
type PortableDslSessionPersistentState = PortableDslComparable & {
  readonly name: string;
  set(value: PortableDslValue): void; add(value: PortableDslValue): void; sub(value: PortableDslValue): void; negate(): void;
};
type PortableDslInput = PortableDslComparable & { readonly name: string };
type PortableDslPlayerState = PortableDslComparable & {
  readonly name: string;
  set(value: PortableDslValue): void;
  add(value: PortableDslValue): void;
  sub(value: PortableDslValue): void;
  negate(): void;
};
type PortableDslSessionState = PortableDslComparable & {
  readonly name: string;
  set(value: PortableDslValue): void;
  add(value: PortableDslValue): void;
  sub(value: PortableDslValue): void;
  negate(): void;
};
type PortableDslPlayerInput = PortableDslComparable & { readonly name: PortablePlayerInputName };
type PortableDslDialogTextSpan = { text: string; color?: string; bold?: boolean; italic?: boolean; underlined?: boolean; strikethrough?: boolean };
type PortableDslDialogText = string | PortableDslDialogTextSpan | Array<string | PortableDslDialogTextSpan>;
type PortableDslDialogBodyElement =
  | { type: "text"; text: PortableDslDialogText; width?: number }
  | { type: "item"; item: string; count?: number; description?: PortableDslDialogText; descriptionWidth?: number; showTooltip?: boolean; showDecoration?: boolean; width?: number; height?: number };
type PortableDslPlayerSelection = PortableDslComparable & { open(): void; clear(): void };
type PortableDslSelectionSpec = {
  title: PortableDslDialogText; body?: string | PortableDslDialogBodyElement[]; columns?: number;
  options: Array<{ label: PortableDslDialogText; tooltip?: PortableDslDialogText; value: number }>;
  cancel?: { label?: PortableDslDialogText; tooltip?: PortableDslDialogText; value?: number };
};
type PortableDslConfirmationSpec = {
  title: PortableDslDialogText; body?: string | PortableDslDialogBodyElement[];
  yes?: { label?: PortableDslDialogText; tooltip?: PortableDslDialogText; value?: number };
  no?: { label?: PortableDslDialogText; tooltip?: PortableDslDialogText; value?: number };
};
type PortableDslSelection = { readonly __portableDslSelection?: never };
type PortableDslFormSpec = {
  title: PortableDslDialogText; body?: string | PortableDslDialogBodyElement[];
  input:
    | { type: "boolean"; label: PortableDslDialogText; initial?: boolean; trueValue?: number; falseValue?: number }
    | { type: "option"; label: PortableDslDialogText; options: Array<{ label: PortableDslDialogText; value: number }>; initial?: number; width?: number; labelVisible?: boolean }
    | { type: "range"; label: PortableDslDialogText; start: number; end: number; step?: number; initial?: number; width?: number };
  submit?: { label?: PortableDslDialogText; tooltip?: PortableDslDialogText };
  cancel?: { label?: PortableDslDialogText; tooltip?: PortableDslDialogText; value?: number };
};
type PortableDslForm = { readonly __portableDslForm?: never };
type PortableDslPlayerForm = PortableDslComparable & { open(): void; clear(): void };
type PortableDslGridWorldReady = PortableDslComparable & { readonly name: string };
type PortableDslSharedValue = number | PortableDslState | PortableDslPersistentState | PortableDslInput | PortableDslGridWorldReady;
type PortableDslPlaceableState = PortableDslComparable & { readonly name: string; set(value: PortableDslValue): void; add(value: PortableDslValue): void; sub(value: PortableDslValue): void; negate(): void };
type PortableDslValue = PortableDslSharedValue | PortableDslSessionState | PortableDslSessionPersistentState | PortableDslPlayerState | PortableDslPlayerInput | PortableDslPlayerSelection | PortableDslPlayerForm | PortableDslPlaceableState;
type PortableDslCondition = { readonly __portableDslCondition?: never };
type PortableDslConditionApi = {
  all(conditions: readonly PortableDslCondition[]): PortableDslCondition;
  any(conditions: readonly PortableDslCondition[]): PortableDslCondition;
  not(condition: PortableDslCondition): PortableDslCondition;
};
type PortableDslChooseCase = { when: PortableDslCondition; then: () => void };
type PortableDslMatchCase = readonly [PortableDslValue, () => void];
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
  text: string | Array<string | PortableDslState | PortableDslPersistentState | PortableDslInput>;
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  scale?: number | { x: number; y: number; z: number };
  billboard?: "fixed" | "vertical" | "horizontal" | "center";
  when?: PortableDslCondition;
};
type PortableDslGrid = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  fill(value: PortableDslValue): void;
  get(x: PortableDslValue, z: PortableDslValue, target: PortableDslState): void;
  set(x: PortableDslValue, z: PortableDslValue, value: PortableDslValue): void;
  fillRect(spec: { x: PortableDslValue; z: PortableDslValue; width: PortableDslValue; height: PortableDslValue; value: PortableDslValue }): void;
};
type PortableDslPersistentGridSpec = {
  width: number; height: number; initial?: number; outside?: number; schema?: number; onSchemaMismatch?: "reset" | "preserve";
};
type PortableDslPersistentGrid = {
  readonly id: string; readonly width: number; readonly height: number;
  fill(value: PortableDslValue): void;
  get(x: PortableDslValue, z: PortableDslValue, target: PortableDslState): void;
  set(x: PortableDslValue, z: PortableDslValue, value: PortableDslValue): void;
  fillRect(spec: { x: PortableDslValue; z: PortableDslValue; width: PortableDslValue; height: PortableDslValue; value: PortableDslValue }): void;
};
type PortableDslRng = {
  readonly id: string;
  reset(): void;
  int(target: PortableDslState, min: number, max: number): void;
};
type PortableDslSessionGrid = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  fill(value: PortableDslValue): void;
  get(x: PortableDslValue, z: PortableDslValue, target: PortableDslSessionState): void;
  set(x: PortableDslValue, z: PortableDslValue, value: PortableDslValue): void;
  fillRect(spec: { x: PortableDslValue; z: PortableDslValue; width: PortableDslValue; height: PortableDslValue; value: PortableDslValue }): void;
};
type PortableDslSessionPersistentGrid = {
  readonly id: string; readonly width: number; readonly height: number;
  fill(value: PortableDslValue): void;
  get(x: PortableDslValue, z: PortableDslValue, target: PortableDslSessionState): void;
  set(x: PortableDslValue, z: PortableDslValue, value: PortableDslValue): void;
  fillRect(spec: { x: PortableDslValue; z: PortableDslValue; width: PortableDslValue; height: PortableDslValue; value: PortableDslValue }): void;
};
type PortableDslSessionRng = {
  readonly id: string;
  reset(): void;
  int(target: PortableDslSessionState, min: number, max: number): void;
};
type PortableDslGridWorld = {
  readonly id: string;
  readonly ready: PortableDslGridWorldReady;
  rebuild(): void;
};
type PortableDslGridWorldSpec = {
  grid: PortableDslGrid;
  dimension?: string;
  originX: number;
  y: number;
  originZ: number;
  palette: Array<{ value: number; block: string }>;
  cellsPerTick?: number;
};
type PortableDslSessionGridWorldSpec = Omit<PortableDslGridWorldSpec, "grid"> & { grid: PortableDslSessionGrid };
type PortableDslPlayerSet = { readonly __portableDslPlayerSet?: never };
type PortableDslCameraSpec = {
  dimension?: string;
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  yaw?: number;
  pitch?: number;
  mode?: "position_lock" | "spectate";
  audience?: PortableDslPlayerSet | PortableDslInteractionController;
};
type PortableDslActorSpec = {
  dimension?: string;
  entityType?: "minecraft:mannequin" | "minecraft:zombie" | "minecraft:skeleton";
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  yaw?: PortableDslCoordinate;
  pitch?: PortableDslCoordinate;
  profile?: PortableVanillaActorProfileV22;
  hiddenLayers?: Array<"cape" | "jacket" | "left_sleeve" | "right_sleeve" | "left_pants_leg" | "right_pants_leg" | "hat">;
  pose?: "standing" | "crouching" | "swimming" | "fall_flying" | "sleeping";
  mainHand?: "left" | "right";
  equipment?: PortableVanillaActorEquipmentV22;
  when?: PortableDslCondition;
};
type PortableDslItemAppearance =
  | { kind: "head"; textureUrl: string }
  | { kind: "model"; model: string };
type PortableDslItem = {
  readonly id: string;
  give(player: PortableDslInteractionPlayerContext | PortableDslPlayerContext, count?: number): void;
};
type PortableDslItemSpec = { name: string; appearance: PortableDslItemAppearance; maxStackSize?: number };
type PortableDslPlaceableLocalValue = number | PortableDslPlaceableState;
type PortableDslPlaceableBlockSpec = Omit<PortableDslBlockSpec, "x" | "y" | "z"> & { x: PortableDslPlaceableLocalValue; y: PortableDslPlaceableLocalValue; z: PortableDslPlaceableLocalValue };
type PortableDslPlaceableTextSpec = Omit<PortableDslTextSpec, "text" | "x" | "y" | "z"> & {
  text: string | Array<string | PortableDslPlaceableState>;
  x: PortableDslPlaceableLocalValue; y: PortableDslPlaceableLocalValue; z: PortableDslPlaceableLocalValue;
};
type PortableDslPlaceableInteractionSpec = Omit<PortableDslInteractionSpec, "x" | "y" | "z"> & {
  x: PortableDslPlaceableLocalValue; y: PortableDslPlaceableLocalValue; z: PortableDslPlaceableLocalValue;
};
type PortableDslPlaceableItemDisplaySpec = {
  dimension?: string; item: PortableDslItem;
  x: PortableDslPlaceableLocalValue; y: PortableDslPlaceableLocalValue; z: PortableDslPlaceableLocalValue;
  scale?: number | { x: number; y: number; z: number };
  translation?: { x: number; y: number; z: number };
  when?: PortableDslCondition;
};
type PortableDslPlaceableContext = {
  state(name: string, initial: number): PortableDslPlaceableState;
  block(id: string, spec: PortableDslPlaceableBlockSpec): void;
  text(id: string, spec: PortableDslPlaceableTextSpec): void;
  interaction(id: string, spec: PortableDslPlaceableInteractionSpec): PortableDslInteraction;
  itemDisplay(id: string, spec: PortableDslPlaceableItemDisplaySpec): void;
  circle(id: string, spec: PortableDslCircleSpec): PortableDslCircle;
  segment(id: string, spec: PortableDslSegmentSpec): PortableDslSegment;
  capsule(id: string, spec: PortableDslCapsuleSpec): PortableDslCapsule;
  trigger(id: string, spec: PortableDslBoxSpec): PortableDslTrigger;
  flipper(id: string, spec: PortableDslFlipperSpec): PortableDslFlipper;
  tick(callback: () => void): void;
  remove(): void;
  pickUp(player: PortableDslInteractionPlayerContext | PortableDslPlayerContext): void;
};
type PortableDslPlaceableSpec = { item: PortableDslItem; maxInstances: number; orientation?: "cardinal" };
type PortableDslInteractionSpec = {
  dimension?: string;
  x: PortableDslCoordinate;
  y: PortableDslCoordinate;
  z: PortableDslCoordinate;
  width?: number;
  height?: number;
  response?: boolean;
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
type PortableDslHudSpec = { text: string | Array<string | PortableDslState | PortableDslPersistentState | PortableDslInput> };
type PortableDslPlayerHudSpec = { text: string | Array<string | PortableDslState | PortableDslPersistentState | PortableDslInput | PortableDslSessionState | PortableDslSessionPersistentState | PortableDslPlayerState | PortableDslPlayerInput | PortableDslPlayerSelection | PortableDslPlayerForm> };
type PortableDslPlayerContext = {
  state(name: string, initial: number): PortableDslPlayerState;
  readonly input: {
    readonly hotbarSlot: PortableDslPlayerInput;
    readonly forward: PortableDslPlayerInput;
    readonly backward: PortableDslPlayerInput;
    readonly left: PortableDslPlayerInput;
    readonly right: PortableDslPlayerInput;
    readonly jump: PortableDslPlayerInput;
    readonly sneak: PortableDslPlayerInput;
    readonly sprint: PortableDslPlayerInput;
  };
  selection(selection: PortableDslSelection): PortableDslPlayerSelection;
  form(form: PortableDslForm): PortableDslPlayerForm;
  hud(id: string, spec: PortableDslPlayerHudSpec): void;
};
type PortableDslInteractionPlayerContext = Omit<PortableDslPlayerContext, "hud">;
type PortableDslInteractionController = {
  claim(player: PortableDslInteractionPlayerContext): void;
  returnToInteraction(player: PortableDslInteractionPlayerContext): void;
  forPlayer(callback: (player: PortableDslInteractionPlayerContext) => void): void;
};
type PortableDslInteraction = {
  readonly id: string;
  readonly controller: PortableDslInteractionController;
  onUse(callback: (player: PortableDslInteractionPlayerContext) => void): void;
};
type PortableDslGlobalReduction = {
  count(players: PortableDslPlayerSet, target: PortableDslState): void;
  sum(players: PortableDslPlayerSet, target: PortableDslState, select: (player: PortableDslPlayerContext) => PortableDslValue): void;
  min(players: PortableDslPlayerSet, target: PortableDslState, empty: number, select: (player: PortableDslPlayerContext) => PortableDslValue): void;
  max(players: PortableDslPlayerSet, target: PortableDslState, empty: number, select: (player: PortableDslPlayerContext) => PortableDslValue): void;
  any(players: PortableDslPlayerSet, target: PortableDslState, test: (player: PortableDslPlayerContext) => PortableDslCondition): void;
  all(players: PortableDslPlayerSet, target: PortableDslState, test: (player: PortableDslPlayerContext) => PortableDslCondition): void;
};
type PortableDslSessionReduction = {
  count(target: PortableDslSessionState): void;
  sum(target: PortableDslSessionState, select: (player: PortableDslPlayerContext) => PortableDslValue): void;
  min(target: PortableDslSessionState, empty: number, select: (player: PortableDslPlayerContext) => PortableDslValue): void;
  max(target: PortableDslSessionState, empty: number, select: (player: PortableDslPlayerContext) => PortableDslValue): void;
  any(target: PortableDslSessionState, test: (player: PortableDslPlayerContext) => PortableDslCondition): void;
  all(target: PortableDslSessionState, test: (player: PortableDslPlayerContext) => PortableDslCondition): void;
};
type PortableDslSessionContext = {
  readonly id: string;
  readonly players: PortableDslPlayerSet;
  state(name: string, initial: number): PortableDslSessionState;
  persistentState(name: string, initial: number, options?: PortableDslPersistentStateOptions): PortableDslSessionPersistentState;
  readonly reduce: PortableDslSessionReduction;
  grid(id: string, spec: { width: number; height: number; initial?: number; outside?: number }): PortableDslSessionGrid;
  persistentGrid(id: string, spec: PortableDslPersistentGridSpec): PortableDslSessionPersistentGrid;
  rng(id: string, spec: { seed: number }): PortableDslSessionRng;
  gridWorld(id: string, spec: PortableDslSessionGridWorldSpec): PortableDslGridWorld;
  forEachPlayer(callback: (player: PortableDslPlayerContext) => void): void;
  forSinglePlayer(callback: (player: PortableDslPlayerContext) => void): void;
};
type PortableDslSidebarRow = { id: string; text: string | Array<string | PortableDslState | PortableDslPersistentState | PortableDslInput> };
type PortableDslSidebarSpec = { title: string; rows: PortableDslSidebarRow[] };
type PortableDsl = {
  state(name: string, initial: number): PortableDslState;
  persistentState(name: string, initial: number, options?: PortableDslPersistentStateOptions): PortableDslPersistentState;
  input(name: string, initial?: number, binding?: PortableDslInputBinding): PortableDslInput;
  players(): PortableDslPlayerSet;
  teamPlayers(team: string): PortableDslPlayerSet;
  selection(id: string, spec: PortableDslSelectionSpec): PortableDslSelection;
  confirmation(id: string, spec: PortableDslConfirmationSpec): PortableDslSelection;
  form(id: string, spec: PortableDslFormSpec): PortableDslForm;
  forEachPlayer(players: PortableDslPlayerSet, callback: (player: PortableDslPlayerContext) => void): void;
  forSinglePlayer(players: PortableDslPlayerSet, callback: (player: PortableDslPlayerContext) => void): void;
  readonly reduce: PortableDslGlobalReduction;
  session(id: string, players: PortableDslPlayerSet, callback: (session: PortableDslSessionContext) => void): void;
  grid(id: string, spec: { width: number; height: number; initial?: number; outside?: number }): PortableDslGrid;
  persistentGrid(id: string, spec: PortableDslPersistentGridSpec): PortableDslPersistentGrid;
  rng(id: string, spec: { seed: number }): PortableDslRng;
  gridWorld(id: string, spec: PortableDslGridWorldSpec): PortableDslGridWorld;
  item(id: string, spec: PortableDslItemSpec): PortableDslItem;
  placeable(id: string, spec: PortableDslPlaceableSpec, template: (instance: PortableDslPlaceableContext) => void): void;
  tick(callback: () => void): void;
  repeat<T>(count: number, callback: (index: number) => T): readonly T[];
  when(condition: PortableDslCondition, thenCallback: () => void, elseCallback?: () => void): void;
  readonly condition: PortableDslConditionApi;
  unless(condition: PortableDslCondition, thenCallback: () => void, elseCallback?: () => void): void;
  choose(cases: readonly PortableDslChooseCase[], otherwiseCallback?: () => void): void;
  match(value: PortableDslValue, cases: readonly PortableDslMatchCase[], otherwiseCallback?: () => void): void;
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
  interaction(id: string, spec: PortableDslInteractionSpec): PortableDslInteraction;
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
