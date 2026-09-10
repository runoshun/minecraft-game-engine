type PlayerInput = {
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

type GameStatus = "building" | "waiting" | "serve" | "playing" | "won" | "gameover";

type Brick = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  block: string;
  alive: boolean;
};

type BlockNodeSpec = {
  id: string;
  block: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
};

const DIMENSION = "minecraft:overworld";

const BOARD_CENTER_X = 80;
const BOARD_CENTER_Y = 112;
const BOARD_Z = 0.6;
const BOARD_WIDTH = 14;
const BOARD_HEIGHT = 16;
const BOARD_LEFT = BOARD_CENTER_X - BOARD_WIDTH / 2;
const BOARD_RIGHT = BOARD_CENTER_X + BOARD_WIDTH / 2;
const BOARD_BOTTOM = BOARD_CENTER_Y - BOARD_HEIGHT / 2;
const BOARD_TOP = BOARD_CENTER_Y + BOARD_HEIGHT / 2;

const CAMERA_X = BOARD_CENTER_X;
const CAMERA_Y = BOARD_CENTER_Y;
const CAMERA_Z = -22;

const START_TRIGGER_X = 90.5;
const START_TRIGGER_Y = 112;
const START_TRIGGER_Z = -22.5;
const STOP_TRIGGER_X = 91.5;
const STOP_TRIGGER_Y = 112;
const STOP_TRIGGER_Z = -22.5;
const TRIGGER_EPSILON = 0.2;

const PADDLE_Y = BOARD_BOTTOM + 1.35;
const PADDLE_WIDTH = 3.0;
const PADDLE_HEIGHT = 0.42;
const PADDLE_SPEED = 0.46;

const BALL_RADIUS = 0.23;
const BALL_SIZE = BALL_RADIUS * 2;
const BALL_SERVE_Y = PADDLE_Y + 0.62;
const BASE_BALL_SPEED = 0.34;
const MAX_BALL_SPEED = 0.62;
const BALL_SUBSTEPS = 4;

const BRICK_ROWS = 5;
const BRICK_COLUMNS = 8;
const BRICK_GAP_X = 0.16;
const BRICK_GAP_Y = 0.18;
const BRICK_HEIGHT = 0.66;
const BRICK_AREA_LEFT = BOARD_LEFT + 0.65;
const BRICK_AREA_RIGHT = BOARD_RIGHT - 0.65;
const BRICK_AREA_WIDTH = BRICK_AREA_RIGHT - BRICK_AREA_LEFT;
const BRICK_WIDTH = (BRICK_AREA_WIDTH - BRICK_GAP_X * (BRICK_COLUMNS - 1)) / BRICK_COLUMNS;
const BRICK_TOP_Y = BOARD_TOP - 1.55;
const BRICK_BLOCKS = [
  "minecraft:red_concrete",
  "minecraft:orange_concrete",
  "minecraft:yellow_concrete",
  "minecraft:lime_concrete",
  "minecraft:light_blue_concrete",
];

const SCORE_PER_BRICK = 100;
const STARTING_LIVES = 3;
const BUILD_NODES_PER_TICK = 1;

let currentTick = 0;
let controllerId: string | null = null;
let status: GameStatus = "building";
let pendingStatusAfterBuild: GameStatus = "waiting";
let score = 0;
let lives = STARTING_LIVES;
let combo = 0;
let level = 1;
let remainingBricks = 0;
let paddleX = BOARD_CENTER_X;
let bricks: Brick[] = [];
let buildQueue: BlockNodeSpec[] = [];
let sceneActive = false;
let sceneInitStep = 0;
let movingNodesReady = false;
const spawnedNodeIds = new Set<string>();

const ball = {
  x: BOARD_CENTER_X,
  y: BALL_SERVE_Y,
  vx: 0,
  vy: 0,
};

const cameraAttached = new Set<string>();
const startTriggerConsumed = new Set<string>();
const stopTriggerConsumed = new Set<string>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function near(value: number, expected: number): boolean {
  return Math.abs(value - expected) <= TRIGGER_EPSILON;
}

function isAtTrigger(p: PlayerInput, x: number, y: number, z: number): boolean {
  return p.dimension === DIMENSION && near(p.x, x) && near(p.y, y) && near(p.z, z);
}

function isStartTrigger(p: PlayerInput): boolean {
  return isAtTrigger(p, START_TRIGGER_X, START_TRIGGER_Y, START_TRIGGER_Z);
}

function isStopTrigger(p: PlayerInput): boolean {
  return isAtTrigger(p, STOP_TRIGGER_X, STOP_TRIGGER_Y, STOP_TRIGGER_Z);
}

function blockNode(spec: BlockNodeSpec, smoothing = false): void {
  render.spawn(spec.id, {
    visual: { kind: "block", block: spec.block },
    dimension: DIMENSION,
    x: spec.x,
    y: spec.y,
    z: spec.z,
    scale: { x: spec.w, y: spec.h, z: spec.d },
    offset: { x: -spec.w / 2, y: -spec.h / 2, z: -spec.d / 2 },
    smoothing: smoothing ? { positionTicks: 1, transformTicks: 0 } : { positionTicks: 0, transformTicks: 0 },
  });
  spawnedNodeIds.add(spec.id);
}

function queueBlockNode(spec: BlockNodeSpec): void {
  buildQueue.push(spec);
}

function spawnSceneInitNode(): void {
  if (sceneInitStep === 0) {
    blockNode({
      id: "paddle",
      block: "minecraft:cyan_concrete",
      x: paddleX,
      y: PADDLE_Y,
      z: BOARD_Z - 0.28,
      w: PADDLE_WIDTH,
      h: PADDLE_HEIGHT,
      d: 0.48,
    }, true);
  } else if (sceneInitStep === 1) {
    blockNode({
      id: "ball",
      block: "minecraft:sea_lantern",
      x: ball.x,
      y: ball.y,
      z: BOARD_Z - 0.42,
      w: BALL_SIZE,
      h: BALL_SIZE,
      d: BALL_SIZE,
    }, true);
  } else if (sceneInitStep === 2) {
    render.spawn("title", {
      visual: {
        kind: "text",
        text: [
          { text: "MINECRAFT ", tone: "muted", bold: true },
          { text: "BREAKOUT", tone: "info", bold: true },
        ],
      },
      dimension: DIMENSION,
      x: BOARD_CENTER_X,
      y: BOARD_TOP + 1.25,
      z: BOARD_Z - 0.55,
      scale: 0.9,
      billboard: "center",
    });
    spawnedNodeIds.add("title");
  } else if (sceneInitStep === 3) {
    render.spawn("status", {
      visual: { kind: "text", text: "BUILDING BOARD..." },
      dimension: DIMENSION,
      x: BOARD_CENTER_X,
      y: BOARD_BOTTOM - 1.0,
      z: BOARD_Z - 0.55,
      scale: 0.7,
      billboard: "center",
    });
    spawnedNodeIds.add("status");
    movingNodesReady = true;
  }
  sceneInitStep += 1;
}

function queueStaticBoard(): void {
  queueBlockNode({
    id: "background",
    block: "minecraft:black_concrete",
    x: BOARD_CENTER_X,
    y: BOARD_CENTER_Y,
    z: BOARD_Z + 0.72,
    w: BOARD_WIDTH + 0.5,
    h: BOARD_HEIGHT + 0.5,
    d: 0.25,
  });
  queueBlockNode({
    id: "wall_left",
    block: "minecraft:deepslate_tiles",
    x: BOARD_LEFT - 0.24,
    y: BOARD_CENTER_Y,
    z: BOARD_Z + 0.08,
    w: 0.48,
    h: BOARD_HEIGHT + 0.5,
    d: 0.62,
  });
  queueBlockNode({
    id: "wall_right",
    block: "minecraft:deepslate_tiles",
    x: BOARD_RIGHT + 0.24,
    y: BOARD_CENTER_Y,
    z: BOARD_Z + 0.08,
    w: 0.48,
    h: BOARD_HEIGHT + 0.5,
    d: 0.62,
  });
  queueBlockNode({
    id: "wall_top",
    block: "minecraft:deepslate_tiles",
    x: BOARD_CENTER_X,
    y: BOARD_TOP + 0.24,
    z: BOARD_Z + 0.08,
    w: BOARD_WIDTH + 0.5,
    h: 0.48,
    d: 0.62,
  });
}

function makeBricks(): Brick[] {
  const next: Brick[] = [];
  for (let row = 0; row < BRICK_ROWS; row += 1) {
    for (let column = 0; column < BRICK_COLUMNS; column += 1) {
      const x = BRICK_AREA_LEFT + BRICK_WIDTH / 2 + column * (BRICK_WIDTH + BRICK_GAP_X);
      const y = BRICK_TOP_Y - row * (BRICK_HEIGHT + BRICK_GAP_Y);
      next.push({
        id: `brick_${row}_${column}`,
        x,
        y,
        w: BRICK_WIDTH,
        h: BRICK_HEIGHT,
        block: BRICK_BLOCKS[row] ?? "minecraft:white_concrete",
        alive: true,
      });
    }
  }
  return next;
}

function queueBrickNodes(): void {
  for (const brick of bricks) {
    queueBlockNode({
      id: brick.id,
      block: brick.block,
      x: brick.x,
      y: brick.y,
      z: BOARD_Z,
      w: brick.w,
      h: brick.h,
      d: 0.5,
    });
  }
}

function removeBrickNodes(): void {
  for (const brick of bricks) {
    if (!spawnedNodeIds.has(brick.id)) continue;
    render.remove(brick.id);
    spawnedNodeIds.delete(brick.id);
  }
}

function clearScene(): void {
  buildQueue = [];
  for (const id of Array.from(spawnedNodeIds)) render.remove(id);
  spawnedNodeIds.clear();
  sceneActive = false;
  sceneInitStep = 0;
  movingNodesReady = false;
}

function beginSceneBuild(): void {
  score = 0;
  lives = STARTING_LIVES;
  combo = 0;
  level = 1;
  paddleX = BOARD_CENTER_X;
  bricks = makeBricks();
  remainingBricks = bricks.length;
  ball.x = BOARD_CENTER_X;
  ball.y = BALL_SERVE_Y;
  ball.vx = 0;
  ball.vy = 0;
  buildQueue = [];
  queueStaticBoard();
  queueBrickNodes();
  sceneActive = true;
  sceneInitStep = 0;
  movingNodesReady = false;
  pendingStatusAfterBuild = "serve";
  status = "building";
}

function setStatusText(text: string): void {
  if (!movingNodesReady) return;
  render.update("status", { visual: { kind: "text", text } });
}

function statusLabel(): string {
  switch (status) {
    case "building": return "BUILDING";
    case "waiting": return "WAITING";
    case "serve": return "READY";
    case "playing": return "PLAY";
    case "won": return "CLEAR";
    case "gameover": return "GAME OVER";
  }
}

function updateHud(): void {
  if (!controllerId) return;
  ui.panel(controllerId, {
    title: [
      { text: "BREAKOUT", tone: "info", bold: true },
      { text: `  L${level}`, tone: "muted" },
    ],
    rows: [
      { id: "score", label: "Score", value: String(score) },
      { id: "lives", label: "Lives", value: "●".repeat(Math.max(0, lives)) },
      { id: "combo", label: "Combo", value: combo > 1 ? `x${combo}` : "-" },
      { id: "bricks", label: "Bricks", value: String(remainingBricks) },
      { id: "state", label: "State", value: statusLabel() },
      { id: "move", label: "A / D", value: "move paddle" },
      { id: "launch", label: "Space / Click", value: "launch / continue" },
      { id: "leave", label: "Leave", value: "/function breakout:stop" },
    ],
  });
}

function updateMovingPresentation(): void {
  if (!movingNodesReady) return;
  render.update("paddle", { x: paddleX });
  render.update("ball", { x: ball.x, y: ball.y });
}

function processBuildQueue(): void {
  if (!sceneActive) return;
  if (sceneInitStep < 4) {
    spawnSceneInitNode();
    return;
  }
  if (buildQueue.length === 0) return;
  const count = Math.min(BUILD_NODES_PER_TICK, buildQueue.length);
  for (let i = 0; i < count; i += 1) {
    const spec = buildQueue.shift();
    if (spec) blockNode(spec);
  }
  if (buildQueue.length === 0) {
    status = pendingStatusAfterBuild;
    if (status === "serve") {
      setServeBall();
      setStatusText("SPACE / ATTACK / USE TO LAUNCH");
    }
  }
}

function setServeBall(): void {
  ball.x = paddleX;
  ball.y = BALL_SERVE_Y;
  ball.vx = 0;
  ball.vy = 0;
  updateMovingPresentation();
}

function levelBallSpeed(): number {
  return Math.min(MAX_BALL_SPEED, BASE_BALL_SPEED + (level - 1) * 0.035);
}

function launchBall(): void {
  const speed = levelBallSpeed();
  const horizontal = speed * (level % 2 === 0 ? -0.48 : 0.48);
  ball.vx = horizontal;
  ball.vy = Math.sqrt(Math.max(0.01, speed * speed - horizontal * horizontal));
  status = "playing";
  combo = 0;
  setStatusText("BREAK THEM ALL");
  effects.sound({
    sound: "minecraft:block.note_block.pling",
    x: ball.x,
    y: ball.y,
    z: BOARD_Z,
    volume: 0.55,
    pitch: 1.35,
  });
}

function setBallSpeed(speed: number): void {
  const current = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (current <= 0.0001) return;
  const target = clamp(speed, BASE_BALL_SPEED, MAX_BALL_SPEED);
  ball.vx = (ball.vx / current) * target;
  ball.vy = (ball.vy / current) * target;
}

function rebuildBricks(nextStatus: GameStatus): void {
  removeBrickNodes();
  bricks = makeBricks();
  remainingBricks = bricks.length;
  buildQueue = [];
  queueBrickNodes();
  pendingStatusAfterBuild = nextStatus;
  status = "building";
  setServeBall();
  setStatusText("BUILDING NEXT BOARD...");
}

function resetNewGame(): void {
  score = 0;
  lives = STARTING_LIVES;
  combo = 0;
  level = 1;
  paddleX = BOARD_CENTER_X;
  rebuildBricks("serve");
}

function advanceLevel(): void {
  level += 1;
  lives = Math.min(5, lives + 1);
  combo = 0;
  paddleX = BOARD_CENTER_X;
  rebuildBricks("serve");
  effects.sound({
    sound: "minecraft:ui.toast.challenge_complete",
    x: BOARD_CENTER_X,
    y: BOARD_CENTER_Y,
    z: BOARD_Z,
    volume: 0.75,
    pitch: 1.1,
  });
}

function releaseController(playerId: string): void {
  ui.panel(playerId, null);
  if (cameraAttached.has(playerId)) camera.detach(playerId);
  cameraAttached.delete(playerId);
  if (controllerId === playerId) controllerId = null;
  clearScene();
  status = "waiting";
  pendingStatusAfterBuild = "waiting";
}

function claimController(p: PlayerInput): void {
  if (controllerId && controllerId !== p.id) releaseController(controllerId);
  if (cameraAttached.has(p.id)) {
    camera.detach(p.id);
    cameraAttached.delete(p.id);
  }
  controllerId = p.id;
  game.log("BREAKOUT_CONTROLLER", p.name);
  if (sceneActive) clearScene();
  beginSceneBuild();
}

function cameraOptions(): { x: number; y: number; z: number; yaw: number; pitch: number } {
  return { x: CAMERA_X, y: CAMERA_Y, z: CAMERA_Z, yaw: 0, pitch: 0 };
}

function movePaddle(p: PlayerInput): void {
  let delta = 0;
  // With yaw 0 (+Z), screen-left is +X and screen-right is -X.
  if (p.left && !p.right) delta += PADDLE_SPEED;
  if (p.right && !p.left) delta -= PADDLE_SPEED;
  if (delta === 0) return;
  const half = PADDLE_WIDTH / 2;
  paddleX = clamp(paddleX + delta, BOARD_LEFT + half + 0.15, BOARD_RIGHT - half - 0.15);
  if (status === "serve") ball.x = paddleX;
}

function ballIntersectsBrick(brick: Brick): boolean {
  const left = brick.x - brick.w / 2;
  const right = brick.x + brick.w / 2;
  const bottom = brick.y - brick.h / 2;
  const top = brick.y + brick.h / 2;
  return ball.x + BALL_RADIUS >= left && ball.x - BALL_RADIUS <= right &&
    ball.y + BALL_RADIUS >= bottom && ball.y - BALL_RADIUS <= top;
}

function bounceFromBrick(brick: Brick, previousX: number, previousY: number): void {
  const left = brick.x - brick.w / 2;
  const right = brick.x + brick.w / 2;
  const bottom = brick.y - brick.h / 2;
  const top = brick.y + brick.h / 2;

  if (previousX <= left - BALL_RADIUS) {
    ball.x = left - BALL_RADIUS;
    ball.vx = -Math.abs(ball.vx);
    return;
  }
  if (previousX >= right + BALL_RADIUS) {
    ball.x = right + BALL_RADIUS;
    ball.vx = Math.abs(ball.vx);
    return;
  }
  if (previousY <= bottom - BALL_RADIUS) {
    ball.y = bottom - BALL_RADIUS;
    ball.vy = -Math.abs(ball.vy);
    return;
  }
  if (previousY >= top + BALL_RADIUS) {
    ball.y = top + BALL_RADIUS;
    ball.vy = Math.abs(ball.vy);
    return;
  }

  const overlapX = brick.w / 2 + BALL_RADIUS - Math.abs(ball.x - brick.x);
  const overlapY = brick.h / 2 + BALL_RADIUS - Math.abs(ball.y - brick.y);
  if (overlapX < overlapY) {
    if (ball.x < brick.x) {
      ball.x = left - BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx);
    } else {
      ball.x = right + BALL_RADIUS;
      ball.vx = Math.abs(ball.vx);
    }
  } else if (ball.y < brick.y) {
    ball.y = bottom - BALL_RADIUS;
    ball.vy = -Math.abs(ball.vy);
  } else {
    ball.y = top + BALL_RADIUS;
    ball.vy = Math.abs(ball.vy);
  }
}

function hitBrick(brick: Brick): void {
  brick.alive = false;
  remainingBricks -= 1;
  combo += 1;
  score += SCORE_PER_BRICK * Math.min(combo, 8);
  render.remove(brick.id);
  spawnedNodeIds.delete(brick.id);

  effects.particle({
    particle: "minecraft:happy_villager",
    x: brick.x,
    y: brick.y,
    z: BOARD_Z - 0.25,
  });
  effects.sound({
    sound: "minecraft:block.amethyst_block.hit",
    x: brick.x,
    y: brick.y,
    z: BOARD_Z,
    volume: 0.45,
    pitch: Math.min(1.8, 0.9 + combo * 0.045),
  });

  const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  setBallSpeed(Math.min(MAX_BALL_SPEED, currentSpeed + 0.004));

  if (remainingBricks <= 0) {
    status = "won";
    ball.vx = 0;
    ball.vy = 0;
    setStatusText("BOARD CLEAR!  SPACE / CLICK FOR NEXT LEVEL");
    effects.sound({
      sound: "minecraft:ui.toast.challenge_complete",
      x: BOARD_CENTER_X,
      y: BOARD_CENTER_Y,
      z: BOARD_Z,
      volume: 0.9,
      pitch: 1.2,
    });
  }
}

function collideBricks(previousX: number, previousY: number): void {
  for (const brick of bricks) {
    if (!brick.alive || !ballIntersectsBrick(brick)) continue;
    bounceFromBrick(brick, previousX, previousY);
    hitBrick(brick);
    return;
  }
}

function collidePaddle(previousY: number): void {
  if (ball.vy >= 0) return;
  const halfW = PADDLE_WIDTH / 2;
  const halfH = PADDLE_HEIGHT / 2;
  const left = paddleX - halfW;
  const right = paddleX + halfW;
  const bottom = PADDLE_Y - halfH;
  const top = PADDLE_Y + halfH;

  const intersects = ball.x + BALL_RADIUS >= left && ball.x - BALL_RADIUS <= right &&
    ball.y + BALL_RADIUS >= bottom && ball.y - BALL_RADIUS <= top;
  if (!intersects || previousY < top + BALL_RADIUS) return;

  ball.y = top + BALL_RADIUS;
  const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  const hit = clamp((ball.x - paddleX) / halfW, -1, 1);
  ball.vx = hit * speed * 0.82;
  ball.vy = Math.sqrt(Math.max(0.01, speed * speed - ball.vx * ball.vx));
  combo = 0;
  effects.sound({
    sound: "minecraft:block.note_block.hat",
    x: paddleX,
    y: PADDLE_Y,
    z: BOARD_Z,
    volume: 0.45,
    pitch: 1.25,
  });
}

function loseBall(): void {
  lives -= 1;
  combo = 0;
  effects.sound({
    sound: "minecraft:entity.player.hurt",
    x: ball.x,
    y: BOARD_BOTTOM,
    z: BOARD_Z,
    volume: 0.65,
    pitch: 0.75,
  });

  if (lives <= 0) {
    status = "gameover";
    ball.vx = 0;
    ball.vy = 0;
    setStatusText("GAME OVER  •  SPACE / CLICK TO RESTART");
    return;
  }

  status = "serve";
  setServeBall();
  setStatusText("READY  •  SPACE / CLICK TO LAUNCH");
}

function simulateBall(): void {
  if (status !== "playing") return;

  for (let step = 0; step < BALL_SUBSTEPS; step += 1) {
    const previousX = ball.x;
    const previousY = ball.y;
    ball.x += ball.vx / BALL_SUBSTEPS;
    ball.y += ball.vy / BALL_SUBSTEPS;

    if (ball.x - BALL_RADIUS <= BOARD_LEFT) {
      ball.x = BOARD_LEFT + BALL_RADIUS;
      ball.vx = Math.abs(ball.vx);
      effects.sound({ sound: "minecraft:block.stone.hit", x: ball.x, y: ball.y, z: BOARD_Z, volume: 0.25, pitch: 1.5 });
    } else if (ball.x + BALL_RADIUS >= BOARD_RIGHT) {
      ball.x = BOARD_RIGHT - BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx);
      effects.sound({ sound: "minecraft:block.stone.hit", x: ball.x, y: ball.y, z: BOARD_Z, volume: 0.25, pitch: 1.5 });
    }

    if (ball.y + BALL_RADIUS >= BOARD_TOP) {
      ball.y = BOARD_TOP - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy);
      effects.sound({ sound: "minecraft:block.stone.hit", x: ball.x, y: ball.y, z: BOARD_Z, volume: 0.25, pitch: 1.6 });
    }

    collidePaddle(previousY);
    collideBricks(previousX, previousY);

    if (status !== "playing") break;
    if (ball.y + BALL_RADIUS < BOARD_BOTTOM - 0.8) {
      loseBall();
      break;
    }
  }
}

function launchOrContinue(p: PlayerInput): void {
  const pressed = p.jumpPressed || input.pressed(p.id, "attack") || input.pressed(p.id, "use");
  if (!pressed) return;
  if (status === "serve") launchBall();
  else if (status === "won") advanceLevel();
  else if (status === "gameover") resetNewGame();
}

function refreshTriggerConsumption(players: PlayerInput[]): void {
  for (const id of Array.from(startTriggerConsumed)) {
    const p = players.find(candidate => candidate.id === id);
    if (!p || !isStartTrigger(p)) startTriggerConsumed.delete(id);
  }
  for (const id of Array.from(stopTriggerConsumed)) {
    const p = players.find(candidate => candidate.id === id);
    if (!p || !isStopTrigger(p)) stopTriggerConsumed.delete(id);
  }
}

game.onStart(() => {
  currentTick = 0;
  controllerId = null;
  status = "waiting";
  pendingStatusAfterBuild = "waiting";
  score = 0;
  lives = STARTING_LIVES;
  combo = 0;
  level = 1;
  paddleX = BOARD_CENTER_X;
  ball.x = BOARD_CENTER_X;
  ball.y = BALL_SERVE_Y;
  ball.vx = 0;
  ball.vy = 0;
  cameraAttached.clear();
  startTriggerConsumed.clear();
  stopTriggerConsumed.clear();
  buildQueue = [];
  bricks = [];
  remainingBricks = 0;
  sceneActive = false;
  sceneInitStep = 0;
  movingNodesReady = false;
  spawnedNodeIds.clear();
  game.log("BREAKOUT_READY", "run /function breakout:start");
});

game.onTick((ctx: { tick: number }) => {
  currentTick = ctx.tick;
  const players = input.players() as PlayerInput[];

  refreshTriggerConsumption(players);

  const stopping = players.find(p => isStopTrigger(p) && !stopTriggerConsumed.has(p.id));
  if (stopping) {
    stopTriggerConsumed.add(stopping.id);
    if (controllerId === stopping.id) releaseController(stopping.id);
    processBuildQueue();
    return;
  }

  const starting = players.find(p => isStartTrigger(p) && !startTriggerConsumed.has(p.id));
  if (starting) {
    startTriggerConsumed.add(starting.id);
    claimController(starting);
    processBuildQueue();
    return;
  }

  if (controllerId && !players.some(p => p.id === controllerId)) {
    const disconnectedController = controllerId;
    cameraAttached.delete(disconnectedController);
    controllerId = null;
    clearScene();
    status = "waiting";
    pendingStatusAfterBuild = "waiting";
    game.log("BREAKOUT_CONTROLLER_DISCONNECTED", disconnectedController);
  }

  processBuildQueue();

  const p = controllerId ? players.find(candidate => candidate.id === controllerId) : undefined;
  if (!p) return;

  if (!cameraAttached.has(p.id)) {
    camera.attach(p.id, cameraOptions());
    cameraAttached.add(p.id);
  }

  if (status === "building") {
    updateMovingPresentation();
    updateHud();
    return;
  }

  movePaddle(p);
  if (status === "serve") {
    ball.x = paddleX;
    ball.y = BALL_SERVE_Y;
  }
  launchOrContinue(p);
  simulateBall();
  updateMovingPresentation();
  updateHud();
});
