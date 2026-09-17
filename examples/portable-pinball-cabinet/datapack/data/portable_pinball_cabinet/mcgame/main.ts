const HEAD_TEXTURE = "https://textures.minecraft.net/texture/fa1a7795581e6ffde1cd49edb9f50b37b8b7ffa5a8245c1a7284404f5cbd6bfc";
const ARENA_X = 770;
const ARENA_Y = 104;
const ARENA_Z = 770;
const SERVE_Y = -1.85;
const BALL_RADIUS = 0.13;

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

portableDsl({
  fixedPoint: 1000,
  ownership: {
    dimension: "minecraft:overworld",
    minX: 720,
    minZ: 720,
    maxX: 780,
    maxZ: 780,
  },
}, game => {
  const players = game.players();
  const left = game.state("left", 0);
  const right = game.state("right", 0);
  const ballX = game.state("ballX", 0);
  const ballY = game.state("ballY", SERVE_Y);
  const ballVx = game.state("ballVx", 0.07);
  const ballVy = game.state("ballVy", 0.16);
  const playing = game.state("playing", 0);
  const launched = game.state("launched", 0);
  const previousJump = game.state("previousJump", 0);
  const score = game.state("score", 0);
  const lives = game.state("lives", 3);
  const wallLock = game.state("wallLock", 0);
  const bumperLock = game.state("bumperLock", 0);
  const flipperLock = game.state("flipperLock", 0);

  const ball = game.circle("ball_hit", { x: ballX, y: ballY, radius: BALL_RADIUS });
  const leftWall = game.capsule("wall_l", { ax: -1.8, ay: -2.2, bx: -1.8, by: 2.2, radius: 0.11 });
  const rightWall = game.capsule("wall_r", { ax: 1.8, ay: -2.2, bx: 1.8, by: 2.2, radius: 0.11 });
  const topWall = game.segment("wall_t", { ax: -1.8, ay: 2.2, bx: 1.8, by: 2.2 });
  const leftGuide = game.capsule("guide_l", { ax: -1.7, ay: -1.85, bx: -0.9, by: -1.35, radius: 0.1 });
  const rightGuide = game.capsule("guide_r", { ax: 1.7, ay: -1.85, bx: 0.9, by: -1.35, radius: 0.1 });
  const drain = game.trigger("drain", { x: 0, y: -2.55, width: 4.0, height: 0.45 });
  const bumperA = game.circle("bump_a", { x: -0.8, y: 0.45, radius: 0.28 });
  const bumperB = game.circle("bump_b", { x: 0.8, y: 0.45, radius: 0.28 });
  const bumperC = game.circle("bump_c", { x: 0, y: 1.25, radius: 0.28 });
  const leftFlipper = game.flipper("flip_l", {
    pivotX: -0.75, pivotY: -1.65, length: 0.9, radius: 0.13,
    restAngle: 18, activeAngle: 58, activeWhen: left.eq(1),
  });
  const rightFlipper = game.flipper("flip_r", {
    pivotX: 0.75, pivotY: -1.65, length: 0.9, radius: 0.13,
    restAngle: 162, activeAngle: 122, activeWhen: right.eq(1),
  });

  game.block("arena_body", {
    block: "minecraft:polished_blackstone",
    x: ARENA_X, y: ARENA_Y, z: ARENA_Z,
    scale: { x: 4.6, y: 6.6, z: 0.7 },
    translation: { x: -2.3, y: -3.3, z: -0.35 },
  });
  game.block("arena_playfield", {
    block: "minecraft:black_concrete",
    x: ARENA_X, y: ARENA_Y, z: ARENA_Z + 0.39,
    scale: { x: 4.0, y: 5.4, z: 0.08 },
    translation: { x: -2.0, y: -2.7, z: -0.04 },
  });
  game.block("arena_ball", {
    block: "minecraft:sea_lantern",
    x: game.at(ballX, ARENA_X), y: game.at(ballY, ARENA_Y), z: ARENA_Z + 0.48,
    scale: 0.26,
    translation: { x: -0.13, y: -0.13, z: -0.13 },
  });

  for (const bumper of [
    { id: "ba", x: -0.8, y: 0.45, block: "minecraft:redstone_block" },
    { id: "bb", x: 0.8, y: 0.45, block: "minecraft:gold_block" },
    { id: "bc", x: 0, y: 1.25, block: "minecraft:emerald_block" },
  ]) {
    game.block("arena_" + bumper.id, {
      block: bumper.block,
      x: ARENA_X + bumper.x, y: ARENA_Y + bumper.y, z: ARENA_Z + 0.46,
      scale: { x: 0.5, y: 0.5, z: 0.18 },
      translation: { x: -0.25, y: -0.25, z: -0.09 },
    });
  }

  game.block("arena_wall_l", {
    block: "minecraft:light_blue_concrete", x: ARENA_X - 1.8, y: ARENA_Y, z: ARENA_Z + 0.46,
    scale: { x: 0.16, y: 4.5, z: 0.18 }, translation: { x: -0.08, y: -2.25, z: -0.09 },
  });
  game.block("arena_wall_r", {
    block: "minecraft:light_blue_concrete", x: ARENA_X + 1.8, y: ARENA_Y, z: ARENA_Z + 0.46,
    scale: { x: 0.16, y: 4.5, z: 0.18 }, translation: { x: -0.08, y: -2.25, z: -0.09 },
  });
  game.block("arena_wall_t", {
    block: "minecraft:light_blue_concrete", x: ARENA_X, y: ARENA_Y + 2.2, z: ARENA_Z + 0.46,
    scale: { x: 3.75, y: 0.16, z: 0.18 }, translation: { x: -1.875, y: -0.08, z: -0.09 },
  });

  for (const [id, ax, ay, bx, by] of [
    ["gl", -1.7, -1.85, -0.9, -1.35],
    ["gr", 1.7, -1.85, 0.9, -1.35],
  ] as const) {
    for (const [index, point] of linePoints(ax, ay, bx, by, 5).entries()) {
      game.block("arena_" + id + index, {
        block: "minecraft:cyan_concrete",
        x: ARENA_X + point.x, y: ARENA_Y + point.y, z: ARENA_Z + 0.46,
        scale: { x: 0.24, y: 0.18, z: 0.18 }, translation: { x: -0.12, y: -0.09, z: -0.09 },
      });
    }
  }

  function flipperVisual(prefix: string, pivotX: number, pivotY: number, length: number, restAngle: number, activeAngle: number, active: typeof left) {
    const rest = poseEnd(pivotX, pivotY, length, restAngle);
    const raised = poseEnd(pivotX, pivotY, length, activeAngle);
    const restPoints = linePoints(pivotX, pivotY, rest.x, rest.y, 5);
    const activePoints = linePoints(pivotX, pivotY, raised.x, raised.y, 5);
    game.repeat(5, i => {
      game.block("arena_" + prefix + "r" + i, {
        block: "minecraft:orange_concrete",
        x: ARENA_X + restPoints[i].x, y: ARENA_Y + restPoints[i].y, z: ARENA_Z + 0.5,
        scale: { x: 0.24, y: 0.18, z: 0.2 }, translation: { x: -0.12, y: -0.09, z: -0.1 },
        when: active.eq(0),
      });
      game.block("arena_" + prefix + "a" + i, {
        block: "minecraft:yellow_concrete",
        x: ARENA_X + activePoints[i].x, y: ARENA_Y + activePoints[i].y, z: ARENA_Z + 0.5,
        scale: { x: 0.24, y: 0.18, z: 0.2 }, translation: { x: -0.12, y: -0.09, z: -0.1 },
        when: active.eq(1),
      });
    });
  }
  flipperVisual("lf", -0.75, -1.65, 0.9, 18, 58, left);
  flipperVisual("rf", 0.75, -1.65, 0.9, 162, 122, right);

  game.text("arena_title", {
    text: "PORTABLE PINBALL",
    x: ARENA_X, y: ARENA_Y + 3.6, z: ARENA_Z + 0.55,
    scale: 0.65, billboard: "center",
  });
  game.text("arena_score", {
    text: ["SCORE ", score, "  BALLS ", lives],
    x: ARENA_X, y: ARENA_Y + 3.1, z: ARENA_Z + 0.55,
    scale: 0.45, billboard: "center",
  });
  game.text("arena_help", {
    text: "A/D FLIPPERS   SPACE LAUNCH   SNEAK EXIT",
    x: ARENA_X, y: ARENA_Y - 3.6, z: ARENA_Z + 0.55,
    scale: 0.35, billboard: "center",
  });

  const cabinetItem = game.item("pinball_item", {
    name: "Portable Pinball Cabinet",
    appearance: { kind: "head", textureUrl: HEAD_TEXTURE },
    maxStackSize: 1,
  });

  let cabinetController!: PortableDslInteractionController;
  game.placeable("pinball", { item: cabinetItem, maxInstances: 1, orientation: "cardinal" }, cabinet => {
    cabinet.block("body", {
      block: "minecraft:polished_blackstone",
      x: 0, y: 0.62, z: 0,
      scale: { x: 0.86, y: 1.24, z: 0.78 },
      translation: { x: -0.43, y: -0.62, z: -0.39 },
    });
    cabinet.block("screen", {
      block: "minecraft:black_concrete",
      x: 0, y: 0.72, z: -0.41,
      scale: { x: 0.64, y: 0.46, z: 0.06 },
      translation: { x: -0.32, y: -0.23, z: -0.03 },
    });
    cabinet.itemDisplay("badge", {
      item: cabinetItem,
      x: 0, y: 0.98, z: -0.48,
      scale: 0.25,
    });
    cabinet.text("label", {
      text: "PINBALL",
      x: 0, y: 1.34, z: -0.46,
      scale: 0.28, billboard: "center",
    });
    cabinet.text("hint", {
      text: "USE",
      x: 0, y: 0.25, z: -0.46,
      scale: 0.18, billboard: "center",
    });

    const controls = cabinet.interaction("controls", {
      x: 0, y: 0.65, z: -0.48,
      width: 0.9, height: 1.3,
    });
    cabinetController = controls.controller;

    cabinet.tick(() => {
      left.set(0);
      right.set(0);
      game.when(wallLock.gt(0), () => wallLock.sub(1));
      game.when(bumperLock.gt(0), () => bumperLock.sub(1));
      game.when(flipperLock.gt(0), () => flipperLock.sub(1));

      controls.onUse(player => {
        game.when(player.input.sneak.eq(1), () => {
          game.when(playing.eq(0), () => cabinet.pickUp(player));
        }, () => {
          game.when(playing.eq(0), () => {
            controls.controller.claim(player);
            playing.set(1);
            launched.set(0);
            previousJump.set(0);
          });
        });
      });

      controls.controller.forPlayer(player => {
        game.when(player.input.sneak.eq(1), () => {
          playing.set(0);
          launched.set(0);
          left.set(0);
          right.set(0);
          controls.controller.returnToInteraction(player);
        }, () => {
          left.set(player.input.left);
          right.set(player.input.right);
          game.when(playing.eq(1), () => {
            game.when(launched.eq(0), () => {
              ballX.set(0);
              ballY.set(SERVE_Y);
              game.when(previousJump.eq(0), () => game.when(player.input.jump.eq(1), () => {
                launched.set(1);
                ballVx.set(0.07);
                ballVy.set(0.16);
              }));
            }, () => {
              ballVy.sub(0.005);
              ballX.add(ballVx);
              ballY.add(ballVy);

              game.whenColliding(ball, leftWall, () => game.when(wallLock.eq(0), () => {
                ballVx.set(0.09); wallLock.set(3);
              }));
              game.whenColliding(ball, rightWall, () => game.when(wallLock.eq(0), () => {
                ballVx.set(-0.09); wallLock.set(3);
              }));
              game.whenColliding(ball, topWall, () => game.when(wallLock.eq(0), () => {
                ballVy.set(-0.13); wallLock.set(3);
              }));
              game.whenColliding(ball, leftGuide, () => game.when(wallLock.eq(0), () => {
                ballVx.set(0.10); ballVy.set(0.15); wallLock.set(3);
              }));
              game.whenColliding(ball, rightGuide, () => game.when(wallLock.eq(0), () => {
                ballVx.set(-0.10); ballVy.set(0.15); wallLock.set(3);
              }));

              game.whenColliding(ball, bumperA, () => game.when(bumperLock.eq(0), () => {
                ballVx.set(-0.11); ballVy.set(0.17); score.add(10); bumperLock.set(4);
              }));
              game.whenColliding(ball, bumperB, () => game.when(bumperLock.eq(0), () => {
                ballVx.set(0.11); ballVy.set(0.17); score.add(10); bumperLock.set(4);
              }));
              game.whenColliding(ball, bumperC, () => game.when(bumperLock.eq(0), () => {
                ballVx.set(0.08); ballVy.set(-0.14); score.add(15); bumperLock.set(4);
              }));
              game.whenColliding(ball, leftFlipper, () => game.when(flipperLock.eq(0), () => {
                ballVx.set(0.12); ballVy.set(0.21); score.add(5); flipperLock.set(3);
              }));
              game.whenColliding(ball, rightFlipper, () => game.when(flipperLock.eq(0), () => {
                ballVx.set(-0.12); ballVy.set(0.21); score.add(5); flipperLock.set(3);
              }));

              game.whenTriggered(drain, ball, () => {
                lives.sub(1);
                launched.set(0);
                game.when(lives.lte(0), () => {
                  lives.set(3);
                  score.set(0);
                });
              });
            });
            previousJump.set(player.input.jump);
          });
        });
      });
    });
  });

  game.camera("pinball_view", {
    x: ARENA_X,
    y: ARENA_Y,
    z: ARENA_Z + 8,
    yaw: 180,
    pitch: 0,
    audience: cabinetController,
  });

  game.tick(() => {
    game.forEachPlayer(players, player => {
      const itemGranted = player.state("pinballItemGranted", 0);
      game.when(itemGranted.eq(0), () => {
        cabinetItem.give(player);
        itemGranted.set(1);
      });
    });
  });
});
