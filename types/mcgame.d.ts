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
};

type McGamePosition = {
  dimension?: string;
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  pitch?: number;
};

declare const game: {
  onStart(callback: () => void): void;
  onTick(callback: (ctx: { tick: number }) => void): void;
  log(...values: unknown[]): void;
};

declare const input: {
  players(): McGamePlayerInput[];
  get(playerIdOrName: string): McGamePlayerInput | null;
};

declare const actors: {
  spawn(id: string, options: McGamePosition & { texture?: string }): void;
  move(id: string, options: McGamePosition): void;
  remove(id: string): void;
};

declare const camera: {
  attach(playerIdOrName: string, options: McGamePosition): void;
  move(playerIdOrName: string, options: McGamePosition): void;
  detach(playerIdOrName: string): void;
};

declare const world: {
  setBlock(options: { dimension?: string; x: number; y: number; z: number; block: string }): void;
};

declare const effects: {
  particle(options: { dimension?: string; particle: string; x: number; y: number; z: number }): void;
  sound(options: { dimension?: string; sound: string; x: number; y: number; z: number; volume?: number; pitch?: number }): void;
};
