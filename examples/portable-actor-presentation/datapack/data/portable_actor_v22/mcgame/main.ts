portableDsl({
  fixedPoint: 1000,
  ownership: { minX: 616, minZ: 584, maxX: 640, maxZ: 608 },
}, game => {
  const heroYaw = game.state("heroYaw", 180);
  const heroPitch = game.state("heroPitch", 0);
  const players = game.players();

  game.camera("main", {
    x: 628,
    y: 102,
    z: 593,
    yaw: 0,
    pitch: 4,
    mode: "position_lock",
    audience: players,
  });

  game.actor("hero", {
    x: 628,
    y: 100,
    z: 600,
    yaw: heroYaw,
    pitch: heroPitch,
    profile: {
      texture: "minecraft:entity/player/slim/alex",
      model: "slim",
    },
    hiddenLayers: ["cape", "hat"],
    pose: "crouching",
    mainHand: "left",
    equipment: {
      chest: "minecraft:diamond_chestplate",
      feet: "minecraft:diamond_boots",
      mainhand: "minecraft:diamond_sword",
      offhand: "minecraft:shield",
    },
  });

  game.actor("guard", {
    x: 624.5,
    y: 100,
    z: 601,
    yaw: 160,
    profile: {
      texture: "minecraft:entity/player/wide/steve",
      model: "wide",
    },
    pose: "standing",
    mainHand: "right",
    equipment: {
      head: "minecraft:iron_helmet",
      chest: "minecraft:iron_chestplate",
      legs: "minecraft:iron_leggings",
      feet: "minecraft:iron_boots",
      mainhand: "minecraft:iron_sword",
    },
  });

  game.actor("zombie_scout", {
    entityType: "minecraft:zombie",
    x: 631.5,
    y: 100,
    z: 601,
    yaw: 200,
    pose: "crouching",
    equipment: {
      chest: "minecraft:leather_chestplate",
      mainhand: "minecraft:iron_axe",
    },
  });

  game.text("title", {
    text: "PORTABLE ACTOR V22",
    x: 628,
    y: 104,
    z: 600,
    scale: 0.65,
    billboard: "center",
  });

  game.text("hero_label", {
    text: ["ALEX  YAW ", heroYaw, "  PITCH ", heroPitch],
    x: 628,
    y: 102.5,
    z: 600,
    scale: 0.34,
    billboard: "center",
  });

  game.tick(() => {
    game.forSinglePlayer(players, player => {
      game.when(player.input.left.eq(1), () => heroYaw.add(2));
      game.when(player.input.right.eq(1), () => heroYaw.sub(2));
      game.when(player.input.jump.eq(1), () => heroPitch.set(-20));
      game.when(player.input.sneak.eq(1), () => heroPitch.set(15));
      player.hud("actor_v22", {
        text: ["A/D TURN  SPACE -20  SHIFT +15  YAW ", heroYaw, " PITCH ", heroPitch],
      });
    });
  });
});
