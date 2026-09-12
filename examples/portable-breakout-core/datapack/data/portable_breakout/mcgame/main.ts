const BOARD_X = 88;
const BOARD_Y = 112;
const BOARD_Z = 0.6;
const PADDLE_Y = -5.0;
const SERVE_Y = -4.35;
const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const BRICK_COUNT = BRICK_ROWS * BRICK_COLS;
const BRICK_COLORS = [
  "minecraft:red_concrete",
  "minecraft:orange_concrete",
  "minecraft:yellow_concrete",
  "minecraft:lime_concrete",
  "minecraft:light_blue_concrete",
];

portableDsl({ fixedPoint: 1000 }, game => {
  const left = game.input("left", 0, { source: "first_player_left" });
  const right = game.input("right", 0, { source: "first_player_right" });
  const jump = game.input("jump", 0, { source: "first_player_jump" });

  const paddleX = game.state("paddleX", 0);
  const paddleDelta = game.state("paddleDelta", 0);
  const ballX = game.state("ballX", 0);
  const ballY = game.state("ballY", SERVE_Y);
  const ballVx = game.state("ballVx", 0.17);
  const ballVy = game.state("ballVy", 0.26);
  const playing = game.state("playing", 0);
  const previousJump = game.state("previousJump", 0);
  const hitFx = game.state("hitFx", 0);
  const score = game.state("score", 0);
  const lives = game.state("lives", 3);
  const bricksLeft = game.state("bricksLeft", BRICK_COUNT);
  const brickHit = game.state("brickHit", 0);

  const paddleHitbox = game.box("paddle", {
    x: paddleX,
    y: PADDLE_Y,
    width: 3.0,
    height: 0.4,
  });
  const ballHitbox = game.box("ball", {
    x: ballX,
    y: ballY,
    width: 0.45,
    height: 0.45,
  });

  const bricks = game.repeat(BRICK_COUNT, index => {
    const row = Math.floor(index / BRICK_COLS);
    const col = index % BRICK_COLS;
    const x = -5.25 + col * 1.5;
    const y = 5.5 - row * 0.8;
    const alive = game.state("brick" + index, 1);
    const collider = game.box("brick_" + index, {
      x,
      y,
      width: 1.35,
      height: 0.55,
    });

    game.block("brick_" + String(index).padStart(2, "0"), {
      block: BRICK_COLORS[row],
      x: BOARD_X + x,
      y: BOARD_Y + y,
      z: BOARD_Z - 0.05,
      scale: { x: 1.35, y: 0.55, z: 0.3 },
      translation: { x: -0.675, y: -0.275, z: -0.15 },
      when: alive.eq(1),
    });

    return { alive, collider, points: BRICK_ROWS - row };
  });

  game.camera("main", {
    x: BOARD_X,
    y: BOARD_Y - 1.6,
    z: -22,
    yaw: 0,
    pitch: 0,
  });

  game.block("board", {
    block: "minecraft:black_concrete",
    x: BOARD_X,
    y: BOARD_Y,
    z: BOARD_Z + 0.25,
    scale: { x: 14.0, y: 16.0, z: 0.2 },
    translation: { x: -7.0, y: -8.0, z: -0.1 },
  });
  game.block("paddle", {
    block: "minecraft:cyan_concrete",
    x: game.at(paddleX, BOARD_X),
    y: BOARD_Y + PADDLE_Y,
    z: BOARD_Z,
    scale: { x: 3.0, y: 0.4, z: 0.35 },
    translation: { x: -1.5, y: -0.2, z: -0.175 },
  });
  game.block("ball", {
    block: "minecraft:sea_lantern",
    x: game.at(ballX, BOARD_X),
    y: game.at(ballY, BOARD_Y),
    z: BOARD_Z - 0.1,
    scale: 0.45,
    translation: { x: -0.225, y: -0.225, z: -0.225 },
  });
  game.text("title", {
    text: "PORTABLE BREAKOUT",
    x: BOARD_X,
    y: BOARD_Y + 7.1,
    z: BOARD_Z - 0.25,
    scale: 1.15,
    billboard: "center",
  });

  game.hud("main", {
    text: ["SCORE ", score, "   LIVES ", lives, "   BRICKS ", bricksLeft, "   A/D MOVE  SPACE LAUNCH"],
  });

  game.particle("trail", {
    particle: "minecraft:end_rod",
    x: game.at(ballX, BOARD_X),
    y: game.at(ballY, BOARD_Y),
    z: BOARD_Z - 0.1,
    delta: 0.03,
    speed: 0,
    count: 1,
    force: true,
    when: playing.eq(1),
  });
  game.particle("bounce", {
    particle: "minecraft:cloud",
    x: game.at(ballX, BOARD_X),
    y: game.at(ballY, BOARD_Y),
    z: BOARD_Z - 0.1,
    delta: { x: 0.16, y: 0.16, z: 0.04 },
    speed: 0.02,
    count: 8,
    force: true,
    when: hitFx.eq(1),
  });
  game.sound("bounce", {
    sound: "minecraft:block.note_block.pling",
    x: game.at(ballX, BOARD_X),
    y: game.at(ballY, BOARD_Y),
    z: BOARD_Z - 0.1,
    volume: 0.7,
    pitch: 1.35,
    when: hitFx.eq(1),
  });

  game.tick(() => {
    hitFx.set(0);
    brickHit.set(0);
    paddleDelta.set(0);
    game.when(left.eq(1), () => paddleDelta.sub(0.32));
    game.when(right.eq(1), () => paddleDelta.add(0.32));

    paddleX.add(paddleDelta);
    game.when(paddleX.gte(5.2), () => paddleX.set(5.2));
    game.when(paddleX.lte(-5.2), () => paddleX.set(-5.2));

    game.when(playing.eq(0), () => {
      ballX.set(paddleX);
      ballY.set(SERVE_Y);
      game.when(previousJump.eq(0), () => {
        game.when(jump.eq(1), () => playing.set(1));
      });
    }, () => {
      ballX.add(ballVx);
      ballY.add(ballVy);

      game.when(ballX.gte(6.2), () => {
        ballX.set(6.2);
        ballVx.negate();
        hitFx.set(1);
      });
      game.when(ballX.lte(-6.2), () => {
        ballX.set(-6.2);
        ballVx.negate();
        hitFx.set(1);
      });
      game.when(ballY.gte(7.0), () => {
        ballY.set(7.0);
        ballVy.negate();
        hitFx.set(1);
      });

      game.when(ballVy.lt(0), () => {
        game.whenColliding(ballHitbox, paddleHitbox, () => {
          ballY.set(PADDLE_Y + 0.425);
          ballVy.negate();
          hitFx.set(1);
        });
      });

      for (const brick of bricks) {
        game.when(brick.alive.eq(1), () => {
          game.when(brickHit.eq(0), () => {
            game.whenColliding(ballHitbox, brick.collider, () => {
              brick.alive.set(0);
              brickHit.set(1);
              bricksLeft.sub(1);
              score.add(brick.points);
              ballVy.negate();
              hitFx.set(1);
            });
          });
        });
      }

      game.when(bricksLeft.eq(0), () => {
        for (const brick of bricks) brick.alive.set(1);
        bricksLeft.set(BRICK_COUNT);
        ballY.set(SERVE_Y);
        ballX.set(paddleX);
        playing.set(0);
      });

      game.when(ballY.lte(-7.0), () => {
        lives.sub(1);
        playing.set(0);
        game.when(lives.lte(0), () => {
          lives.set(3);
          score.set(0);
          bricksLeft.set(BRICK_COUNT);
          for (const brick of bricks) brick.alive.set(1);
        });
      });
    });

    previousJump.set(jump);
  });
});
