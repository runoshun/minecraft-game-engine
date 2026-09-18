portableDsl({
  fixedPoint: 1000,
  ownership: { minX: 400, minZ: 0, maxX: 448, maxZ: 16 },
}, game => {
  const redPlayers = game.teamPlayers("lab_red");
  const bluePlayers = game.teamPlayers("lab_blue");

  game.camera("red", {
    x: 404, y: 106, z: 12,
    yaw: 180, pitch: 45,
    mode: "position_lock",
    audience: redPlayers,
  });
  game.camera("blue", {
    x: 436, y: 106, z: 12,
    yaw: 180, pitch: 45,
    mode: "position_lock",
    audience: bluePlayers,
  });

  game.tick(() => {
    game.session("red", redPlayers, session => {
      const initialized = session.state("initialized", 0);
      const hits = session.state("hits", 0);
      const sample = session.state("sample", 0);
      const readySeen = session.state("readySeen", 0);
      const count = session.state("count", 0);
      const total = session.state("total", 0);
      const minimum = session.state("minimum", -1);
      const maximum = session.state("maximum", -1);
      const anyReady = session.state("anyReady", 0);
      const allReady = session.state("allReady", 0);
      const map = session.grid("map", { width: 4, height: 4, initial: 0, outside: 0 });
      const run = session.rng("run", { seed: 246813579 });
      const terrain = session.gridWorld("terrain", {
        grid: map,
        originX: 404, y: 100, originZ: 4,
        cellsPerTick: 4,
        palette: [
          { value: 0, block: "minecraft:black_concrete" },
          { value: 1, block: "minecraft:red_concrete" },
        ],
      });

      game.when(initialized.eq(0), () => {
        map.fill(0);
        run.int(sample, 1, 99);
        terrain.rebuild();
        initialized.set(1);
      });
      game.when(terrain.ready.eq(1), () => readySeen.set(1));

      session.forSinglePlayer(player => {
        const previousSharedMove = player.state("previousSharedMove", 0);
        game.when(previousSharedMove.eq(0), () => game.when(player.input.left.eq(1), () => {
          hits.add(1);
          map.set(0, 0, 1);
          run.int(sample, 1, 99);
          terrain.rebuild();
        }));
        previousSharedMove.set(player.input.left);
      });

      session.forEachPlayer(player => {
        const score = player.state("score", 0);
        const ready = player.state("ready", 0);
        const previousScoreMove = player.state("previousScoreMove", 0);
        const previousJump = player.state("previousJump", 0);

        game.when(previousScoreMove.eq(0), () => game.when(player.input.left.eq(1), () => score.add(1)));
        game.when(previousJump.eq(0), () => game.when(player.input.jump.eq(1), () => ready.set(1)));

        previousScoreMove.set(player.input.left);
        previousJump.set(player.input.jump);
        player.hud("red_lab", {
          text: [
            "RED ME ", score, " R ", ready,
            " | H ", hits, " RNG ", sample, " MAP ", readySeen,
            " | N ", count, " SUM ", total,
            " MIN ", minimum, " MAX ", maximum,
            " ANY ", anyReady, " ALL ", allReady,
          ],
        });
      });

      session.reduce.count(count);
      session.reduce.sum(total, player => player.state("score", 0));
      session.reduce.min(minimum, -1, player => player.state("score", 0));
      session.reduce.max(maximum, -1, player => player.state("score", 0));
      session.reduce.any(anyReady, player => player.state("ready", 0).eq(1));
      session.reduce.all(allReady, player => player.state("ready", 0).eq(1));
    });

    game.session("blue", bluePlayers, session => {
      const initialized = session.state("initialized", 0);
      const hits = session.state("hits", 0);
      const sample = session.state("sample", 0);
      const readySeen = session.state("readySeen", 0);
      const count = session.state("count", 0);
      const total = session.state("total", 0);
      const minimum = session.state("minimum", -1);
      const maximum = session.state("maximum", -1);
      const anyReady = session.state("anyReady", 0);
      const allReady = session.state("allReady", 0);
      const map = session.grid("map", { width: 4, height: 4, initial: 0, outside: 0 });
      const run = session.rng("run", { seed: 246813579 });
      const terrain = session.gridWorld("terrain", {
        grid: map,
        originX: 436, y: 100, originZ: 4,
        cellsPerTick: 4,
        palette: [
          { value: 0, block: "minecraft:black_concrete" },
          { value: 1, block: "minecraft:blue_concrete" },
        ],
      });

      game.when(initialized.eq(0), () => {
        map.fill(0);
        run.int(sample, 1, 99);
        terrain.rebuild();
        initialized.set(1);
      });
      game.when(terrain.ready.eq(1), () => readySeen.set(1));

      session.forSinglePlayer(player => {
        const previousSharedMove = player.state("previousSharedMove", 0);
        game.when(previousSharedMove.eq(0), () => game.when(player.input.right.eq(1), () => {
          hits.add(1);
          map.set(0, 0, 1);
          run.int(sample, 1, 99);
          terrain.rebuild();
        }));
        previousSharedMove.set(player.input.right);
      });

      session.forEachPlayer(player => {
        const score = player.state("score", 0);
        const ready = player.state("ready", 0);
        const previousScoreMove = player.state("previousScoreMove", 0);
        const previousJump = player.state("previousJump", 0);

        game.when(previousScoreMove.eq(0), () => game.when(player.input.right.eq(1), () => score.add(2)));
        game.when(previousJump.eq(0), () => game.when(player.input.jump.eq(1), () => ready.set(1)));

        previousScoreMove.set(player.input.right);
        previousJump.set(player.input.jump);
        player.hud("blue_lab", {
          text: [
            "BLUE ME ", score, " R ", ready,
            " | H ", hits, " RNG ", sample, " MAP ", readySeen,
            " | N ", count, " SUM ", total,
            " MIN ", minimum, " MAX ", maximum,
            " ANY ", anyReady, " ALL ", allReady,
          ],
        });
      });

      session.reduce.count(count);
      session.reduce.sum(total, player => player.state("score", 0));
      session.reduce.min(minimum, -1, player => player.state("score", 0));
      session.reduce.max(maximum, -1, player => player.state("score", 0));
      session.reduce.any(anyReady, player => player.state("ready", 0).eq(1));
      session.reduce.all(allReady, player => player.state("ready", 0).eq(1));
    });
  });
});
