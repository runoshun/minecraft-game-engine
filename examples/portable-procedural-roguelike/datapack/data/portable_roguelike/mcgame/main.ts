const MAP_WIDTH = 29;
const MAP_HEIGHT = 37;
const ORIGIN_X = 400;
const ORIGIN_Z = 400;
const FLOOR_Y = 180;
const ACTOR_Y = FLOOR_Y + 1;
const CAMERA_X = ORIGIN_X + MAP_WIDTH / 2;
const CAMERA_Y = 225;
const CAMERA_Z = ORIGIN_Z + MAP_HEIGHT / 2;
const ROOM_SIZE = 5;
const WALL = 0;
const FLOOR = 1;
const EXIT = 2;
const BASE_SEED = 0x51f15eed;

const ROOM_RANGES = [
  { minX: 2, maxX: 5, minZ: 2, maxZ: 5 },
  { minX: 18, maxX: 22, minZ: 2, maxZ: 5 },
  { minX: 2, maxX: 5, minZ: 15, maxZ: 18 },
  { minX: 18, maxX: 22, minZ: 15, maxZ: 18 },
  { minX: 2, maxX: 5, minZ: 28, maxZ: 31 },
  { minX: 18, maxX: 22, minZ: 28, maxZ: 31 },
] as const;

const CONNECTIONS = [
  [0, 1], [0, 2], [1, 3], [2, 3], [2, 4], [3, 5], [4, 5],
] as const;

portableDsl({
  fixedPoint: 1000,
  ownership: {
    minX: ORIGIN_X - 2,
    minZ: ORIGIN_Z - 2,
    maxX: ORIGIN_X + MAP_WIDTH + 1,
    maxZ: ORIGIN_Z + MAP_HEIGHT + 1,
  },
}, game => {
  const dungeon = game.grid("dungeon", {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    initial: WALL,
    outside: WALL,
  });
  const rng = game.rng("floor_rng", { seed: BASE_SEED });
  const terrain = game.gridWorld("terrain", {
    grid: dungeon,
    dimension: "minecraft:overworld",
    originX: ORIGIN_X,
    y: FLOOR_Y,
    originZ: ORIGIN_Z,
    palette: [
      { value: WALL, block: "minecraft:black_concrete" },
      { value: FLOOR, block: "minecraft:deepslate_tiles" },
      { value: EXIT, block: "minecraft:emerald_block" },
    ],
    cellsPerTick: 128,
  });

  const floor = game.state("floor", 0);
  const regenerate = game.state("regenerate", 1);
  const playable = game.state("playable", 0);
  const turn = game.state("turn", 0);
  const score = game.state("score", 0);
  const pickupFx = game.state("pickupFx", 0);

  const playerX = game.state("playerX", 0);
  const playerZ = game.state("playerZ", 0);
  const candidateX = game.state("candidateX", 0);
  const candidateZ = game.state("candidateZ", 0);
  const tileProbe = game.state("tileProbe", 0);
  const exitX = game.state("exitX", 0);
  const exitZ = game.state("exitZ", 0);

  const previousForward = game.state("prevForward", 0);
  const previousBackward = game.state("prevBackward", 0);
  const previousLeft = game.state("prevLeft", 0);
  const previousRight = game.state("prevRight", 0);

  const corridorAX = game.state("corridorAX", 0);
  const corridorAZ = game.state("corridorAZ", 0);
  const corridorBX = game.state("corridorBX", 0);
  const corridorBZ = game.state("corridorBZ", 0);
  const corridorSpan = game.state("corridorSpan", 0);

  const rooms = game.repeat(6, index => ({
    x: game.state("room" + index + "X", 0),
    z: game.state("room" + index + "Z", 0),
  }));

  const enemies = game.repeat(2, index => ({
    active: game.state("enemy" + index + "Active", 0),
    x: game.state("enemy" + index + "X", 0),
    z: game.state("enemy" + index + "Z", 0),
  }));

  const loot = game.repeat(2, index => ({
    active: game.state("loot" + index + "Active", 0),
    x: game.state("loot" + index + "X", 0),
    z: game.state("loot" + index + "Z", 0),
  }));

  const players = game.players();

  function setCenter(targetX: PortableDslState, targetZ: PortableDslState, room: { x: PortableDslState; z: PortableDslState }): void {
    targetX.set(room.x);
    targetX.add(2);
    targetZ.set(room.z);
    targetZ.add(2);
  }

  function carveCorridor(a: { x: PortableDslState; z: PortableDslState }, b: { x: PortableDslState; z: PortableDslState }): void {
    setCenter(corridorAX, corridorAZ, a);
    setCenter(corridorBX, corridorBZ, b);

    game.when(corridorAX.lte(corridorBX), () => {
      corridorSpan.set(corridorBX);
      corridorSpan.sub(corridorAX);
      corridorSpan.add(1);
      dungeon.fillRect({ x: corridorAX, z: corridorAZ, width: corridorSpan, height: 1, value: FLOOR });
    }, () => {
      corridorSpan.set(corridorAX);
      corridorSpan.sub(corridorBX);
      corridorSpan.add(1);
      dungeon.fillRect({ x: corridorBX, z: corridorAZ, width: corridorSpan, height: 1, value: FLOOR });
    });

    game.when(corridorAZ.lte(corridorBZ), () => {
      corridorSpan.set(corridorBZ);
      corridorSpan.sub(corridorAZ);
      corridorSpan.add(1);
      dungeon.fillRect({ x: corridorBX, z: corridorAZ, width: 1, height: corridorSpan, value: FLOOR });
    }, () => {
      corridorSpan.set(corridorAZ);
      corridorSpan.sub(corridorBZ);
      corridorSpan.add(1);
      dungeon.fillRect({ x: corridorBX, z: corridorBZ, width: 1, height: corridorSpan, value: FLOOR });
    });
  }

  function generateFloor(): void {
    playable.set(0);
    dungeon.fill(WALL);

    for (let i = 0; i < rooms.length; i++) {
      const range = ROOM_RANGES[i];
      rng.int(rooms[i].x, range.minX, range.maxX);
      rng.int(rooms[i].z, range.minZ, range.maxZ);
      dungeon.fillRect({ x: rooms[i].x, z: rooms[i].z, width: ROOM_SIZE, height: ROOM_SIZE, value: FLOOR });
    }

    for (const [a, b] of CONNECTIONS) carveCorridor(rooms[a], rooms[b]);

    setCenter(playerX, playerZ, rooms[0]);
    setCenter(exitX, exitZ, rooms[5]);
    dungeon.set(exitX, exitZ, EXIT);

    setCenter(enemies[0].x, enemies[0].z, rooms[2]);
    setCenter(enemies[1].x, enemies[1].z, rooms[3]);
    enemies[0].active.set(1);
    enemies[1].active.set(1);

    setCenter(loot[0].x, loot[0].z, rooms[1]);
    setCenter(loot[1].x, loot[1].z, rooms[4]);
    loot[0].active.set(1);
    loot[1].active.set(1);

    previousForward.set(0);
    previousBackward.set(0);
    previousLeft.set(0);
    previousRight.set(0);
    floor.add(1);
    terrain.rebuild();
  }

  function resolveOccupants(): void {
    for (const enemy of enemies) {
      game.when(enemy.active.eq(1), () => {
        game.when(playerX.eq(enemy.x), () => {
          game.when(playerZ.eq(enemy.z), () => {
            enemy.active.set(0);
            score.add(5);
            pickupFx.set(1);
          });
        });
      });
    }
    for (const item of loot) {
      game.when(item.active.eq(1), () => {
        game.when(playerX.eq(item.x), () => {
          game.when(playerZ.eq(item.z), () => {
            item.active.set(0);
            score.add(1);
            pickupFx.set(1);
          });
        });
      });
    }
  }

  function attemptMove(dx: number, dz: number): void {
    candidateX.set(playerX);
    candidateX.add(dx);
    candidateZ.set(playerZ);
    candidateZ.add(dz);
    dungeon.get(candidateX, candidateZ, tileProbe);
    game.when(tileProbe.gt(WALL), () => {
      playerX.set(candidateX);
      playerZ.set(candidateZ);
      turn.add(1);
      resolveOccupants();
      game.when(tileProbe.eq(EXIT), () => {
        playable.set(0);
        regenerate.set(1);
      });
    });
  }

  game.camera("main", {
    x: CAMERA_X,
    y: CAMERA_Y,
    z: CAMERA_Z,
    yaw: 0,
    pitch: 90,
    mode: "position_lock",
    audience: players,
  });

  game.actor("player", {
    entityType: "minecraft:mannequin",
    x: game.at(playerX, ORIGIN_X + 0.5),
    y: ACTOR_Y,
    z: game.at(playerZ, ORIGIN_Z + 0.5),
    when: playable.eq(1),
  });

  game.actor("enemy_zombie", {
    entityType: "minecraft:zombie",
    x: game.at(enemies[0].x, ORIGIN_X + 0.5),
    y: ACTOR_Y,
    z: game.at(enemies[0].z, ORIGIN_Z + 0.5),
    when: enemies[0].active.eq(1),
  });
  game.actor("enemy_skeleton", {
    entityType: "minecraft:skeleton",
    x: game.at(enemies[1].x, ORIGIN_X + 0.5),
    y: ACTOR_Y,
    z: game.at(enemies[1].z, ORIGIN_Z + 0.5),
    when: enemies[1].active.eq(1),
  });

  game.block("loot_0", {
    block: "minecraft:gold_block",
    x: game.at(loot[0].x, ORIGIN_X + 0.5),
    y: ACTOR_Y + 0.15,
    z: game.at(loot[0].z, ORIGIN_Z + 0.5),
    scale: 0.45,
    translation: { x: -0.225, y: 0, z: -0.225 },
    when: loot[0].active.eq(1),
  });
  game.block("loot_1", {
    block: "minecraft:amethyst_block",
    x: game.at(loot[1].x, ORIGIN_X + 0.5),
    y: ACTOR_Y + 0.15,
    z: game.at(loot[1].z, ORIGIN_Z + 0.5),
    scale: 0.45,
    translation: { x: -0.225, y: 0, z: -0.225 },
    when: loot[1].active.eq(1),
  });

  game.particle("pickup", {
    particle: "minecraft:end_rod",
    x: game.at(playerX, ORIGIN_X + 0.5),
    y: ACTOR_Y + 0.8,
    z: game.at(playerZ, ORIGIN_Z + 0.5),
    delta: 0.25,
    speed: 0.02,
    count: 8,
    force: true,
    when: pickupFx.eq(1),
  });
  game.sound("pickup", {
    sound: "minecraft:block.amethyst_block.chime",
    x: game.at(playerX, ORIGIN_X + 0.5),
    y: ACTOR_Y,
    z: game.at(playerZ, ORIGIN_Z + 0.5),
    volume: 0.8,
    pitch: 1.2,
    when: pickupFx.eq(1),
  });

  game.tick(() => {
    pickupFx.set(0);

    game.when(regenerate.eq(1), () => {
      generateFloor();
      regenerate.set(0);
    });

    game.when(terrain.ready.eq(1), () => playable.set(1));

    game.forSinglePlayer(players, player => {
      game.when(playable.eq(1), () => {
        game.when(previousForward.eq(0), () => game.when(player.input.forward.eq(1), () => attemptMove(0, -1)));
        game.when(previousBackward.eq(0), () => game.when(player.input.backward.eq(1), () => attemptMove(0, 1)));
        game.when(previousLeft.eq(0), () => game.when(player.input.left.eq(1), () => attemptMove(-1, 0)));
        game.when(previousRight.eq(0), () => game.when(player.input.right.eq(1), () => attemptMove(1, 0)));
      });

      previousForward.set(player.input.forward);
      previousBackward.set(player.input.backward);
      previousLeft.set(player.input.left);
      previousRight.set(player.input.right);

      player.hud("status", {
        text: ["FLOOR ", floor, "  TURN ", turn, "  SCORE ", score, "  READY ", playable, "  WASD MOVE"],
      });
    });
  });
});
