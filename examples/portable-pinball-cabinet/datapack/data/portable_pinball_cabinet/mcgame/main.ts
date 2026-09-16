const HEAD_TEXTURE = "https://textures.minecraft.net/texture/fa1a7795581e6ffde1cd49edb9f50b37b8b7ffa5a8245c1a7284404f5cbd6bfc";
const BOARD_Y = 3.55;
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
    maxX: 760,
    maxZ: 760,
  },
}, game => {
  const players = game.players();
  const cabinetItem = game.item("pinball_item", {
    name: "Portable Pinball Cabinet",
    appearance: { kind: "head", textureUrl: HEAD_TEXTURE },
    maxStackSize: 1,
  });

  game.placeable("pinball", { item: cabinetItem, maxInstances: 2, orientation: "cardinal" }, table => {
    const left = table.state("left", 0);
    const right = table.state("right", 0);
    const ballX = table.state("ballX", 0);
    const ballY = table.state("ballY", SERVE_Y);
    const ballVx = table.state("ballVx", 0.07);
    const ballVy = table.state("ballVy", 0.16);
    const playing = table.state("playing", 0);
    const launched = table.state("launched", 0);
    const previousJump = table.state("previousJump", 0);
    const score = table.state("score", 0);
    const lives = table.state("lives", 3);
    const wallLock = table.state("wallLock", 0);
    const bumperLock = table.state("bumperLock", 0);
    const flipperLock = table.state("flipperLock", 0);

    const ball = table.circle("ball_hit", { x: ballX, y: ballY, radius: BALL_RADIUS });
    const leftWall = table.capsule("wall_l", { ax: -1.8, ay: -2.2, bx: -1.8, by: 2.2, radius: 0.11 });
    const rightWall = table.capsule("wall_r", { ax: 1.8, ay: -2.2, bx: 1.8, by: 2.2, radius: 0.11 });
    const topWall = table.segment("wall_t", { ax: -1.8, ay: 2.2, bx: 1.8, by: 2.2 });
    const leftGuide = table.capsule("guide_l", { ax: -1.7, ay: -1.85, bx: -0.9, by: -1.35, radius: 0.1 });
    const rightGuide = table.capsule("guide_r", { ax: 1.7, ay: -1.85, bx: 0.9, by: -1.35, radius: 0.1 });
    const drain = table.trigger("drain", { x: 0, y: -2.55, width: 4.0, height: 0.45 });
    const bumperA = table.circle("bump_a", { x: -0.8, y: 0.45, radius: 0.28 });
    const bumperB = table.circle("bump_b", { x: 0.8, y: 0.45, radius: 0.28 });
    const bumperC = table.circle("bump_c", { x: 0, y: 1.25, radius: 0.28 });
    const leftFlipper = table.flipper("flip_l", {
      pivotX: -0.75, pivotY: -1.65, length: 0.9, radius: 0.13,
      restAngle: 18, activeAngle: 58, activeWhen: left.eq(1),
    });
    const rightFlipper = table.flipper("flip_r", {
      pivotX: 0.75, pivotY: -1.65, length: 0.9, radius: 0.13,
      restAngle: 162, activeAngle: 122, activeWhen: right.eq(1),
    });

    table.block("body", {
      block: "minecraft:polished_blackstone",
      x: 0, y: BOARD_Y, z: 0,
      scale: { x: 4.6, y: 6.6, z: 0.7 },
      translation: { x: -2.3, y: -3.3, z: -0.35 },
    });
    table.block("playfield", {
      block: "minecraft:black_concrete",
      x: 0, y: BOARD_Y, z: -0.39,
      scale: { x: 4.0, y: 5.4, z: 0.08 },
      translation: { x: -2.0, y: -2.7, z: -0.04 },
    });
    table.block("ball", {
      block: "minecraft:sea_lantern",
      x: ballX, y: ballY, z: -0.48,
      scale: 0.26,
      translation: { x: -0.13, y: BOARD_Y - 0.13, z: -0.13 },
    });

    for (const bumper of [
      { id: "ba", x: -0.8, y: 0.45, block: "minecraft:redstone_block" },
      { id: "bb", x: 0.8, y: 0.45, block: "minecraft:gold_block" },
      { id: "bc", x: 0, y: 1.25, block: "minecraft:emerald_block" },
    ]) {
      table.block(bumper.id, {
        block: bumper.block,
        x: bumper.x, y: BOARD_Y + bumper.y, z: -0.46,
        scale: { x: 0.5, y: 0.5, z: 0.18 },
        translation: { x: -0.25, y: -0.25, z: -0.09 },
      });
    }

    table.block("wall_l", {
      block: "minecraft:light_blue_concrete", x: -1.8, y: BOARD_Y, z: -0.46,
      scale: { x: 0.16, y: 4.5, z: 0.18 }, translation: { x: -0.08, y: -2.25, z: -0.09 },
    });
    table.block("wall_r", {
      block: "minecraft:light_blue_concrete", x: 1.8, y: BOARD_Y, z: -0.46,
      scale: { x: 0.16, y: 4.5, z: 0.18 }, translation: { x: -0.08, y: -2.25, z: -0.09 },
    });
    table.block("wall_t", {
      block: "minecraft:light_blue_concrete", x: 0, y: BOARD_Y + 2.2, z: -0.46,
      scale: { x: 3.75, y: 0.16, z: 0.18 }, translation: { x: -1.875, y: -0.08, z: -0.09 },
    });

    for (const [id, ax, ay, bx, by] of [
      ["gl", -1.7, -1.85, -0.9, -1.35],
      ["gr", 1.7, -1.85, 0.9, -1.35],
    ] as const) {
      for (const [index, point] of linePoints(ax, ay, bx, by, 5).entries()) {
        table.block(id + index, {
          block: "minecraft:cyan_concrete",
          x: point.x, y: BOARD_Y + point.y, z: -0.46,
          scale: { x: 0.24, y: 0.18, z: 0.18 },
          translation: { x: -0.12, y: -0.09, z: -0.09 },
        });
      }
    }

    function flipperVisual(prefix: string, pivotX: number, pivotY: number, length: number, restAngle: number, activeAngle: number, active: typeof left) {
      const rest = poseEnd(pivotX, pivotY, length, restAngle);
      const raised = poseEnd(pivotX, pivotY, length, activeAngle);
      const restPoints = linePoints(pivotX, pivotY, rest.x, rest.y, 5);
      const activePoints = linePoints(pivotX, pivotY, raised.x, raised.y, 5);
      game.repeat(5, i => {
        table.block(prefix + "r" + i, {
          block: "minecraft:orange_concrete",
          x: restPoints[i].x, y: BOARD_Y + restPoints[i].y, z: -0.5,
          scale: { x: 0.24, y: 0.18, z: 0.2 }, translation: { x: -0.12, y: -0.09, z: -0.1 },
          when: active.eq(0),
        });
        table.block(prefix + "a" + i, {
          block: "minecraft:yellow_concrete",
          x: activePoints[i].x, y: BOARD_Y + activePoints[i].y, z: -0.5,
          scale: { x: 0.24, y: 0.18, z: 0.2 }, translation: { x: -0.12, y: -0.09, z: -0.1 },
          when: active.eq(1),
        });
      });
    }
    flipperVisual("lf", -0.75, -1.65, 0.9, 18, 58, left);
    flipperVisual("rf", 0.75, -1.65, 0.9, 162, 122, right);

    table.text("title", {
      text: "PORTABLE PINBALL",
      x: 0, y: 7.15, z: -0.5,
      scale: 0.65, billboard: "center",
    });
    table.text("score", {
      text: ["SCORE ", score, "  BALLS ", lives],
      x: 0, y: 6.65, z: -0.5,
      scale: 0.45, billboard: "center",
    });
    table.itemDisplay("badge", {
      item: cabinetItem,
      x: 1.7, y: 6.75, z: -0.55,
      scale: 0.45,
    });

    const controls = table.interaction("controls", {
      x: 0, y: 0.4, z: -0.75,
      width: 2.3, height: 2.0,
    });

    table.tick(() => {
      left.set(0);
      right.set(0);
      game.when(wallLock.gt(0), () => wallLock.sub(1));
      game.when(bumperLock.gt(0), () => bumperLock.sub(1));
      game.when(flipperLock.gt(0), () => flipperLock.sub(1));

      controls.onUse(player => {
        game.when(player.input.sneak.eq(1), () => {
          table.pickUp(player);
        }, () => {
          controls.controller.claim(player);
          playing.set(1);
        });
      });

      controls.controller.forPlayer(player => {
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
                playing.set(0);
              });
            });
          });
          previousJump.set(player.input.jump);
        });
      });
    });
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
