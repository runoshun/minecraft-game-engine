export const BRICK_ROWS = 5;
export const BRICK_COLS = 8;
export const BRICK_COUNT = BRICK_ROWS * BRICK_COLS;

const BRICK_COLORS = [
  "minecraft:red_concrete",
  "minecraft:orange_concrete",
  "minecraft:yellow_concrete",
  "minecraft:lime_concrete",
  "minecraft:light_blue_concrete",
];

export function createBricks(game, boardX, boardY, boardZ) {
  return game.repeat(BRICK_COUNT, index => {
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
      x: boardX + x,
      y: boardY + y,
      z: boardZ - 0.05,
      scale: { x: 1.35, y: 0.55, z: 0.3 },
      translation: { x: -0.675, y: -0.275, z: -0.15 },
      when: alive.eq(1),
    });

    return { alive, collider, points: BRICK_ROWS - row };
  });
}
