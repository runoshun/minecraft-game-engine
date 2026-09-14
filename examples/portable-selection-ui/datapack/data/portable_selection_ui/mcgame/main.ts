portableDsl({ fixedPoint: 1000 }, game => {
  const party = game.teamPlayers("v20_party");
  const menu = game.selection("shop", {
    title: "Portable Shop",
    body: "Choose one option. Escape uses the cancel result.",
    columns: 1,
    options: [
      { label: "Potion", tooltip: "Select result 1", value: 1 },
      { label: "Sword", tooltip: "Select result 2", value: 2 },
    ],
    cancel: { label: "Cancel", value: -1 },
  });

  game.tick(() => {
    game.forEachPlayer(party, player => {
      const choice = player.selection(menu);
      const enabled = player.state("menuEnabled", 1);
      const lastChoice = player.state("lastChoice", 0);
      const previousJump = player.state("previousJump", 0);

      // Intentionally level-triggered while enabled. v20 open() must be idempotent
      // while the dialog is pending rather than resetting it every tick.
      game.when(enabled.eq(1), () => choice.open());

      game.when(choice.eq(1), () => {
        lastChoice.set(1);
        enabled.set(0);
        choice.clear();
      });
      game.when(choice.eq(2), () => {
        lastChoice.set(2);
        enabled.set(0);
        choice.clear();
      });
      game.when(choice.eq(-1), () => {
        lastChoice.set(-1);
        enabled.set(0);
        choice.clear();
      });

      game.when(previousJump.eq(0), () => game.when(player.input.jump.eq(1), () => enabled.set(1)));
      previousJump.set(player.input.jump);
      player.hud("selection", { text: ["LAST ", lastChoice, " ENABLED ", enabled] });
    });
  });
});
