portableDsl({ fixedPoint: 1000 }, game => {
  const party = game.teamPlayers("v18_party");
  const campaign = game.persistentState("campaign", 10, { schema: 1, onSchemaMismatch: "reset" });
  const legacy = game.persistentState("legacy", 5, { schema: 1, onSchemaMismatch: "preserve" });

  game.tick(() => {
    game.forSinglePlayer(party, player => {
      const previousLeft = player.state("previousLeft", 0);
      game.when(previousLeft.eq(0), () => game.when(player.input.left.eq(1), () => {
        campaign.add(1);
        legacy.add(10);
      }));
      previousLeft.set(player.input.left);
    });

    game.session("party", party, session => {
      const wins = session.persistentState("wins", 3, { schema: 1, onSchemaMismatch: "reset" });
      session.forSinglePlayer(player => {
        const previousRight = player.state("previousRight", 0);
        game.when(previousRight.eq(0), () => game.when(player.input.right.eq(1), () => wins.add(1)));
        previousRight.set(player.input.right);
        player.hud("persistent", { text: ["C ", campaign, " L ", legacy, " W ", wins] });
      });
    });
  });
});
