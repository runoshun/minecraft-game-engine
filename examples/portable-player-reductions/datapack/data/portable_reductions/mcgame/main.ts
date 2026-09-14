portableDsl({ fixedPoint: 1000 }, game => {
  const partyPlayers = game.teamPlayers("v17_party");

  game.tick(() => {
    game.session("party", partyPlayers, session => {
      const count = session.state("count", 0);
      const total = session.state("total", 0);
      const minimum = session.state("minimum", -1);
      const maximum = session.state("maximum", -1);
      const anyReady = session.state("anyReady", 0);
      const allReady = session.state("allReady", 0);

      session.forEachPlayer(player => {
        const score = player.state("score", 0);
        const ready = player.state("ready", 0);
        const previousLeft = player.state("previousLeft", 0);
        const previousRight = player.state("previousRight", 0);
        const previousJump = player.state("previousJump", 0);

        game.when(player.input.left.eq(1), () => {
          game.when(previousLeft.eq(0), () => score.add(1));
        });
        game.when(player.input.right.eq(1), () => {
          game.when(previousRight.eq(0), () => score.add(2));
        });
        game.when(player.input.jump.eq(1), () => {
          game.when(previousJump.eq(0), () => ready.set(1));
        });

        previousLeft.set(player.input.left);
        previousRight.set(player.input.right);
        previousJump.set(player.input.jump);

        player.hud("party_status", {
          text: [
            "ME ", score, " R ", ready,
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
