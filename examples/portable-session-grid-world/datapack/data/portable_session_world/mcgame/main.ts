portableDsl({
  fixedPoint: 1000,
  ownership: { minX: 400, minZ: 0, maxX: 448, maxZ: 16 },
}, game => {
  const redPlayers = game.teamPlayers("v16_red");
  const bluePlayers = game.teamPlayers("v16_blue");

  game.tick(() => {
    game.session("red", redPlayers, session => {
      const initialized = session.state("initialized", 0);
      const hits = session.state("hits", 0);
      const readySeen = session.state("readySeen", 0);
      const map = session.grid("map", { width: 4, height: 4, initial: 0, outside: 0 });
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
        terrain.rebuild();
        initialized.set(1);
      });
      game.when(terrain.ready.eq(1), () => readySeen.set(1));

      session.forSinglePlayer(player => {
        const previous = player.state("previous", 0);
        game.when(previous.eq(0), () => {
          game.when(player.input.left.eq(1), () => {
            map.set(0, 0, 1);
            hits.add(1);
            terrain.rebuild();
          });
        });
        previous.set(player.input.left);
        player.hud("red_world", { text: ["RED H ", hits, " READY ", readySeen] });
      });
    });

    game.session("blue", bluePlayers, session => {
      const initialized = session.state("initialized", 0);
      const hits = session.state("hits", 0);
      const readySeen = session.state("readySeen", 0);
      const map = session.grid("map", { width: 4, height: 4, initial: 0, outside: 0 });
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
        terrain.rebuild();
        initialized.set(1);
      });
      game.when(terrain.ready.eq(1), () => readySeen.set(1));

      session.forSinglePlayer(player => {
        const previous = player.state("previous", 0);
        game.when(previous.eq(0), () => {
          game.when(player.input.right.eq(1), () => {
            map.set(0, 0, 1);
            hits.add(1);
            terrain.rebuild();
          });
        });
        previous.set(player.input.right);
        player.hud("blue_world", { text: ["BLUE H ", hits, " READY ", readySeen] });
      });
    });
  });
});
