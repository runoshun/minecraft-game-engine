portable.define({
  version: 1,
  fixedPoint: 1000,
  state: {
    x: 0,
    vx: 0.35,
  },
  tick: [
    { op: "add", target: "x", value: { state: "vx" } },
    {
      op: "if",
      condition: { op: "gte", left: { state: "x" }, right: 3 },
      then: [
        { op: "set", target: "x", value: 3 },
        { op: "negate", target: "vx" },
      ],
    },
    {
      op: "if",
      condition: { op: "lte", left: { state: "x" }, right: -3 },
      then: [
        { op: "set", target: "x", value: -3 },
        { op: "negate", target: "vx" },
      ],
    },
  ],
});

game.onTick(({ tick }) => {
  if (tick % 20 === 0) {
    game.log("PORTABLE_BOUNCE", portable.get("x"), portable.get("vx"));
  }
});
