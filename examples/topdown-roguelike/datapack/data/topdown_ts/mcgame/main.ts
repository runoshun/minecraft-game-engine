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

type MenuEvent = {
  playerId: string;
  playerName: string;
  menuId: string;
  actionId: string;
};

type GridPoint = { gx: number; gz: number };
type Room = { x: number; z: number; w: number; h: number; cx: number; cz: number };
type EnemyKind = "zombie" | "skeleton";
type Enemy = GridPoint & { id: string; kind: EnemyKind; hp: number; maxHp: number };
type ItemKind = "potion" | "bomb";
type Loot = GridPoint & { id: string; kind: ItemKind };
type BlockWrite = { x: number; y: number; z: number; block: string };
type DirectionButtons = { forward: boolean; backward: boolean; left: boolean; right: boolean };
type FloatingText = { id: string; x: number; y: number; z: number; startTick: number; endTick: number };

const MAP_WIDTH = 29;
const MAP_HEIGHT = 37;
const ORIGIN_X = -14;
const ORIGIN_Z = -8;
const FLOOR_Y = 100;
const ACTOR_Y = FLOOR_Y + 1;
const CAMERA_Y = 143;
const CAMERA_X = ORIGIN_X + MAP_WIDTH / 2;
const CAMERA_Z = ORIGIN_Z + MAP_HEIGHT / 2;
const START_TRIGGER_X = 17.5;
const START_TRIGGER_Y = 143;
const START_TRIGGER_Z = 10.5;
const POSITION_EPSILON = 0.2;
const WALL = "#";
const FLOOR = ".";
const EXIT = ">";

const PLAYER_MAX_HP = 10;
const PLAYER_ATTACK = 1;
const POTION_HEAL = 4;
const BOMB_DAMAGE = 3;
const BOMB_RADIUS = 2;
const DEATH_RESTART_TICKS = 40;
const BUILD_WRITES_PER_TICK = 512;
const BUILD_WRITE_COUNT = MAP_WIDTH * MAP_HEIGHT * 5;
const BASE_SEED = 0x51f15eed;

const ROOM_TARGET = 9;
const ROOM_ATTEMPTS = 120;
const MIN_ROOM_SIZE = 5;
const MAX_ROOM_SIZE = 9;
const ROOM_GAP = 1;

let tiles: string[] = [];
let rooms: Room[] = [];
let startTile: GridPoint = { gx: 1, gz: 1 };
let exitTile: GridPoint = { gx: MAP_WIDTH - 2, gz: MAP_HEIGHT - 2 };
let enemies: Enemy[] = [];
let loot: Loot[] = [];
let buildIndex = 0;
let dungeonReady = false;
let controllerId: string | null = null;
let currentTick = 0;
let floorNumber = 1;
let runSeed = BASE_SEED;
let floorSeed = BASE_SEED;
let skipControllerInput = false;
const cameraAttached = new Set<string>();
const startTriggerConsumed = new Set<string>();
let floatingTexts: FloatingText[] = [];
let floatingTextCounter = 0;

const player = {
  gx: 1,
  gz: 1,
  yaw: 0,
  hp: PLAYER_MAX_HP,
  turn: 0,
  dead: false,
  restartTicks: 0,
  inventory: {
    potion: 1,
    bomb: 1,
  },
};

let previousDirection: DirectionButtons = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

function tileIndex(gx: number, gz: number): number {
  return gz * MAP_WIDTH + gx;
}

function inBounds(gx: number, gz: number): boolean {
  return gx >= 0 && gx < MAP_WIDTH && gz >= 0 && gz < MAP_HEIGHT;
}

function tileAt(gx: number, gz: number): string {
  if (!inBounds(gx, gz)) return WALL;
  return tiles[tileIndex(gx, gz)] ?? WALL;
}

function setTile(gx: number, gz: number, tile: string): void {
  if (inBounds(gx, gz)) tiles[tileIndex(gx, gz)] = tile;
}

function isWalkable(gx: number, gz: number): boolean {
  return tileAt(gx, gz) !== WALL;
}

function worldX(gx: number): number {
  return ORIGIN_X + gx + 0.5;
}

function worldZ(gz: number): number {
  return ORIGIN_Z + gz + 0.5;
}

function yawForStep(dx: number, dz: number): number {
  if (dz > 0) return 0;
  if (dz < 0) return 180;
  if (dx > 0) return -90;
  if (dx < 0) return 90;
  return player.yaw;
}

function mixSeed(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function createRng(seed: number): {
  next: () => number;
  int: (min: number, max: number) => number;
  bool: () => boolean;
} {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    bool: () => next() < 0.5,
  };
}

function roomFits(candidate: Room): boolean {
  if (candidate.x < 1 || candidate.z < 1) return false;
  if (candidate.x + candidate.w >= MAP_WIDTH - 1) return false;
  if (candidate.z + candidate.h >= MAP_HEIGHT - 1) return false;

  for (const room of rooms) {
    const separated =
      candidate.x + candidate.w - 1 + ROOM_GAP < room.x ||
      candidate.x - ROOM_GAP > room.x + room.w - 1 ||
      candidate.z + candidate.h - 1 + ROOM_GAP < room.z ||
      candidate.z - ROOM_GAP > room.z + room.h - 1;
    if (!separated) return false;
  }
  return true;
}

function carveRoom(room: Room): void {
  for (let gz = room.z; gz < room.z + room.h; gz++) {
    for (let gx = room.x; gx < room.x + room.w; gx++) setTile(gx, gz, FLOOR);
  }
}

function carveHorizontal(x1: number, x2: number, gz: number): void {
  const min = Math.min(x1, x2);
  const max = Math.max(x1, x2);
  for (let gx = min; gx <= max; gx++) setTile(gx, gz, FLOOR);
}

function carveVertical(z1: number, z2: number, gx: number): void {
  const min = Math.min(z1, z2);
  const max = Math.max(z1, z2);
  for (let gz = min; gz <= max; gz++) setTile(gx, gz, FLOOR);
}

function connectRooms(a: Room, b: Room, horizontalFirst: boolean): void {
  if (horizontalFirst) {
    carveHorizontal(a.cx, b.cx, a.cz);
    carveVertical(a.cz, b.cz, b.cx);
  } else {
    carveVertical(a.cz, b.cz, a.cx);
    carveHorizontal(a.cx, b.cx, b.cz);
  }
}

function ensureFallbackRooms(): void {
  if (rooms.length >= 4) return;

  tiles = new Array(MAP_WIDTH * MAP_HEIGHT).fill(WALL);
  rooms = [
    { x: 2, z: 2, w: 7, h: 7, cx: 5, cz: 5 },
    { x: MAP_WIDTH - 9, z: 3, w: 7, h: 7, cx: MAP_WIDTH - 6, cz: 6 },
    { x: 3, z: MAP_HEIGHT - 10, w: 7, h: 7, cx: 6, cz: MAP_HEIGHT - 7 },
    { x: MAP_WIDTH - 10, z: MAP_HEIGHT - 11, w: 8, h: 8, cx: MAP_WIDTH - 6, cz: MAP_HEIGHT - 7 },
  ];
  for (const room of rooms) carveRoom(room);
  for (let i = 1; i < rooms.length; i++) connectRooms(rooms[i - 1], rooms[i], i % 2 === 0);
}

function bfsDistances(origin: GridPoint): number[] {
  const distances = new Array(MAP_WIDTH * MAP_HEIGHT).fill(-1);
  const queue: number[] = [tileIndex(origin.gx, origin.gz)];
  distances[queue[0]] = 0;
  let head = 0;
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (head < queue.length) {
    const index = queue[head++];
    const gx = index % MAP_WIDTH;
    const gz = Math.floor(index / MAP_WIDTH);
    for (const [dx, dz] of directions) {
      const nx = gx + dx;
      const nz = gz + dz;
      if (!isWalkable(nx, nz)) continue;
      const nextIndex = tileIndex(nx, nz);
      if (distances[nextIndex] >= 0) continue;
      distances[nextIndex] = distances[index] + 1;
      queue.push(nextIndex);
    }
  }
  return distances;
}

function chooseExit(start: GridPoint): GridPoint {
  const distances = bfsDistances(start);
  let best = tileIndex(start.gx, start.gz);
  let bestDistance = -1;
  for (let index = 0; index < distances.length; index++) {
    if (distances[index] > bestDistance) {
      bestDistance = distances[index];
      best = index;
    }
  }
  return { gx: best % MAP_WIDTH, gz: Math.floor(best / MAP_WIDTH) };
}

function randomFloorInRoom(room: Room, rng: ReturnType<typeof createRng>, reserved: Set<string>): GridPoint {
  for (let attempt = 0; attempt < 24; attempt++) {
    const gx = rng.int(room.x + 1, room.x + room.w - 2);
    const gz = rng.int(room.z + 1, room.z + room.h - 2);
    const key = `${gx},${gz}`;
    if (isWalkable(gx, gz) && !reserved.has(key)) {
      reserved.add(key);
      return { gx, gz };
    }
  }
  const key = `${room.cx},${room.cz}`;
  reserved.add(key);
  return { gx: room.cx, gz: room.cz };
}

function generateDungeon(seed: number): void {
  floorSeed = mixSeed(seed ^ Math.imul(floorNumber, 0x9e3779b1));
  const rng = createRng(floorSeed);
  tiles = new Array(MAP_WIDTH * MAP_HEIGHT).fill(WALL);
  rooms = [];

  for (let attempt = 0; attempt < ROOM_ATTEMPTS && rooms.length < ROOM_TARGET; attempt++) {
    const w = rng.int(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
    const h = rng.int(MIN_ROOM_SIZE, MAX_ROOM_SIZE);
    const x = rng.int(1, MAP_WIDTH - w - 2);
    const z = rng.int(1, MAP_HEIGHT - h - 2);
    const room: Room = {
      x,
      z,
      w,
      h,
      cx: x + Math.floor(w / 2),
      cz: z + Math.floor(h / 2),
    };
    if (!roomFits(room)) continue;
    carveRoom(room);
    if (rooms.length > 0) connectRooms(rooms[rooms.length - 1], room, rng.bool());
    rooms.push(room);
  }

  ensureFallbackRooms();
  startTile = { gx: rooms[0].cx, gz: rooms[0].cz };
  exitTile = chooseExit(startTile);
  setTile(exitTile.gx, exitTile.gz, EXIT);

  const reserved = new Set<string>();
  reserved.add(`${startTile.gx},${startTile.gz}`);
  reserved.add(`${exitTile.gx},${exitTile.gz}`);
  enemies = [];
  loot = [];

  let enemyCounter = 0;
  let lootCounter = 0;
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    const enemyCount = 1 + (floorNumber > 1 && rng.next() < Math.min(0.65, floorNumber * 0.12) ? 1 : 0);
    for (let j = 0; j < enemyCount; j++) {
      const position = randomFloorInRoom(room, rng, reserved);
      const maxHp = 2 + Math.floor((floorNumber - 1) / 2);
      const skeletonChance = Math.min(0.55, 0.25 + floorNumber * 0.05);
      const kind: EnemyKind = rng.next() < skeletonChance ? "skeleton" : "zombie";
      enemies.push({
        id: `enemy_${floorNumber}_${enemyCounter++}`,
        kind,
        gx: position.gx,
        gz: position.gz,
        hp: maxHp,
        maxHp,
      });
    }

    if (i % 2 === 0 || rng.next() < 0.35) {
      const position = randomFloorInRoom(room, rng, reserved);
      const kind: ItemKind = rng.next() < 0.65 ? "potion" : "bomb";
      loot.push({ id: `loot_${floorNumber}_${lootCounter++}`, kind, gx: position.gx, gz: position.gz });
    }
  }

  const distances = bfsDistances(startTile);
  const exitDistance = distances[tileIndex(exitTile.gx, exitTile.gz)];
  if (exitDistance < 0) throw new Error("generated dungeon exit is unreachable");
  game.log(
    "ROGUELIKE_GENERATED",
    `floor=${floorNumber}`,
    `seed=${floorSeed.toString(16)}`,
    `rooms=${rooms.length}`,
    `exitDistance=${exitDistance}`,
    `enemies=${enemies.length}`,
    `loot=${loot.length}`,
  );
}

function queueDungeonBuild(): void {
  buildIndex = 0;
}

function buildWriteAt(index: number): BlockWrite {
  const cellIndex = Math.floor(index / 5);
  const layer = index % 5;
  const gx = cellIndex % MAP_WIDTH;
  const gz = Math.floor(cellIndex / MAP_WIDTH);
  const x = ORIGIN_X + gx;
  const z = ORIGIN_Z + gz;
  const tile = tileAt(gx, gz);

  if (layer === 0) {
    const block = tile === EXIT
      ? "minecraft:gold_block"
      : tile === WALL
        ? "minecraft:polished_deepslate"
        : "minecraft:deepslate_tiles";
    return { x, y: FLOOR_Y, z, block };
  }

  return {
    x,
    y: FLOOR_Y + layer,
    z,
    block: tile === WALL && layer <= 3 ? "minecraft:deepslate_bricks" : "minecraft:air",
  };
}

function processBuildQueue(): void {
  const end = Math.min(BUILD_WRITE_COUNT, buildIndex + BUILD_WRITES_PER_TICK);
  const writes: BlockWrite[] = [];
  while (buildIndex < end) writes.push(buildWriteAt(buildIndex++));
  world.setBlocks({ blocks: writes });
  if (buildIndex >= BUILD_WRITE_COUNT && !dungeonReady) finishDungeonBuild();
}

function enemyLabelId(enemy: Enemy): string {
  return `label_${enemy.id}`;
}

function enemyEntityType(enemy: Enemy): string {
  return enemy.kind === "skeleton" ? "minecraft:skeleton" : "minecraft:zombie";
}

function enemyDisplayName(enemy: Enemy): string {
  return enemy.kind === "skeleton" ? "SKELETON" : "ZOMBIE";
}

function enemyDeathSound(enemy: Enemy): string {
  return enemy.kind === "skeleton" ? "minecraft:entity.skeleton.death" : "minecraft:entity.zombie.death";
}

function enemyLabelText(enemy: Enemy): Array<{ text: string; tone?: "normal" | "muted" | "info" | "success" | "warning" | "danger"; bold?: boolean }> {
  return [
    { text: `${enemyDisplayName(enemy)} `, tone: "danger", bold: true },
    { text: `${Math.max(0, enemy.hp)}/${enemy.maxHp}`, tone: enemy.hp <= 1 ? "warning" : "normal", bold: true },
  ];
}

function spawnFloatingText(text: string, tone: "info" | "success" | "warning" | "danger", x: number, y: number, z: number): void {
  const id = `combat_text_${floatingTextCounter++}`;
  render.spawn(id, {
    visual: { kind: "text", text: [{ text, tone, bold: true }] },
    x, y, z,
    scale: 0.6,
    billboard: "center",
  });
  floatingTexts.push({ id, x, y, z, startTick: currentTick, endTick: currentTick + 14 });
}

function updateFloatingTexts(): void {
  const survivors: FloatingText[] = [];
  for (const effect of floatingTexts) {
    if (currentTick >= effect.endTick) {
      render.remove(effect.id);
      continue;
    }
    const life = Math.max(1, effect.endTick - effect.startTick);
    const progress = (currentTick - effect.startTick) / life;
    render.update(effect.id, { y: effect.y + progress * 0.8 });
    survivors.push(effect);
  }
  floatingTexts = survivors;
}

function clearFloatingTexts(): void {
  for (const effect of floatingTexts) render.remove(effect.id);
  floatingTexts = [];
}

function clearEnemies(): void {
  for (const enemy of enemies) {
    actors.remove(enemy.id);
    render.remove(enemyLabelId(enemy));
  }
}

function clearLoot(): void {
  for (const item of loot) render.remove(item.id);
}

function spawnLoot(): void {
  for (const item of loot) {
    render.spawn(item.id, {
      visual: {
        kind: "block",
        block: item.kind === "potion" ? "minecraft:redstone_block" : "minecraft:tnt",
      },
      x: worldX(item.gx),
      y: ACTOR_Y + 0.15,
      z: worldZ(item.gz),
      scale: 0.28,
      offset: { x: -0.14, y: 0, z: -0.14 },
    });
  }
}

function spawnEnemies(): void {
  for (const enemy of enemies) {
    actors.spawn(enemy.id, {
      entityType: enemyEntityType(enemy),
      x: worldX(enemy.gx),
      y: ACTOR_Y,
      z: worldZ(enemy.gz),
      yaw: 180,
    });
    render.spawn(enemyLabelId(enemy), {
      visual: { kind: "text", text: enemyLabelText(enemy) },
      x: worldX(enemy.gx),
      y: ACTOR_Y + 2.15,
      z: worldZ(enemy.gz),
      scale: 0.42,
      billboard: "center",
    });
  }
}

function projectEnemy(enemy: Enemy, yaw: number): void {
  actors.move(enemy.id, {
    x: worldX(enemy.gx),
    y: ACTOR_Y,
    z: worldZ(enemy.gz),
    yaw,
  });
  render.update(enemyLabelId(enemy), {
    visual: { kind: "text", text: enemyLabelText(enemy) },
    x: worldX(enemy.gx),
    y: ACTOR_Y + 2.15,
    z: worldZ(enemy.gz),
  });
}

function projectPlayer(): void {
  actors.move("hero", {
    x: worldX(player.gx),
    y: ACTOR_Y,
    z: worldZ(player.gz),
    yaw: player.yaw,
  });
  render.update("hero_label", {
    x: worldX(player.gx),
    y: ACTOR_Y + 2.15,
    z: worldZ(player.gz),
  });
}

function startFloor(nextFloor: number): void {
  clearEnemies();
  clearLoot();
  clearFloatingTexts();
  actors.remove("hero");
  render.remove("hero_label");
  if (controllerId) menu.close(controllerId, "inventory");
  dungeonReady = false;
  floorNumber = nextFloor;
  generateDungeon(runSeed);
  player.gx = startTile.gx;
  player.gz = startTile.gz;
  player.yaw = 0;
  queueDungeonBuild();
  if (controllerId && cameraAttached.has(controllerId)) {
    camera.move(controllerId, {
      x: CAMERA_X,
      y: CAMERA_Y,
      z: CAMERA_Z,
      yaw: 0,
      pitch: 90,
    });
  }
  game.log("ROGUELIKE_BUILD_START", `floor=${floorNumber}`, `writes=${BUILD_WRITE_COUNT}`);
}

function finishDungeonBuild(): void {
  actors.spawn("hero", {
    x: worldX(player.gx),
    y: ACTOR_Y,
    z: worldZ(player.gz),
    yaw: player.yaw,
  });
  render.spawn("hero_label", {
    visual: { kind: "text", text: [{ text: "YOU", tone: "info", bold: true }] },
    x: worldX(player.gx),
    y: ACTOR_Y + 2.15,
    z: worldZ(player.gz),
    scale: 0.5,
    billboard: "center",
  });
  spawnEnemies();
  spawnLoot();
  dungeonReady = true;
  spawnFloatingText(`FLOOR ${floorNumber}`, "success", worldX(player.gx), ACTOR_Y + 2.8, worldZ(player.gz));
  effects.particle({
    particle: "minecraft:happy_villager",
    x: worldX(player.gx),
    y: ACTOR_Y + 0.8,
    z: worldZ(player.gz),
  });
  effects.sound({
    sound: "minecraft:block.amethyst_block.chime",
    x: worldX(player.gx),
    y: ACTOR_Y,
    z: worldZ(player.gz),
    volume: 0.7,
    pitch: 1.1,
  });
  game.log("ROGUELIKE_FLOOR_READY", `floor=${floorNumber}`, `turn=${player.turn}`);
}

function startNewRun(seed: number): void {
  runSeed = seed >>> 0;
  floorNumber = 1;
  player.hp = PLAYER_MAX_HP;
  player.turn = 0;
  player.dead = false;
  player.restartTicks = 0;
  player.inventory.potion = 1;
  player.inventory.bomb = 1;
  startFloor(1);
  game.log("ROGUELIKE_RUN_START", `seed=${runSeed.toString(16)}`);
}

function findEnemy(gx: number, gz: number): Enemy | undefined {
  return enemies.find(enemy => enemy.gx === gx && enemy.gz === gz && enemy.hp > 0);
}

function enemyOccupies(gx: number, gz: number, exceptId?: string): boolean {
  return enemies.some(enemy => enemy.id !== exceptId && enemy.hp > 0 && enemy.gx === gx && enemy.gz === gz);
}

function removeDeadEnemies(): void {
  const survivors: Enemy[] = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) {
      actors.remove(enemy.id);
      render.remove(enemyLabelId(enemy));
      spawnFloatingText("DEFEATED", "success", worldX(enemy.gx), ACTOR_Y + 1.8, worldZ(enemy.gz));
      effects.particle({
        particle: "minecraft:poof",
        x: worldX(enemy.gx),
        y: ACTOR_Y + 0.7,
        z: worldZ(enemy.gz),
      });
      effects.particle({
        particle: "minecraft:soul",
        x: worldX(enemy.gx),
        y: ACTOR_Y + 1.0,
        z: worldZ(enemy.gz),
      });
      effects.sound({
        sound: enemyDeathSound(enemy),
        x: worldX(enemy.gx),
        y: ACTOR_Y,
        z: worldZ(enemy.gz),
        volume: 0.7,
        pitch: 1.1,
      });
    } else {
      survivors.push(enemy);
    }
  }
  enemies = survivors;
}

function hitEnemy(enemy: Enemy, damage: number): void {
  enemy.hp -= damage;
  spawnFloatingText(`-${damage}`, "danger", worldX(enemy.gx), ACTOR_Y + 2.25, worldZ(enemy.gz));
  if (enemy.hp > 0) {
    render.update(enemyLabelId(enemy), { visual: { kind: "text", text: enemyLabelText(enemy) } });
  }
  effects.particle({
    particle: "minecraft:crit",
    x: worldX(enemy.gx),
    y: ACTOR_Y + 0.9,
    z: worldZ(enemy.gz),
  });
  effects.particle({
    particle: "minecraft:damage_indicator",
    x: worldX(enemy.gx),
    y: ACTOR_Y + 0.8,
    z: worldZ(enemy.gz),
  });
  effects.sound({
    sound: "minecraft:entity.player.attack.strong",
    x: worldX(enemy.gx),
    y: ACTOR_Y,
    z: worldZ(enemy.gz),
    volume: 0.65,
    pitch: 1.0,
  });
  removeDeadEnemies();
}

function collectLootAtPlayer(): void {
  const item = loot.find(candidate => candidate.gx === player.gx && candidate.gz === player.gz);
  if (!item) return;
  if (item.kind === "potion") player.inventory.potion += 1;
  else player.inventory.bomb += 1;
  render.remove(item.id);
  loot = loot.filter(candidate => candidate.id !== item.id);
  effects.sound({
    sound: "minecraft:entity.item.pickup",
    x: worldX(player.gx),
    y: ACTOR_Y,
    z: worldZ(player.gz),
    volume: 0.8,
    pitch: 1.2,
  });
  game.log("ROGUELIKE_PICKUP", item.kind, `potions=${player.inventory.potion}`, `bombs=${player.inventory.bomb}`);
}

function killPlayer(): void {
  if (player.dead) return;
  player.dead = true;
  player.restartTicks = DEATH_RESTART_TICKS;
  dungeonReady = false;
  spawnFloatingText("YOU DIED", "danger", worldX(player.gx), ACTOR_Y + 2.4, worldZ(player.gz));
  actors.remove("hero");
  render.remove("hero_label");
  clearEnemies();
  clearLoot();
  effects.sound({
    sound: "minecraft:entity.player.death",
    x: worldX(player.gx),
    y: ACTOR_Y,
    z: worldZ(player.gz),
    volume: 0.9,
    pitch: 1.0,
  });
  effects.particle({
    particle: "minecraft:poof",
    x: worldX(player.gx),
    y: ACTOR_Y + 0.7,
    z: worldZ(player.gz),
  });
  game.log("ROGUELIKE_PLAYER_DIED", `turn=${player.turn}`, `floor=${floorNumber}`);
}

function damagePlayer(amount: number): void {
  player.hp -= amount;
  spawnFloatingText(`-${amount} HP`, "danger", worldX(player.gx), ACTOR_Y + 2.3, worldZ(player.gz));
  effects.sound({
    sound: "minecraft:entity.player.hurt",
    x: worldX(player.gx),
    y: ACTOR_Y,
    z: worldZ(player.gz),
    volume: 0.75,
    pitch: 1.0,
  });
  effects.particle({
    particle: "minecraft:damage_indicator",
    x: worldX(player.gx),
    y: ACTOR_Y + 0.8,
    z: worldZ(player.gz),
  });
  game.log("ROGUELIKE_PLAYER_HIT", `hp=${player.hp}`);
  if (player.hp <= 0) killPlayer();
}

function pathStepToward(enemy: Enemy): GridPoint | null {
  const start = tileIndex(enemy.gx, enemy.gz);
  const target = tileIndex(player.gx, player.gz);
  const previous = new Array(MAP_WIDTH * MAP_HEIGHT).fill(-1);
  const visited = new Array(MAP_WIDTH * MAP_HEIGHT).fill(false);
  const queue: number[] = [start];
  visited[start] = true;
  let head = 0;
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (head < queue.length && !visited[target]) {
    const index = queue[head++];
    const gx = index % MAP_WIDTH;
    const gz = Math.floor(index / MAP_WIDTH);
    for (const [dx, dz] of directions) {
      const nx = gx + dx;
      const nz = gz + dz;
      if (!isWalkable(nx, nz)) continue;
      if (enemyOccupies(nx, nz, enemy.id) && !(nx === player.gx && nz === player.gz)) continue;
      const next = tileIndex(nx, nz);
      if (visited[next]) continue;
      visited[next] = true;
      previous[next] = index;
      queue.push(next);
    }
  }

  if (!visited[target]) return null;
  let cursor = target;
  while (previous[cursor] !== start && previous[cursor] !== -1) cursor = previous[cursor];
  if (previous[cursor] === -1) return null;
  return { gx: cursor % MAP_WIDTH, gz: Math.floor(cursor / MAP_WIDTH) };
}

function enemyTurn(): void {
  for (const enemy of enemies) {
    if (player.dead) return;
    const distance = Math.abs(player.gx - enemy.gx) + Math.abs(player.gz - enemy.gz);
    if (distance === 1) {
      damagePlayer(1);
      continue;
    }

    const step = pathStepToward(enemy);
    if (!step) continue;
    const dx = step.gx - enemy.gx;
    const dz = step.gz - enemy.gz;
    enemy.gx = step.gx;
    enemy.gz = step.gz;
    projectEnemy(enemy, yawForStep(dx, dz));
  }
}

function finishPlayerTurn(action: string): void {
  player.turn += 1;
  game.log("ROGUELIKE_TURN", `turn=${player.turn}`, action);
  enemyTurn();
}

function descend(): void {
  floorNumber += 1;
  player.hp = Math.min(PLAYER_MAX_HP, player.hp + 2);
  effects.sound({
    sound: "minecraft:ui.toast.challenge_complete",
    x: worldX(player.gx),
    y: ACTOR_Y,
    z: worldZ(player.gz),
    volume: 0.8,
    pitch: 1.15,
  });
  game.log("ROGUELIKE_DESCEND", `floor=${floorNumber}`, `hp=${player.hp}`);
  startFloor(floorNumber);
}

function tryPlayerStep(dx: number, dz: number): void {
  if (!dungeonReady || player.dead) return;
  const nx = player.gx + dx;
  const nz = player.gz + dz;
  player.yaw = yawForStep(dx, dz);
  if (!isWalkable(nx, nz)) {
    projectPlayer();
    return;
  }

  const enemy = findEnemy(nx, nz);
  if (enemy) {
    projectPlayer();
    hitEnemy(enemy, PLAYER_ATTACK);
    finishPlayerTurn("melee");
    return;
  }

  player.gx = nx;
  player.gz = nz;
  projectPlayer();
  collectLootAtPlayer();

  if (tileAt(player.gx, player.gz) === EXIT) {
    player.turn += 1;
    descend();
    return;
  }
  finishPlayerTurn("move");
}

function waitTurn(): void {
  if (!dungeonReady || player.dead) return;
  finishPlayerTurn("wait");
}

function usePotion(): void {
  if (!dungeonReady || player.dead || player.inventory.potion <= 0 || player.hp >= PLAYER_MAX_HP) return;
  player.inventory.potion -= 1;
  const before = player.hp;
  player.hp = Math.min(PLAYER_MAX_HP, player.hp + POTION_HEAL);
  effects.sound({
    sound: "minecraft:entity.generic.drink",
    x: worldX(player.gx),
    y: ACTOR_Y,
    z: worldZ(player.gz),
    volume: 0.7,
    pitch: 1.0,
  });
  game.log("ROGUELIKE_USE_POTION", `heal=${player.hp - before}`, `hp=${player.hp}`);
  finishPlayerTurn("potion");
}

function useBomb(): void {
  if (!dungeonReady || player.dead || player.inventory.bomb <= 0) return;
  player.inventory.bomb -= 1;
  effects.sound({
    sound: "minecraft:entity.generic.explode",
    x: worldX(player.gx),
    y: ACTOR_Y,
    z: worldZ(player.gz),
    volume: 0.8,
    pitch: 1.15,
  });
  effects.particle({
    particle: "minecraft:explosion",
    x: worldX(player.gx),
    y: ACTOR_Y + 0.5,
    z: worldZ(player.gz),
  });
  for (const enemy of enemies) {
    const distance = Math.max(Math.abs(enemy.gx - player.gx), Math.abs(enemy.gz - player.gz));
    if (distance <= BOMB_RADIUS) enemy.hp -= BOMB_DAMAGE;
  }
  removeDeadEnemies();
  game.log("ROGUELIKE_USE_BOMB", `remaining=${player.inventory.bomb}`);
  finishPlayerTurn("bomb");
}

function openInventory(playerId: string): void {
  const entries: Array<{
    id: string;
    label: string;
    description?: string;
    slot: number;
    item: string;
    count?: number;
  }> = [];
  if (player.inventory.potion > 0) {
    entries.push({
      id: "use_potion",
      label: `Potion x${player.inventory.potion}`,
      description: `Heal ${POTION_HEAL} HP. Uses one turn.`,
      slot: 0,
      item: "minecraft:potion",
      count: player.inventory.potion,
    });
  }
  if (player.inventory.bomb > 0) {
    entries.push({
      id: "use_bomb",
      label: `Bomb x${player.inventory.bomb}`,
      description: `${BOMB_DAMAGE} damage in a ${BOMB_RADIUS}-tile radius. Uses one turn.`,
      slot: 1,
      item: "minecraft:tnt",
      count: player.inventory.bomb,
    });
  }
  entries.push({ id: "close", label: "Close", slot: 8, item: "minecraft:barrier" });
  menu.open(playerId, {
    id: "inventory",
    kind: "items",
    title: "Inventory",
    rows: 1,
    columns: 9,
    entries,
  });
}

function updateHud(): void {
  if (!controllerId) return;
  const buildPercent = Math.floor(buildIndex * 100 / BUILD_WRITE_COUNT);
  const state = player.dead
    ? `Dead (${player.restartTicks})`
    : dungeonReady
      ? "Your turn"
      : `Generating ${buildPercent}%`;
  ui.panel(controllerId, {
    title: "Grid Roguelike",
    rows: [
      { id: "hp", label: "HP", value: `${Math.max(0, player.hp)}/${PLAYER_MAX_HP}` },
      { id: "floor", label: "Floor", value: String(floorNumber) },
      { id: "turn", label: "Turn", value: String(player.turn) },
      { id: "enemy", label: "Enemies", value: String(enemies.length) },
      { id: "potion", label: "Potions", value: String(player.inventory.potion) },
      { id: "bomb", label: "Bombs", value: String(player.inventory.bomb) },
      { id: "state", label: "State", value: state },
      { id: "seed", label: "Seed", value: floorSeed.toString(16) },
      { id: "controls1", label: "WASD", value: "move / bump attack" },
      { id: "controls2", label: "Ctrl / Jump", value: "items / wait" },
    ],
  });
}

function directionAction(p: PlayerInput): { dx: number; dz: number } | null {
  if (p.forward && !previousDirection.forward) return { dx: 0, dz: 1 };
  if (p.backward && !previousDirection.backward) return { dx: 0, dz: -1 };
  if (p.left && !previousDirection.left) return { dx: 1, dz: 0 };
  if (p.right && !previousDirection.right) return { dx: -1, dz: 0 };
  return null;
}

function rememberDirections(p: PlayerInput): void {
  previousDirection = {
    forward: p.forward,
    backward: p.backward,
    left: p.left,
    right: p.right,
  };
}

function cameraOptions(): { x: number; y: number; z: number; yaw: number; pitch: number } {
  return { x: CAMERA_X, y: CAMERA_Y, z: CAMERA_Z, yaw: 0, pitch: 90 };
}

function near(value: number, expected: number): boolean {
  return Math.abs(value - expected) <= POSITION_EPSILON;
}

function isStartTrigger(p: PlayerInput): boolean {
  return p.dimension === "minecraft:overworld" &&
    near(p.x, START_TRIGGER_X) && near(p.y, START_TRIGGER_Y) && near(p.z, START_TRIGGER_Z);
}

function isAtCameraAnchor(p: PlayerInput): boolean {
  return p.dimension === "minecraft:overworld" &&
    near(p.x, CAMERA_X) && near(p.y, CAMERA_Y) && near(p.z, CAMERA_Z);
}

function releaseControllerPresentation(playerId: string): void {
  ui.panel(playerId, null);
  menu.close(playerId, "inventory");
  if (cameraAttached.has(playerId)) camera.detach(playerId);
  cameraAttached.delete(playerId);
}

function claimController(p: PlayerInput, restartRun: boolean, resetCamera: boolean): void {
  if (controllerId && controllerId !== p.id) releaseControllerPresentation(controllerId);
  if (resetCamera && cameraAttached.has(p.id)) {
    camera.detach(p.id);
    cameraAttached.delete(p.id);
  }
  controllerId = p.id;
  previousDirection = { forward: false, backward: false, left: false, right: false };
  skipControllerInput = true;
  game.log("ROGUELIKE_CONTROLLER", p.name);
  if (restartRun) startNewRun(BASE_SEED);
}

menu.onAction((event: MenuEvent) => {
  if (!controllerId || event.playerId !== controllerId || event.menuId !== "inventory") return;
  menu.close(event.playerId, "inventory");
  skipControllerInput = true;
  if (event.actionId === "use_potion") usePotion();
  else if (event.actionId === "use_bomb") useBomb();
});

game.onStart(() => {
  controllerId = null;
  cameraAttached.clear();
  startTriggerConsumed.clear();
  previousDirection = { forward: false, backward: false, left: false, right: false };
  currentTick = 0;
  runSeed = BASE_SEED;
  floorSeed = BASE_SEED;
  floorNumber = 1;
  player.hp = PLAYER_MAX_HP;
  player.turn = 0;
  player.dead = false;
  player.restartTicks = 0;
  player.inventory.potion = 1;
  player.inventory.bomb = 1;
  dungeonReady = false;
  buildIndex = 0;
  enemies = [];
  loot = [];
  floatingTexts = [];
  floatingTextCounter = 0;
  game.log("ROGUELIKE_WAITING_FOR_CONTROLLER");
});

game.onTick((ctx: { tick: number }) => {
  currentTick = ctx.tick;
  updateFloatingTexts();
  const players = input.players() as PlayerInput[];

  for (const id of Array.from(startTriggerConsumed)) {
    const current = players.find(candidate => candidate.id === id);
    if (!current || !isStartTrigger(current)) startTriggerConsumed.delete(id);
  }
  const commandStart = players.find(candidate => isStartTrigger(candidate) && !startTriggerConsumed.has(candidate.id));
  if (commandStart) {
    startTriggerConsumed.add(commandStart.id);
    claimController(commandStart, true, true);
  }

  if (controllerId && !players.some(candidate => candidate.id === controllerId)) {
    cameraAttached.delete(controllerId);
    ui.panel(controllerId, null);
    controllerId = null;
  }

  if (!controllerId) {
    const claimant = players.find(candidate =>
      candidate.forward || candidate.backward || candidate.left || candidate.right ||
      candidate.jumpPressed || candidate.sprintPressed
    );
    if (claimant) {
      claimController(claimant, true, false);
      rememberDirections(claimant);
    }
  }

  const p = controllerId ? players.find(candidate => candidate.id === controllerId) : undefined;
  if (!p) return;

  if (!cameraAttached.has(p.id)) {
    camera.attach(p.id, cameraOptions());
    cameraAttached.add(p.id);
  } else if (!isAtCameraAnchor(p)) {
    camera.attach(p.id, cameraOptions());
  }

  if (player.dead) {
    player.restartTicks -= 1;
    if (player.restartTicks <= 0) startNewRun(mixSeed(runSeed + 0x9e3779b9));
    rememberDirections(p);
    updateHud();
    return;
  }

  if (!dungeonReady) {
    processBuildQueue();
    rememberDirections(p);
    updateHud();
    return;
  }

  if (skipControllerInput) {
    skipControllerInput = false;
    rememberDirections(p);
    updateHud();
    return;
  }

  if (p.sprintPressed) {
    openInventory(p.id);
  } else {
    const action = directionAction(p);
    if (action) tryPlayerStep(action.dx, action.dz);
    else if (p.jumpPressed) waitTurn();
  }

  rememberDirections(p);
  updateHud();
});
