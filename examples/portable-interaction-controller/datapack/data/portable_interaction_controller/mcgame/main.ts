portableDsl({
  fixedPoint: 1000,
  ownership: {
    dimension: "minecraft:overworld",
    minX: 736,
    minZ: 736,
    maxX: 744,
    maxZ: 744,
  },
}, game => {
  const claims = game.state("claims", 0);
  const controlUses = game.state("controlUses", 0);

  game.block("cabinet", {
    block: "minecraft:polished_blackstone",
    x: 740.5,
    y: 100,
    z: 740.8,
    scale: { x: 2.2, y: 2.4, z: 0.5 },
    translation: { x: -1.1, y: 0, z: -0.25 },
  });
  game.block("screen", {
    block: "minecraft:sea_lantern",
    x: 740.5,
    y: 101.15,
    z: 740.48,
    scale: { x: 1.5, y: 0.75, z: 0.08 },
    translation: { x: -0.75, y: -0.375, z: -0.04 },
  });
  game.text("label", {
    text: ["RIGHT CLICK TO CLAIM  •  CLAIMS ", claims, "  USES ", controlUses],
    x: 740.5,
    y: 102.65,
    z: 740,
    scale: 0.7,
    billboard: "center",
  });

  const cabinet = game.interaction("cabinet", {
    x: 740.5,
    y: 100,
    z: 740.2,
    width: 1.8,
    height: 2.2,
  });

  game.tick(() => {
    cabinet.onUse(player => {
      const personalClaims = player.state("personalClaims", 0);
      cabinet.controller.claim(player);
      claims.add(1);
      personalClaims.add(1);
    });

    cabinet.controller.forPlayer(player => {
      const controllerTicks = player.state("controllerTicks", 0);
      const personalUses = player.state("personalUses", 0);
      controllerTicks.add(1);
      game.when(player.input.jump.eq(1), () => {
        controlUses.add(1);
        personalUses.add(1);
      });
    });
  });
});
