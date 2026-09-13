portableDsl({
  fixedPoint: 1000,
  ownership: { minX: 232, minZ: -8, maxX: 248, maxZ: 8 },
}, game => {
  const round = game.state("round", 1);
  const players = game.players();

  game.camera("main", {
    x: 240,
    y: 100,
    z: 0,
    yaw: 180,
    pitch: 15,
    mode: "position_lock",
    audience: players,
  });

  game.tick(() => {
    game.forEachPlayer(players, player => {
      const meter = player.state("meter", 0);
      const jumpPrev = player.state("jumpPrev", 0);
      const jumpPresses = player.state("jumpPresses", 0);

      game.when(player.input.left.eq(1), () => meter.sub(1));
      game.when(player.input.right.eq(1), () => meter.add(1));
      game.when(player.input.jump.eq(1), () => {
        game.when(jumpPrev.eq(0), () => jumpPresses.add(1));
      });
      jumpPrev.set(player.input.jump);

      player.hud("status", {
        text: ["METER ", meter, "  JUMP ", jumpPresses, "  ROUND ", round],
      });
    });
  });
});
