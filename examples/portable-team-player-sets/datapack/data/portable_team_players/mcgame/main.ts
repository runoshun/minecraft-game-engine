portableDsl({
  fixedPoint: 1000,
  ownership: { minX: 240, minZ: 0, maxX: 288, maxZ: 16 },
}, game => {
  const redHits = game.state("redHits", 0);
  const blueHits = game.state("blueHits", 0);
  const red = game.teamPlayers("v14_red");
  const blue = game.teamPlayers("v14_blue");

  game.camera("red", {
    x: 248,
    y: 140,
    z: 8,
    yaw: 0,
    pitch: 15,
    mode: "position_lock",
    audience: red,
  });
  game.camera("blue", {
    x: 280,
    y: 140,
    z: 8,
    yaw: 180,
    pitch: 15,
    mode: "position_lock",
    audience: blue,
  });

  game.tick(() => {
    game.forEachPlayer(red, player => {
      const meter = player.state("meter", 0);
      game.when(player.input.left.eq(1), () => meter.sub(1));
      player.hud("red_status", { text: ["RED  METER ", meter, "  HIT ", redHits] });
    });

    game.forEachPlayer(blue, player => {
      const meter = player.state("meter", 0);
      game.when(player.input.right.eq(1), () => meter.add(1));
      player.hud("blue_status", { text: ["BLUE  METER ", meter, "  HIT ", blueHits] });
    });

    game.forSinglePlayer(red, player => {
      const previous = player.state("redPrev", 0);
      game.when(previous.eq(0), () => {
        game.when(player.input.left.eq(1), () => redHits.add(1));
      });
      previous.set(player.input.left);
    });

    game.forSinglePlayer(blue, player => {
      const previous = player.state("bluePrev", 0);
      game.when(previous.eq(0), () => {
        game.when(player.input.right.eq(1), () => blueHits.add(1));
      });
      previous.set(player.input.right);
    });
  });
});
