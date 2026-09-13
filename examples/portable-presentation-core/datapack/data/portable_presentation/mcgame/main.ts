portableDsl({ fixedPoint: 1000, ownership: { minX: 132, minZ: -16, maxX: 148, maxZ: 4 } }, game => {
  const heroX = game.state("heroX", -2);
  const heroYaw = game.state("heroYaw", 0);
  const zombieVisible = game.state("zombieVisible", 1);

  const left = game.input("left", 0, { source: "first_player_left" });
  const right = game.input("right", 0, { source: "first_player_right" });
  const jump = game.input("jump", 0, { source: "first_player_jump" });

  game.camera("main", { x: 140, y: 104, z: -13, yaw: 0, pitch: 0 });

  game.block("backdrop", {
    block: "minecraft:black_concrete",
    x: 136,
    y: 98.8,
    z: 1,
    scale: { x: 8, y: 5, z: 0.2 },
  });

  game.actor("hero", {
    x: game.at(heroX, 140),
    y: 100,
    z: 0,
    yaw: heroYaw,
  });

  game.actor("zombie", {
    entityType: "minecraft:zombie",
    x: 140,
    y: 100,
    z: 0,
    yaw: 180,
    when: zombieVisible.eq(1),
  });

  game.actor("skeleton", {
    entityType: "minecraft:skeleton",
    x: 142,
    y: 100,
    z: 0,
    yaw: 180,
  });

  game.text("title", {
    text: "PORTABLE ACTORS",
    x: 140,
    y: 104.2,
    z: 0.2,
    scale: 0.8,
    billboard: "center",
  });
  game.text("hero_label", {
    text: ["HERO YAW ", heroYaw],
    x: game.at(heroX, 140),
    y: 102.3,
    z: 0,
    scale: 0.45,
    billboard: "center",
  });
  game.text("zombie_label", {
    text: "ZOMBIE",
    x: 140,
    y: 102.3,
    z: 0,
    scale: 0.45,
    billboard: "center",
    when: zombieVisible.eq(1),
  });
  game.text("skeleton_label", {
    text: "SKELETON",
    x: 142,
    y: 102.3,
    z: 0,
    scale: 0.45,
    billboard: "center",
  });

  game.hud("main", { text: ["A/D MOVE  SPACE HIDE ZOMBIE  X ", heroX] });

  game.tick(() => {
    game.when(left.eq(1), () => {
      heroX.sub(0.08);
      heroYaw.set(90);
    });
    game.when(right.eq(1), () => {
      heroX.add(0.08);
      heroYaw.set(-90);
    });
    game.when(heroX.lt(-3.2), () => heroX.set(-3.2));
    game.when(heroX.gt(3.2), () => heroX.set(3.2));
    game.when(jump.eq(1), () => zombieVisible.set(0), () => zombieVisible.set(1));
  });
});
