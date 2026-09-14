portableDsl({ fixedPoint: 1000 }, game => {
  const party = game.teamPlayers("v19_party");
  const worldCell = game.state("worldCell", 0);
  const worldOutside = game.state("worldOutside", 0);
  const world = game.persistentGrid("world", {
    width: 4,
    height: 3,
    initial: 0,
    outside: -1,
    schema: 1,
    onSchemaMismatch: "reset",
  });

  game.tick(() => {
    game.forSinglePlayer(party, player => {
      const previousLeft = player.state("previousLeft", 0);
      game.when(previousLeft.eq(0), () => game.when(player.input.left.eq(1), () => {
        world.set(1, 1, 7);
      }));
      previousLeft.set(player.input.left);
    });

    world.get(1, 1, worldCell);
    world.get(-1, 0, worldOutside);

    game.session("party", party, session => {
      const stashCell = session.state("stashCell", 0);
      const stash = session.persistentGrid("stash", {
        width: 2,
        height: 2,
        initial: 5,
        outside: -2,
        schema: 1,
        onSchemaMismatch: "preserve",
      });

      session.forSinglePlayer(player => {
        const previousRight = player.state("previousRight", 0);
        game.when(previousRight.eq(0), () => game.when(player.input.right.eq(1), () => {
          stash.set(0, 0, 9);
        }));
        previousRight.set(player.input.right);
        stash.get(0, 0, stashCell);
        player.hud("persistent_grid", { text: ["WORLD ", worldCell, " OUT ", worldOutside, " STASH ", stashCell] });
      });
    });
  });
});
