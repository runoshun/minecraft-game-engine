const BOARD_X = 120;
const BOARD_Y = 104;
const BOARD_Z = 0.6;
const SERVE_Y = -4.6;
const BALL_RADIUS = 0.22;

function linePoints(ax: number, ay: number, bx: number, by: number, count: number) {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    points.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
  }
  return points;
}

function poseEnd(pivotX: number, pivotY: number, length: number, angle: number) {
  const radians = angle * Math.PI / 180;
  return { x: pivotX + Math.cos(radians) * length, y: pivotY + Math.sin(radians) * length };
}

portableDsl({ fixedPoint: 1000, ownership: { minX: 112, minZ: -24, maxX: 128, maxZ: 4 } }, game => {
  const left = game.input("left", 0, { source: "first_player_left" });
  const right = game.input("right", 0, { source: "first_player_right" });
  const jump = game.input("jump", 0, { source: "first_player_jump" });

  const ballX = game.state("ballX", 0);
  const ballY = game.state("ballY", SERVE_Y);
  const ballVx = game.state("ballVx", 0.14);
  const ballVy = game.state("ballVy", 0.34);
  const playing = game.state("playing", 0);
  const previousJump = game.state("previousJump", 0);
  const score = game.state("score", 0);
  const lives = game.state("lives", 3);
  const hitFx = game.state("hitFx", 0);
  const wallLock = game.state("wallLock", 0);
  const bumperLock = game.state("bumperLock", 0);
  const flipperLock = game.state("flipperLock", 0);

  const ball = game.circle("ball_hit", { x: ballX, y: ballY, radius: BALL_RADIUS });
  const leftWall = game.capsule("wall_l", { ax: -6.0, ay: -5.2, bx: -6.0, by: 6.4, radius: 0.18 });
  const rightWall = game.capsule("wall_r", { ax: 6.0, ay: -5.2, bx: 6.0, by: 6.4, radius: 0.18 });
  const topWall = game.segment("wall_t", { ax: -6.0, ay: 6.4, bx: 6.0, by: 6.4 });
  const leftGuide = game.capsule("guide_l", { ax: -5.8, ay: -4.8, bx: -3.0, by: -3.6, radius: 0.18 });
  const rightGuide = game.capsule("guide_r", { ax: 5.8, ay: -4.8, bx: 3.0, by: -3.6, radius: 0.18 });
  const drain = game.trigger("drain", { x: 0, y: -6.0, width: 12.5, height: 1.0 });

  const bumperA = game.circle("bump_a", { x: -2.6, y: 2.5, radius: 0.58 });
  const bumperB = game.circle("bump_b", { x: 2.6, y: 2.5, radius: 0.58 });
  const bumperC = game.circle("bump_c", { x: 0, y: 4.6, radius: 0.58 });

  const leftFlipper = game.flipper("flip_l", {
    pivotX: -2.5, pivotY: -4.6, length: 2.6, radius: 0.22,
    restAngle: 18, activeAngle: 58, activeWhen: left.eq(1),
  });
  const rightFlipper = game.flipper("flip_r", {
    pivotX: 2.5, pivotY: -4.6, length: 2.6, radius: 0.22,
    restAngle: 162, activeAngle: 122, activeWhen: right.eq(1),
  });

  game.camera("main", { x: BOARD_X, y: BOARD_Y, z: -22, yaw: 0, pitch: 0 });
  game.block("board", {
    block: "minecraft:black_concrete",
    x: BOARD_X, y: BOARD_Y, z: BOARD_Z + 0.25,
    scale: { x: 14, y: 15, z: 0.2 },
    translation: { x: -7, y: -7.5, z: -0.1 },
  });
  game.block("ball", {
    block: "minecraft:sea_lantern",
    x: game.at(ballX, BOARD_X), y: game.at(ballY, BOARD_Y), z: BOARD_Z - 0.1,
    scale: 0.44,
    translation: { x: -0.22, y: -0.22, z: -0.22 },
  });

  const bumpers = [
    { id: "ba", x: -2.6, y: 2.5, block: "minecraft:redstone_block" },
    { id: "bb", x: 2.6, y: 2.5, block: "minecraft:gold_block" },
    { id: "bc", x: 0, y: 4.6, block: "minecraft:emerald_block" },
  ];
  for (const bumper of bumpers) {
    game.block(bumper.id, {
      block: bumper.block,
      x: BOARD_X + bumper.x, y: BOARD_Y + bumper.y, z: BOARD_Z,
      scale: { x: 1.05, y: 1.05, z: 0.35 },
      translation: { x: -0.525, y: -0.525, z: -0.175 },
    });
  }

  game.block("wall_l", {
    block: "minecraft:light_blue_concrete",
    x: BOARD_X - 6.0, y: BOARD_Y + 0.6, z: BOARD_Z,
    scale: { x: 0.3, y: 11.6, z: 0.3 }, translation: { x: -0.15, y: -5.8, z: -0.15 },
  });
  game.block("wall_r", {
    block: "minecraft:light_blue_concrete",
    x: BOARD_X + 6.0, y: BOARD_Y + 0.6, z: BOARD_Z,
    scale: { x: 0.3, y: 11.6, z: 0.3 }, translation: { x: -0.15, y: -5.8, z: -0.15 },
  });
  game.block("wall_t", {
    block: "minecraft:light_blue_concrete",
    x: BOARD_X, y: BOARD_Y + 6.4, z: BOARD_Z,
    scale: { x: 12.3, y: 0.3, z: 0.3 }, translation: { x: -6.15, y: -0.15, z: -0.15 },
  });

  for (const [id, ax, ay, bx, by] of [
    ["gl", -5.8, -4.8, -3.0, -3.6],
    ["gr", 5.8, -4.8, 3.0, -3.6],
  ] as const) {
    for (const [index, point] of linePoints(ax, ay, bx, by, 7).entries()) {
      game.block(id + index, {
        block: "minecraft:cyan_concrete",
        x: BOARD_X + point.x, y: BOARD_Y + point.y, z: BOARD_Z,
        scale: { x: 0.55, y: 0.35, z: 0.3 }, translation: { x: -0.275, y: -0.175, z: -0.15 },
      });
    }
  }

  function flipperVisual(prefix: string, pivotX: number, pivotY: number, length: number, restAngle: number, activeAngle: number, active: ReturnType<typeof game.input>) {
    const rest = poseEnd(pivotX, pivotY, length, restAngle);
    const raised = poseEnd(pivotX, pivotY, length, activeAngle);
    const restPoints = linePoints(pivotX, pivotY, rest.x, rest.y, 7);
    const activePoints = linePoints(pivotX, pivotY, raised.x, raised.y, 7);
    game.repeat(7, i => {
      game.block(prefix + "r" + i, {
        block: "minecraft:orange_concrete",
        x: BOARD_X + restPoints[i].x, y: BOARD_Y + restPoints[i].y, z: BOARD_Z - 0.05,
        scale: { x: 0.5, y: 0.38, z: 0.35 }, translation: { x: -0.25, y: -0.19, z: -0.175 },
        when: active.eq(0),
      });
      game.block(prefix + "a" + i, {
        block: "minecraft:yellow_concrete",
        x: BOARD_X + activePoints[i].x, y: BOARD_Y + activePoints[i].y, z: BOARD_Z - 0.05,
        scale: { x: 0.5, y: 0.38, z: 0.35 }, translation: { x: -0.25, y: -0.19, z: -0.175 },
        when: active.eq(1),
      });
    });
  }
  flipperVisual("lf", -2.5, -4.6, 2.6, 18, 58, left);
  flipperVisual("rf", 2.5, -4.6, 2.6, 162, 122, right);

  game.text("title", {
    text: "PORTABLE PINBALL",
    x: BOARD_X, y: BOARD_Y + 7.0, z: BOARD_Z - 0.25,
    scale: 1.1, billboard: "center",
  });
  game.hud("main", { text: ["SCORE ", score, "   BALLS ", lives, "   A/D FLIPPERS  SPACE LAUNCH"] });
  game.particle("hit", {
    particle: "minecraft:electric_spark",
    x: game.at(ballX, BOARD_X), y: game.at(ballY, BOARD_Y), z: BOARD_Z - 0.1,
    delta: { x: 0.18, y: 0.18, z: 0.05 }, speed: 0.03, count: 10, force: true,
    when: hitFx.eq(1),
  });
  game.sound("hit", {
    sound: "minecraft:block.note_block.pling",
    x: game.at(ballX, BOARD_X), y: game.at(ballY, BOARD_Y), z: BOARD_Z - 0.1,
    volume: 0.8, pitch: 1.55, when: hitFx.eq(1),
  });

  game.tick(() => {
    hitFx.set(0);
    game.when(wallLock.gt(0), () => wallLock.sub(1));
    game.when(bumperLock.gt(0), () => bumperLock.sub(1));
    game.when(flipperLock.gt(0), () => flipperLock.sub(1));

    game.when(playing.eq(0), () => {
      ballX.set(0);
      ballY.set(SERVE_Y);
      game.when(previousJump.eq(0), () => {
        game.when(jump.eq(1), () => {
          playing.set(1);
          ballVx.set(0.14);
          ballVy.set(0.34);
        });
      });
    }, () => {
      ballVy.sub(0.01);
      ballX.add(ballVx);
      ballY.add(ballVy);

      game.whenColliding(ball, leftWall, () => game.when(wallLock.eq(0), () => {
        ballVx.set(0.18); wallLock.set(3); hitFx.set(1);
      }));
      game.whenColliding(ball, rightWall, () => game.when(wallLock.eq(0), () => {
        ballVx.set(-0.18); wallLock.set(3); hitFx.set(1);
      }));
      game.whenColliding(ball, topWall, () => game.when(wallLock.eq(0), () => {
        ballVy.set(-0.24); wallLock.set(3); hitFx.set(1);
      }));
      game.whenColliding(ball, leftGuide, () => game.when(wallLock.eq(0), () => {
        ballVx.set(0.18); ballVy.set(0.24); wallLock.set(3); hitFx.set(1);
      }));
      game.whenColliding(ball, rightGuide, () => game.when(wallLock.eq(0), () => {
        ballVx.set(-0.18); ballVy.set(0.24); wallLock.set(3); hitFx.set(1);
      }));

      game.whenColliding(ball, bumperA, () => game.when(bumperLock.eq(0), () => {
        ballVx.set(-0.20); ballVy.set(0.31); score.add(10); bumperLock.set(4); hitFx.set(1);
      }));
      game.whenColliding(ball, bumperB, () => game.when(bumperLock.eq(0), () => {
        ballVx.set(0.20); ballVy.set(0.31); score.add(10); bumperLock.set(4); hitFx.set(1);
      }));
      game.whenColliding(ball, bumperC, () => game.when(bumperLock.eq(0), () => {
        ballVx.set(0.16); ballVy.set(-0.28); score.add(15); bumperLock.set(4); hitFx.set(1);
      }));

      game.whenColliding(ball, leftFlipper, () => game.when(flipperLock.eq(0), () => {
        ballVx.set(0.24); ballVy.set(0.42); score.add(5); flipperLock.set(3); hitFx.set(1);
      }));
      game.whenColliding(ball, rightFlipper, () => game.when(flipperLock.eq(0), () => {
        ballVx.set(-0.24); ballVy.set(0.42); score.add(5); flipperLock.set(3); hitFx.set(1);
      }));

      game.whenTriggered(drain, ball, () => {
        lives.sub(1);
        playing.set(0);
        game.when(lives.lte(0), () => {
          lives.set(3);
          score.set(0);
        });
      });
    });

    previousJump.set(jump);
  });
});
