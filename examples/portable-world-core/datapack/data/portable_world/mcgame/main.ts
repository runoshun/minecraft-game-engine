portableDsl({ fixedPoint: 1000, ownership: { minX: 176, minZ: -12, maxX: 192, maxZ: 8 } }, game => {
  const ready = game.state("ready", 1);
  const left = game.input("left", 0, { source: "first_player_left" });
  const right = game.input("right", 0, { source: "first_player_right" });
  const reset = game.input("reset", 0, { source: "first_player_jump" });

  const base: Array<{ x: number; y: number; z: number; block: string }> = [];
  for (let z = 0; z <= 4; z++) {
    for (let x = 180; x <= 184; x++) {
      base.push({ x, y: 89, z, block: "minecraft:black_concrete" });
      if (z >= 1 && z <= 3) base.push({ x, y: 90, z, block: "minecraft:white_concrete" });
    }
  }
  game.worldBatch("base", { blocks: base });

  game.worldFill("paint_left", {
    fromX: 180, fromY: 90, fromZ: 1,
    toX: 181, toY: 90, toZ: 3,
    block: "minecraft:red_concrete",
    when: left.eq(1),
  });
  game.worldFill("paint_right", {
    fromX: 183, fromY: 90, fromZ: 1,
    toX: 184, toY: 90, toZ: 3,
    block: "minecraft:lime_concrete",
    when: right.eq(1),
  });
  game.worldFill("reset", {
    fromX: 180, fromY: 90, fromZ: 1,
    toX: 184, toY: 90, toZ: 3,
    block: "minecraft:white_concrete",
    when: reset.eq(1),
  });

  game.text("title", {
    text: "PORTABLE WORLD V8",
    x: 182, y: 93, z: 4.5,
    scale: 0.8,
    billboard: "center",
  });
  game.camera("main", { x: 182, y: 95.5, z: -9, yaw: 0, pitch: 22 });
  game.hud("main", { text: ["A RED   D GREEN   SPACE RESET   READY ", ready] });

  game.tick(() => {});
});
