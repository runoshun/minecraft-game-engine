type PlayerInput = {
  id: string;
  name: string;
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
};

type Enemy = {
  id: string;
  x: number;
  z: number;
  hp: number;
  attackCooldown: number;
};

type Stage = 0 | 1 | 2 | 3;

const FLOOR_Y = 101;
const PLAYER_SPEED = 0.12;
const PLAYER_MAX_HP = 10;
const PLAYER_INVULN_TICKS = 20;
const PLAYER_KNOCKBACK = 0.9;
const DEATH_RESTART_TICKS = 40;

const ENEMY_SPEED = 0.06;
const ENEMY_STOP_DISTANCE = 1.1;
const ENEMY_ATTACK_RANGE = 1.25;
const ENEMY_ATTACK_COOLDOWN = 20;

const ATTACK_COOLDOWN = 8;
const ATTACK_REACH = 1.2;
const ATTACK_RADIUS = 1.65;

const player = {
  x: 0.5,
  z: 0.5,
  yaw: 0,
  hp: PLAYER_MAX_HP,
  invulnTicks: 0,
  attackCooldown: 0,
  dead: false,
  restartTicks: 0,
};

let stage: Stage = 0;
let enemies: Enemy[] = [];
let controllerId: string | null = null;
const cameraAttached = new Set<string>();

function inRect(x: number, z: number, minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
}

// Collision is authoritative game logic. Geometry matches arena/build.mcfunction.
function isWalkable(x: number, z: number): boolean {
  if (inRect(x, z, -7.7, 7.7, -7.7, 7.7)) return true;
  if (stage >= 1 && inRect(x, z, -1.35, 1.35, 7.7, 8.35)) return true;
  if (inRect(x, z, -2.7, 2.7, 8.35, 11.65)) return true;
  if (inRect(x, z, -1.35, 1.35, 11.65, 12.35)) return true;
  if (inRect(x, z, -7.7, 7.7, 12.35, 27.7)) return true;
  if (stage >= 3 && inRect(x, z, -1.35, 1.35, 27.7, 29.5)) return true;
  return false;
}

function setGate(z: number, block: string): void {
  for (let x = -1; x <= 1; x++) {
    for (let y = 101; y <= 103; y++) {
      world.setBlock({ x, y, z, block });
    }
  }
}

function removeEnemies(): void {
  for (const enemy of enemies) actors.remove(enemy.id);
  enemies = [];
}

function spawnEnemy(id: string, x: number, z: number, hp: number): Enemy {
  actors.spawn(id, { x, y: FLOOR_Y, z, yaw: 0 });
  return { id, x, z, hp, attackCooldown: 0 };
}

function spawnRoom1(): void {
  enemies = [
    spawnEnemy("r1_1", -4.5, -3.5, 3),
    spawnEnemy("r1_2", 4.5, -3.5, 3),
    spawnEnemy("r1_3", 0.5, -5.5, 3),
  ];
}

function spawnRoom2(): void {
  enemies = [
    spawnEnemy("r2_1", -5.0, 17.0, 4),
    spawnEnemy("r2_2", 5.0, 17.0, 4),
    spawnEnemy("r2_3", -5.0, 24.0, 4),
    spawnEnemy("r2_4", 5.0, 24.0, 4),
  ];
}

function forwardVector(yaw: number): { x: number; z: number } {
  const radians = yaw * Math.PI / 180;
  return { x: -Math.sin(radians), z: Math.cos(radians) };
}

function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dx, dz) * 180 / Math.PI;
}

function tryMovePlayer(dx: number, dz: number, yaw: number): void {
  const nextX = player.x + dx;
  const nextZ = player.z + dz;
  if (isWalkable(nextX, nextZ)) {
    player.x = nextX;
    player.z = nextZ;
  }
  player.yaw = yaw;
}

function movePlayerBy(dx: number, dz: number): void {
  const nextX = player.x + dx;
  const nextZ = player.z + dz;
  if (isWalkable(nextX, nextZ)) {
    player.x = nextX;
    player.z = nextZ;
  } else if (isWalkable(nextX, player.z)) {
    player.x = nextX;
  } else if (isWalkable(player.x, nextZ)) {
    player.z = nextZ;
  }
}

function projectPlayer(): void {
  actors.move("hero", { x: player.x, y: FLOOR_Y, z: player.z, yaw: player.yaw });
}

function updatePlayer(p: PlayerInput): void {
  // Preserve the original screen-space mapping for yaw=0, pitch=90.
  // W => +Z, S => -Z, A => +X, D => -X.
  // Processing order also preserves the old datapack's diagonal/facing behavior.
  if (p.forward) tryMovePlayer(0, PLAYER_SPEED, 0);
  if (p.backward) tryMovePlayer(0, -PLAYER_SPEED, 180);
  if (p.left) tryMovePlayer(PLAYER_SPEED, 0, -90);
  if (p.right) tryMovePlayer(-PLAYER_SPEED, 0, 90);
  projectPlayer();
}

function killPlayer(): void {
  if (player.dead) return;
  player.dead = true;
  player.restartTicks = DEATH_RESTART_TICKS;
  removeEnemies();

  effects.sound({
    sound: "minecraft:entity.player.death",
    x: player.x,
    y: FLOOR_Y,
    z: player.z,
    volume: 0.9,
    pitch: 1.0,
  });
  effects.particle({
    particle: "minecraft:poof",
    x: player.x,
    y: FLOOR_Y + 1,
    z: player.z,
  });
  game.log("TOPDOWN_TS_PLAYER_DIED");
}

function damagePlayer(enemy: Enemy): void {
  if (player.dead || player.invulnTicks > 0) return;

  player.hp -= 1;
  player.invulnTicks = PLAYER_INVULN_TICKS;
  enemy.attackCooldown = ENEMY_ATTACK_COOLDOWN;

  const dx = player.x - enemy.x;
  const dz = player.z - enemy.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 0.0001) {
    movePlayerBy(dx / distance * PLAYER_KNOCKBACK, dz / distance * PLAYER_KNOCKBACK);
    projectPlayer();
  }

  effects.sound({
    sound: "minecraft:entity.player.hurt",
    x: player.x,
    y: FLOOR_Y,
    z: player.z,
    volume: 0.8,
    pitch: 1.0,
  });
  effects.particle({
    particle: "minecraft:damage_indicator",
    x: player.x,
    y: FLOOR_Y + 1,
    z: player.z,
  });
  game.log("TOPDOWN_TS_PLAYER_HIT", `hp=${player.hp}`);

  if (player.hp <= 0) killPlayer();
}

function updateEnemies(): void {
  for (const enemy of enemies) {
    if (enemy.attackCooldown > 0) enemy.attackCooldown -= 1;

    const dx = player.x - enemy.x;
    const dz = player.z - enemy.z;
    const distance = Math.hypot(dx, dz);
    const yaw = yawToward(dx, dz);

    if (distance > ENEMY_STOP_DISTANCE) {
      const stepX = dx / distance * ENEMY_SPEED;
      const stepZ = dz / distance * ENEMY_SPEED;
      const nextX = enemy.x + stepX;
      const nextZ = enemy.z + stepZ;

      if (isWalkable(nextX, nextZ)) {
        enemy.x = nextX;
        enemy.z = nextZ;
      } else if (isWalkable(nextX, enemy.z)) {
        enemy.x = nextX;
      } else if (isWalkable(enemy.x, nextZ)) {
        enemy.z = nextZ;
      }
    }

    actors.move(enemy.id, { x: enemy.x, y: FLOOR_Y, z: enemy.z, yaw });

    const attackDistance = Math.hypot(player.x - enemy.x, player.z - enemy.z);
    if (attackDistance <= ENEMY_ATTACK_RANGE && enemy.attackCooldown === 0) {
      damagePlayer(enemy);
      if (player.dead) return;
    }
  }
}

function attack(): void {
  player.attackCooldown = ATTACK_COOLDOWN;
  const facing = forwardVector(player.yaw);
  const hitX = player.x + facing.x * ATTACK_REACH;
  const hitZ = player.z + facing.z * ATTACK_REACH;

  effects.sound({
    sound: "minecraft:entity.player.attack.sweep",
    x: player.x,
    y: FLOOR_Y,
    z: player.z,
    volume: 0.8,
    pitch: 1.1,
  });
  effects.particle({
    particle: "minecraft:sweep_attack",
    x: hitX,
    y: FLOOR_Y + 1,
    z: hitZ,
  });

  const survivors: Enemy[] = [];
  for (const enemy of enemies) {
    if (Math.hypot(enemy.x - hitX, enemy.z - hitZ) <= ATTACK_RADIUS) {
      enemy.hp -= 1;
      effects.particle({
        particle: "minecraft:damage_indicator",
        x: enemy.x,
        y: FLOOR_Y + 1,
        z: enemy.z,
      });
    }

    if (enemy.hp <= 0) {
      effects.particle({ particle: "minecraft:poof", x: enemy.x, y: FLOOR_Y + 1, z: enemy.z });
      effects.sound({
        sound: "minecraft:entity.zombie.death",
        x: enemy.x,
        y: FLOOR_Y,
        z: enemy.z,
        volume: 0.7,
        pitch: 1.3,
      });
      actors.remove(enemy.id);
    } else {
      survivors.push(enemy);
    }
  }
  enemies = survivors;
}

function clearRoom1(): void {
  stage = 1;
  player.hp = PLAYER_MAX_HP;
  player.invulnTicks = 0;
  setGate(8, "minecraft:air");
  effects.sound({ sound: "minecraft:block.iron_door.open", x: 0, y: 101, z: 8, volume: 1, pitch: 1 });
  effects.particle({ particle: "minecraft:happy_villager", x: 0.5, y: 102, z: 7.5 });
  game.log("TOPDOWN_TS_ROOM1_CLEAR", `hp=${player.hp}`);
}

function enterRoom2(): void {
  stage = 2;
  spawnRoom2();
  if (controllerId) {
    camera.move(controllerId, { x: 0.5, y: 115, z: 20.5, yaw: 0, pitch: 90 });
  }
  game.log("TOPDOWN_TS_ROOM2_ENTER");
}

function clearRoom2(): void {
  stage = 3;
  setGate(28, "minecraft:air");
  effects.sound({
    sound: "minecraft:ui.toast.challenge_complete",
    x: 0,
    y: 101,
    z: 20,
    volume: 1,
    pitch: 1,
  });
  effects.particle({ particle: "minecraft:happy_villager", x: 0.5, y: 102, z: 20.5 });
  game.log("TOPDOWN_TS_RUN_COMPLETE");
}

function resetRun(fromDeath: boolean): void {
  removeEnemies();
  stage = 0;
  player.x = 0.5;
  player.z = 0.5;
  player.yaw = 0;
  player.hp = PLAYER_MAX_HP;
  player.invulnTicks = 0;
  player.attackCooldown = 0;
  player.dead = false;
  player.restartTicks = 0;

  setGate(8, "minecraft:polished_blackstone_bricks");
  setGate(28, "minecraft:polished_blackstone_bricks");
  actors.spawn("hero", { x: player.x, y: FLOOR_Y, z: player.z, yaw: player.yaw });
  spawnRoom1();

  if (controllerId && cameraAttached.has(controllerId)) {
    camera.move(controllerId, { x: 0.5, y: 115, z: 0.5, yaw: 0, pitch: 90 });
  }

  game.log(fromDeath ? "TOPDOWN_TS_RESTART" : "TOPDOWN_TS_START", `hp=${player.hp}`);
}

game.onStart(() => {
  controllerId = null;
  cameraAttached.clear();
  resetRun(false);
});

game.onTick(() => {
  const players = input.players() as PlayerInput[];

  if (controllerId && !players.some(candidate => candidate.id === controllerId)) {
    cameraAttached.delete(controllerId);
    controllerId = null;
  }

  if (!controllerId) {
    const claimant = players.find(candidate =>
      candidate.forward || candidate.backward || candidate.left || candidate.right || candidate.jump
    );
    if (claimant) {
      controllerId = claimant.id;
      game.log("TOPDOWN_TS_CONTROLLER", claimant.name);
    }
  }

  const p = controllerId ? players.find(candidate => candidate.id === controllerId) : undefined;
  if (!p) return;

  if (!cameraAttached.has(p.id)) {
    camera.attach(p.id, { x: 0.5, y: 115, z: 0.5, yaw: 0, pitch: 90 });
    cameraAttached.add(p.id);
  }

  if (player.dead) {
    player.restartTicks -= 1;
    if (player.restartTicks <= 0) resetRun(true);
    return;
  }

  if (player.invulnTicks > 0) player.invulnTicks -= 1;
  if (player.attackCooldown > 0) player.attackCooldown -= 1;

  updatePlayer(p);
  if (p.jump && player.attackCooldown === 0) attack();
  updateEnemies();
  if (player.dead) return;

  if (stage === 0 && enemies.length === 0) clearRoom1();
  if (stage === 1 && player.x >= -2 && player.x <= 2 && player.z >= 9 && player.z <= 12.35) enterRoom2();
  if (stage === 2 && enemies.length === 0) clearRoom2();
});
