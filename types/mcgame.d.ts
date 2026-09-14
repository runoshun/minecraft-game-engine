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
type PortableProgramSpec = PortableProgramSpecV1 | PortableProgramSpecV2 | PortableProgramSpecV3 | PortableProgramSpecV4 | PortableProgramSpecV5 | PortableProgramSpecV6 | PortableProgramSpecV7 | PortableProgramSpecV8 | PortableProgramSpecV9 | PortableProgramSpecV10 | PortableProgramSpecV11 | PortableProgramSpecV12 | PortableProgramSpecV13 | PortableProgramSpecV14 | PortableProgramSpecV15 | PortableProgramSpecV16 | PortableProgramSpecV17 | PortableProgramSpecV18;

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
type PortableDslGridWorldReady = PortableDslComparable & { readonly name: string };
type PortableDslSharedValue = number | PortableDslState | PortableDslPersistentState | PortableDslInput | PortableDslGridWorldReady;
type PortableDslValue = PortableDslSharedValue | PortableDslSessionState | PortableDslSessionPersistentState | PortableDslPlayerState | PortableDslPlayerInput;
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
  audience?: PortableDslPlayerSet;
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
type PortableDslHudSpec = { text: string | Array<string | PortableDslState | PortableDslPersistentState | PortableDslInput> };
type PortableDslPlayerHudSpec = { text: string | Array<string | PortableDslState | PortableDslPersistentState | PortableDslInput | PortableDslSessionState | PortableDslSessionPersistentState | PortableDslPlayerState | PortableDslPlayerInput> };
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
  hud(id: string, spec: PortableDslPlayerHudSpec): void;
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
  forEachPlayer(players: PortableDslPlayerSet, callback: (player: PortableDslPlayerContext) => void): void;
  forSinglePlayer(players: PortableDslPlayerSet, callback: (player: PortableDslPlayerContext) => void): void;
  readonly reduce: PortableDslGlobalReduction;
  session(id: string, players: PortableDslPlayerSet, callback: (session: PortableDslSessionContext) => void): void;
  grid(id: string, spec: { width: number; height: number; initial?: number; outside?: number }): PortableDslGrid;
  rng(id: string, spec: { seed: number }): PortableDslRng;
  gridWorld(id: string, spec: PortableDslGridWorldSpec): PortableDslGridWorld;
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
