portableDsl({ fixedPoint: 1000 }, game => {
  const party = game.teamPlayers("v21_party");

  const purchase = game.confirmation("purchase", {
    title: [
      { text: "Arcane ", color: "aqua" },
      { text: "Purchase", color: "gold", bold: true },
    ],
    body: [
      {
        type: "text",
        text: [
          { text: "Confirm the ", color: "gray" },
          { text: "Hero Blade", color: "yellow", bold: true },
          { text: " purchase.", color: "gray" },
        ],
        width: 300,
      },
      {
        type: "item",
        item: "minecraft:diamond_sword",
        count: 1,
        description: { text: "12 Gold", color: "gold" },
        showTooltip: true,
        showDecoration: true,
        width: 32,
        height: 32,
      },
    ],
    yes: { label: { text: "Buy", color: "green", bold: true }, tooltip: "Result 10", value: 10 },
    no: { label: { text: "Leave", color: "red" }, tooltip: "Result -10", value: -10 },
  });

  const hints = game.form("hints", {
    title: { text: "Hints", color: "aqua", bold: true },
    body: [{ type: "text", text: "Enable tutorial hints?", width: 260 }],
    input: { type: "boolean", label: "Hints enabled", initial: true, trueValue: 1, falseValue: 0 },
    submit: { label: { text: "Apply", color: "green" } },
    cancel: { label: "Skip", tooltip: { text: "Return -1", italic: true }, value: -1 },
  });

  const role = game.form("role", {
    title: { text: "Choose Class", color: "light_purple", bold: true },
    input: {
      type: "option",
      label: "Class",
      options: [
        { label: { text: "Mage", color: "aqua" }, value: 3 },
        { label: { text: "Warrior", color: "red" }, value: 7 },
      ],
      initial: 3,
      width: 240,
    },
    cancel: { value: -1 },
  });

  const amount = game.form("amount", {
    title: { text: "Quantity", color: "yellow", bold: true },
    input: { type: "range", label: "Amount", start: 1, end: 9, step: 2, initial: 3, width: 260 },
    submit: { label: "Confirm amount" },
    cancel: { value: -1 },
  });

  game.tick(() => {
    game.forEachPlayer(party, player => {
      const confirmation = player.selection(purchase);
      const hintChoice = player.form(hints);
      const roleChoice = player.form(role);
      const amountChoice = player.form(amount);

      const stage = player.state("stage", 0);
      const armed = player.state("armed", 0);
      const confirmationResult = player.state("confirmationResult", 0);
      const booleanResult = player.state("booleanResult", 0);
      const optionResult = player.state("optionResult", 0);
      const rangeResult = player.state("rangeResult", 0);
      const cancelCount = player.state("cancelCount", 0);
      const previousJump = player.state("previousJump", 0);

      // Jump arms exactly one surface after the real-client harness has finished
      // its gamemode setup. While armed, open() is intentionally level-triggered.
      game.when(previousJump.eq(0), () => game.when(player.input.jump.eq(1), () => {
        game.when(stage.eq(4), () => {
          stage.set(0);
          confirmationResult.set(0);
          booleanResult.set(0);
          optionResult.set(0);
          rangeResult.set(0);
        });
        game.when(stage.eq(0), () => armed.set(1));
        game.when(stage.eq(1), () => armed.set(1));
        game.when(stage.eq(2), () => armed.set(1));
        game.when(stage.eq(3), () => armed.set(1));
      }));

      game.when(armed.eq(1), () => game.when(stage.eq(0), () => confirmation.open()));
      game.when(confirmation.eq(10), () => {
        confirmationResult.set(10);
        stage.set(1);
        armed.set(0);
        confirmation.clear();
      });
      game.when(confirmation.eq(-10), () => {
        confirmationResult.set(-10);
        stage.set(1);
        armed.set(0);
        confirmation.clear();
      });

      game.when(armed.eq(1), () => game.when(stage.eq(1), () => hintChoice.open()));
      game.when(hintChoice.eq(1), () => {
        booleanResult.set(1);
        stage.set(2);
        armed.set(0);
        hintChoice.clear();
      });
      game.when(hintChoice.eq(0), () => {
        booleanResult.set(0);
        stage.set(2);
        armed.set(0);
        hintChoice.clear();
      });
      game.when(hintChoice.eq(-1), () => {
        booleanResult.set(-1);
        cancelCount.add(1);
        stage.set(2);
        armed.set(0);
        hintChoice.clear();
      });

      game.when(armed.eq(1), () => game.when(stage.eq(2), () => roleChoice.open()));
      game.when(roleChoice.eq(3), () => {
        optionResult.set(3);
        stage.set(3);
        armed.set(0);
        roleChoice.clear();
      });
      game.when(roleChoice.eq(7), () => {
        optionResult.set(7);
        stage.set(3);
        armed.set(0);
        roleChoice.clear();
      });
      game.when(roleChoice.eq(-1), () => {
        optionResult.set(-1);
        cancelCount.add(1);
        stage.set(3);
        armed.set(0);
        roleChoice.clear();
      });

      game.when(armed.eq(1), () => game.when(stage.eq(3), () => amountChoice.open()));
      for (const value of [1, 3, 5, 7, 9]) {
        game.when(amountChoice.eq(value), () => {
          rangeResult.set(value);
          stage.set(4);
          armed.set(0);
          amountChoice.clear();
        });
      }
      game.when(amountChoice.eq(-1), () => {
        rangeResult.set(-1);
        cancelCount.add(1);
        stage.set(4);
        armed.set(0);
        amountChoice.clear();
      });

      previousJump.set(player.input.jump);
      player.hud("dialog", {
        text: [
          "STAGE ", stage,
          " ARM ", armed,
          " CONF ", confirmationResult,
          " BOOL ", booleanResult,
          " OPT ", optionResult,
          " RANGE ", rangeResult,
          " CANCEL ", cancelCount,
        ],
      });
    });
  });
});
