portableDsl({
  fixedPoint: 1000,
  ownership: { minX: 320, minZ: 0, maxX: 368, maxZ: 16 },
}, game => {
  const redPlayers = game.teamPlayers("v15_red");
  const bluePlayers = game.teamPlayers("v15_blue");

  game.camera("red", {
    x: 328, y: 140, z: 8,
    yaw: 0, pitch: 15,
    mode: "position_lock",
    audience: redPlayers,
  });
  game.camera("blue", {
    x: 360, y: 140, z: 8,
    yaw: 180, pitch: 15,
    mode: "position_lock",
    audience: bluePlayers,
  });

  game.tick(() => {
    game.session("red", redPlayers, session => {
      const initialized = session.state("initialized", 0);
      const score = session.state("score", 0);
      const cell = session.state("cell", 0);
      const sample = session.state("sample", 0);
      const map = session.grid("map", { width: 4, height: 4, initial: 0, outside: -1 });
      const run = session.rng("run", { seed: 246813579 });

      game.when(initialized.eq(0), () => {
        run.int(sample, 1, 99);
        initialized.set(1);
      });

      session.forSinglePlayer(player => {
        const previous = player.state("previous", 0);
        game.when(previous.eq(0), () => {
          game.when(player.input.left.eq(1), () => {
            score.add(1);
            map.set(0, 0, score);
            map.get(0, 0, cell);
            run.int(sample, 1, 99);
          });
        });
        previous.set(player.input.left);
        player.hud("red_session", { text: ["RED S ", score, " C ", cell, " R ", sample] });
      });
    });

    game.session("blue", bluePlayers, session => {
      const initialized = session.state("initialized", 0);
      const score = session.state("score", 0);
      const cell = session.state("cell", 0);
      const sample = session.state("sample", 0);
      const map = session.grid("map", { width: 4, height: 4, initial: 0, outside: -1 });
      const run = session.rng("run", { seed: 246813579 });

      game.when(initialized.eq(0), () => {
        run.int(sample, 1, 99);
        initialized.set(1);
      });

      session.forSinglePlayer(player => {
        const previous = player.state("previous", 0);
        game.when(previous.eq(0), () => {
          game.when(player.input.right.eq(1), () => {
            score.add(1);
            map.set(0, 0, score);
            map.get(0, 0, cell);
            run.int(sample, 1, 99);
          });
        });
        previous.set(player.input.right);
        player.hud("blue_session", { text: ["BLUE S ", score, " C ", cell, " R ", sample] });
      });
    });
  });
});
