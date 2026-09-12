const BOARD_X = 88;
const BOARD_Y = 112;
const BOARD_Z = 0.6;
const PADDLE_Y = -5.0;
const SERVE_Y = -4.35;

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
    y: BOARD_Y + 6.5,
    z: BOARD_Z - 0.25,
    scale: 1.15,
    billboard: "center",
  });

  game.hud("main", {
    text: ["SCORE ", score, "   A/D MOVE   SPACE LAUNCH"],
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
          score.add(1);
          hitFx.set(1);
        });
      });

      game.when(ballY.lte(-7.0), () => {
        playing.set(0);
        score.set(0);
      });
    });

    previousJump.set(jump);
  });
});
