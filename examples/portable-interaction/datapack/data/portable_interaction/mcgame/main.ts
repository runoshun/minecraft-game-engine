portableDsl({ fixedPoint: 1000, ownership: { minX: 688, minZ: 688, maxX: 704, maxZ: 704 } }, game => {
  const totalUses = game.state("totalUses", 0);
  const enabled = game.state("enabled", 1);

  const cabinet = game.interaction("cabinet", {
    x: 700.5,
    y: 100,
    z: 700.2,
    width: 1.8,
    height: 2.2,
    response: true,
    when: enabled.eq(1),
  });

  game.block("cabinet", {
    block: "minecraft:polished_blackstone",
    x: 700.5,
    y: 100,
    z: 700.8,
    scale: { x: 2.2, y: 2.4, z: 0.5 },
    translation: { x: -1.1, y: 0, z: -0.25 },
  });
  game.block("screen", {
    block: "minecraft:sea_lantern",
    x: 700.5,
    y: 101.15,
    z: 700.48,
    scale: { x: 1.5, y: 0.75, z: 0.08 },
    translation: { x: -0.75, y: -0.375, z: -0.04 },
  });
  game.text("label", {
    text: ["USE CABINET  •  TOTAL ", totalUses],
    x: 700.5,
    y: 102.65,
    z: 700.0,
    scale: 0.8,
    billboard: "center",
  });

  game.tick(() => {
    cabinet.onUse(player => {
      const personalUses = player.state("cabinetUses", 0);
      totalUses.add(1);
      personalUses.add(1);
    });
  });
});
