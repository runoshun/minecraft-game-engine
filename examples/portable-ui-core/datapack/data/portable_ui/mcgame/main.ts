portableDsl({ fixedPoint: 1000 }, game => {
  const ready = game.state("ready", 1);
  const selection = game.state("selection", 0);
  const confirms = game.state("confirms", 0);
  const jumpPrev = game.state("jump_prev", 0);

  const up = game.input("up", 0, { source: "first_player_forward" });
  const down = game.input("down", 0, { source: "first_player_backward" });
  const jump = game.input("jump", 0, { source: "first_player_jump" });

  game.sidebar("main", {
    title: "PORTABLE UI V9",
    rows: [
      { id: "selection", text: ["SELECT ", selection] },
      { id: "confirms", text: ["CONFIRMS ", confirms] },
      { id: "input", text: ["JUMP HELD ", jump] },
      { id: "controls", text: "W/S SELECT   SPACE CONFIRM" },
    ],
  });

  game.hud("status", { text: ["UI READY ", ready, "  SELECT ", selection] });

  game.tick(() => {
    game.when(up.eq(1), () => selection.set(0));
    game.when(down.eq(1), () => selection.set(1));
    game.when(jump.eq(1), () => {
      game.when(jumpPrev.eq(0), () => confirms.add(1));
    });
    jumpPrev.set(jump);
  });
});
