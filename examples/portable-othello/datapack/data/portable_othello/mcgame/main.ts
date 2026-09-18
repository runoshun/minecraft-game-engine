portableDsl({
  fixedPoint: 1000,
  ownership: {
    dimension: "minecraft:overworld",
    minX: 816,
    minZ: 816,
    maxX: 832,
    maxZ: 832,
  },
}, game => {
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const DRAW = 3;
  const OUTSIDE = -1;

  const WAITING = 0;
  const PLAYING = 1;
  const CHECKING = 2;
  const FINISHED = 3;

  const BOARD_X = 820;
  const BOARD_Y = 64;
  const BOARD_Z = 820;

  const players = game.players();
  const board = game.grid("board", { width: 8, height: 8, initial: EMPTY, outside: OUTSIDE });

  const boardBase: Array<{ x: number; y: number; z: number; block: string }> = [];
  for (let z = 0; z < 8; z++) {
    for (let x = 0; x < 8; x++) {
      boardBase.push({ x: BOARD_X + x, y: BOARD_Y, z: BOARD_Z + z, block: "minecraft:green_concrete" });
    }
  }
  for (let x = BOARD_X - 1; x <= BOARD_X + 8; x++) {
    boardBase.push({ x, y: BOARD_Y, z: BOARD_Z - 1, block: "minecraft:dark_oak_planks" });
    boardBase.push({ x, y: BOARD_Y, z: BOARD_Z + 8, block: "minecraft:dark_oak_planks" });
  }
  for (let z = BOARD_Z; z < BOARD_Z + 8; z++) {
    boardBase.push({ x: BOARD_X - 1, y: BOARD_Y, z, block: "minecraft:dark_oak_planks" });
    boardBase.push({ x: BOARD_X + 8, y: BOARD_Y, z, block: "minecraft:dark_oak_planks" });
  }
  game.worldBatch("board_base", { blocks: boardBase });

  const boardWorld = game.gridWorld("board_world", {
    grid: board,
    dimension: "minecraft:overworld",
    originX: BOARD_X,
    y: BOARD_Y + 1,
    originZ: BOARD_Z,
    palette: [
      { value: EMPTY, block: "minecraft:air" },
      { value: BLACK, block: "minecraft:polished_blackstone_pressure_plate" },
      { value: WHITE, block: "minecraft:heavy_weighted_pressure_plate" },
    ],
    cellsPerTick: 64,
  });

  for (let i = 0; i <= 8; i++) {
    game.block(`grid_v_${i}`, {
      block: "minecraft:black_concrete",
      x: BOARD_X + i - 0.025,
      y: BOARD_Y + 1.07,
      z: BOARD_Z,
      scale: { x: 0.05, y: 0.02, z: 8 },
    });
    game.block(`grid_h_${i}`, {
      block: "minecraft:black_concrete",
      x: BOARD_X,
      y: BOARD_Y + 1.07,
      z: BOARD_Z + i - 0.025,
      scale: { x: 8, y: 0.02, z: 0.05 },
    });
  }

  const initialized = game.state("initialized", 0);
  const phase = game.state("phase", WAITING);
  const turn = game.state("turn", BLACK);
  const winner = game.state("winner", EMPTY);
  const blackScore = game.state("blackScore", 2);
  const whiteScore = game.state("whiteScore", 2);
  const blackPresent = game.state("blackPresent", 0);
  const whitePresent = game.state("whitePresent", 0);
  const consecutivePasses = game.state("consecutivePasses", 0);

  const requestLock = game.state("requestLock", 0);
  const requestX = game.state("requestX", 0);
  const requestZ = game.state("requestZ", 0);
  const requestColor = game.state("requestColor", BLACK);

  const SCAN_NONE = 0;
  const SCAN_MOVE = 1;
  const SCAN_LEGAL = 2;
  const scanMode = game.state("scanMode", SCAN_NONE);
  const scanOriginX = game.state("scanOriginX", 0);
  const scanOriginZ = game.state("scanOriginZ", 0);
  const scanOwn = game.state("scanOwn", BLACK);

  const probe = game.state("probe", EMPTY);
  const opponent = game.state("opponent", WHITE);
  const candidateValid = game.state("candidateValid", 0);
  const scanX = game.state("scanX", 0);
  const scanZ = game.state("scanZ", 0);
  const scanActive = game.state("scanActive", 0);
  const captured = game.state("captured", 0);
  const directionValid = game.state("directionValid", 0);
  const flippedTotal = game.state("flippedTotal", 0);
  const flipX = game.state("flipX", 0);
  const flipZ = game.state("flipZ", 0);
  const flipRemaining = game.state("flipRemaining", 0);

  const checkX = game.state("checkX", 0);
  const checkZ = game.state("checkZ", 0);
  const checkIndex = game.state("checkIndex", 0);
  const moveFx = game.state("moveFx", 0);
  const invalidFx = game.state("invalidFx", 0);
  const passNotice = game.state("passNotice", 0);

  const directions = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],             [1, 0],
    [-1, 1],  [0, 1],   [1, 1],
  ] as const;

  function switchTurn() {
    game.match(turn, [
      [BLACK, () => turn.set(WHITE)],
      [WHITE, () => turn.set(BLACK)],
    ]);
  }

  function resetLegalityScan() {
    checkX.set(0);
    checkZ.set(0);
    checkIndex.set(0);
  }

  function finishGame() {
    phase.set(FINISHED);
    game.choose([
      { when: blackScore.gt(whiteScore), then: () => winner.set(BLACK) },
      { when: whiteScore.gt(blackScore), then: () => winner.set(WHITE) },
    ], () => winner.set(DRAW));
  }

  function resetBoard() {
    board.fill(EMPTY);
    board.set(3, 3, WHITE);
    board.set(4, 4, WHITE);
    board.set(3, 4, BLACK);
    board.set(4, 3, BLACK);
    blackScore.set(2);
    whiteScore.set(2);
    turn.set(BLACK);
    winner.set(EMPTY);
    consecutivePasses.set(0);
    passNotice.set(0);
    resetLegalityScan();
    phase.set(WAITING);
    boardWorld.rebuild();
  }

  function selectOpponent(own) {
    game.match(own, [
      [BLACK, () => opponent.set(WHITE)],
      [WHITE, () => opponent.set(BLACK)],
    ]);
  }

  function scanDirection(originX, originZ, own, dx: number, dz: number) {
    scanX.set(originX);
    scanZ.set(originZ);
    scanActive.set(1);
    captured.set(0);
    directionValid.set(0);

    game.repeat(7, () => {
      game.when(scanActive.eq(1), () => {
        scanX.add(dx);
        scanZ.add(dz);
        board.get(scanX, scanZ, probe);
        game.choose([
          {
            when: probe.eq(opponent),
            then: () => captured.add(1),
          },
          {
            when: probe.eq(own),
            then: () => {
              game.when(captured.gt(0), () => directionValid.set(1));
              scanActive.set(0);
            },
          },
        ], () => scanActive.set(0));
      });
    });

    game.when(directionValid.eq(1), () => {
      candidateValid.set(1);
      game.when(scanMode.eq(SCAN_MOVE), () => {
        flippedTotal.add(captured);
        flipX.set(originX);
        flipZ.set(originZ);
        flipRemaining.set(captured);
        game.repeat(6, () => {
          game.when(flipRemaining.gt(0), () => {
            flipX.add(dx);
            flipZ.add(dz);
            board.set(flipX, flipZ, own);
            flipRemaining.sub(1);
          });
        });
      });
    });
  }

  function checkCandidate(originX, originZ, own) {
    candidateValid.set(0);
    flippedTotal.set(0);
    selectOpponent(own);

    for (const [dx, dz] of directions) {
      scanDirection(originX, originZ, own, dx, dz);
    }
  }

  function advanceLegalityScan() {
    checkIndex.add(1);
    checkX.add(1);
    game.when(checkX.gte(8), () => {
      checkX.set(0);
      checkZ.add(1);
    });
    game.when(checkIndex.gte(64), () => {
      consecutivePasses.add(1);
      game.when(consecutivePasses.gte(2), () => finishGame(), () => {
        passNotice.set(40);
        switchTurn();
        resetLegalityScan();
      });
    });
  }

  const cells: Array<{ x: number; z: number; hit: ReturnType<typeof game.interaction> }> = [];
  game.repeat(8, z => {
    game.repeat(8, x => {
      const isInitialStone = (x === 3 || x === 4) && (z === 3 || z === 4);
      if (isInitialStone) return;
      cells.push({
        x,
        z,
        hit: game.interaction(`cell_${x}_${z}`, {
          x: BOARD_X + x + 0.5,
          y: BOARD_Y + 1,
          z: BOARD_Z + z + 0.5,
          width: 0.9,
          height: 0.45,
        }),
      });
    });
  });

  const blackSeat = game.interaction("seat_black", { x: 818.5, y: BOARD_Y + 1, z: 824.5, width: 0.9, height: 1 });
  const whiteSeat = game.interaction("seat_white", { x: 829.5, y: BOARD_Y + 1, z: 824.5, width: 0.9, height: 1 });
  const resetButton = game.interaction("reset", { x: 824.5, y: BOARD_Y + 1, z: 830.5, width: 0.9, height: 1 });

  game.block("black_seat_block", { block: "minecraft:black_concrete", x: 818, y: BOARD_Y, z: 824, scale: { x: 1, y: 0.35, z: 1 } });
  game.block("white_seat_block", { block: "minecraft:white_concrete", x: 829, y: BOARD_Y, z: 824, scale: { x: 1, y: 0.35, z: 1 } });
  game.block("reset_block", { block: "minecraft:redstone_block", x: 824, y: BOARD_Y, z: 830, scale: { x: 1, y: 0.35, z: 1 } });
  game.block("turn_black", {
    block: "minecraft:black_concrete",
    x: 823.55, y: BOARD_Y + 1.1, z: 829.35,
    scale: { x: 0.4, y: 0.12, z: 0.4 },
    when: game.condition.all([phase.eq(PLAYING), turn.eq(BLACK)]),
  });
  game.block("turn_white", {
    block: "minecraft:white_concrete",
    x: 823.55, y: BOARD_Y + 1.1, z: 829.35,
    scale: { x: 0.4, y: 0.12, z: 0.4 },
    when: game.condition.all([phase.eq(PLAYING), turn.eq(WHITE)]),
  });

  game.text("title", { text: "OTHELLO", x: 824, y: BOARD_Y + 2.1, z: 819, scale: 0.9, billboard: "center" });
  game.text("black_label", { text: "BLACK SEAT", x: 818.5, y: BOARD_Y + 1.5, z: 824.5, scale: 0.45, billboard: "center" });
  game.text("white_label", { text: "WHITE SEAT", x: 829.5, y: BOARD_Y + 1.5, z: 824.5, scale: 0.45, billboard: "center" });
  game.text("black_open", { text: "OPEN", x: 818.5, y: BOARD_Y + 1.85, z: 824.5, scale: 0.3, billboard: "center", when: blackPresent.eq(0) });
  game.text("black_ready", { text: "READY", x: 818.5, y: BOARD_Y + 1.85, z: 824.5, scale: 0.3, billboard: "center", when: blackPresent.eq(1) });
  game.text("white_open", { text: "OPEN", x: 829.5, y: BOARD_Y + 1.85, z: 824.5, scale: 0.3, billboard: "center", when: whitePresent.eq(0) });
  game.text("white_ready", { text: "READY", x: 829.5, y: BOARD_Y + 1.85, z: 824.5, scale: 0.3, billboard: "center", when: whitePresent.eq(1) });
  game.text("reset_label", { text: "RESET GAME", x: 824.5, y: BOARD_Y + 1.5, z: 830.5, scale: 0.4, billboard: "center" });
  game.text("score", { text: ["BLACK ", blackScore, "   -   WHITE ", whiteScore], x: 824, y: BOARD_Y + 1.75, z: 829.45, scale: 0.48, billboard: "center" });
  game.text("waiting", { text: "TAKE BOTH SEATS TO START", x: 824, y: BOARD_Y + 2.35, z: 829.45, scale: 0.48, billboard: "center", when: phase.eq(WAITING) });
  game.text("checking", { text: "CHECKING NEXT MOVES...", x: 824, y: BOARD_Y + 2.35, z: 829.45, scale: 0.42, billboard: "center", when: phase.eq(CHECKING) });
  game.text("black_turn", { text: "BLACK TO MOVE", x: 824, y: BOARD_Y + 2.35, z: 829.45, scale: 0.5, billboard: "center", when: game.condition.all([phase.eq(PLAYING), turn.eq(BLACK)]) });
  game.text("white_turn", { text: "WHITE TO MOVE", x: 824, y: BOARD_Y + 2.35, z: 829.45, scale: 0.5, billboard: "center", when: game.condition.all([phase.eq(PLAYING), turn.eq(WHITE)]) });
  game.text("pass_notice", { text: "NO LEGAL MOVE - TURN PASSED", x: 824, y: BOARD_Y + 2.75, z: 829.45, scale: 0.38, billboard: "center", when: passNotice.gt(0) });
  game.text("black_win", { text: "BLACK WINS - RESET TO PLAY AGAIN", x: 824, y: BOARD_Y + 2.35, z: 829.45, scale: 0.5, billboard: "center", when: winner.eq(BLACK) });
  game.text("white_win", { text: "WHITE WINS - RESET TO PLAY AGAIN", x: 824, y: BOARD_Y + 2.35, z: 829.45, scale: 0.5, billboard: "center", when: winner.eq(WHITE) });
  game.text("draw", { text: "DRAW - RESET TO PLAY AGAIN", x: 824, y: BOARD_Y + 2.35, z: 829.45, scale: 0.5, billboard: "center", when: winner.eq(DRAW) });

  game.particle("move_fx", {
    particle: "minecraft:happy_villager",
    x: game.at(requestX, BOARD_X + 0.5),
    y: BOARD_Y + 1.2,
    z: game.at(requestZ, BOARD_Z + 0.5),
    delta: { x: 0.25, y: 0.15, z: 0.25 },
    speed: 0.02,
    count: 8,
    when: moveFx.eq(1),
  });
  game.sound("move_sound", {
    sound: "minecraft:block.amethyst_block.hit",
    x: game.at(requestX, BOARD_X + 0.5),
    y: BOARD_Y + 1,
    z: game.at(requestZ, BOARD_Z + 0.5),
    volume: 0.8,
    pitch: 1.2,
    when: moveFx.eq(1),
  });
  game.particle("invalid_fx", {
    particle: "minecraft:angry_villager",
    x: game.at(requestX, BOARD_X + 0.5),
    y: BOARD_Y + 1.25,
    z: game.at(requestZ, BOARD_Z + 0.5),
    delta: { x: 0.15, y: 0.1, z: 0.15 },
    speed: 0.01,
    count: 4,
    when: invalidFx.eq(1),
  });
  game.sound("invalid_sound", {
    sound: "minecraft:block.note_block.bass",
    x: game.at(requestX, BOARD_X + 0.5),
    y: BOARD_Y + 1,
    z: game.at(requestZ, BOARD_Z + 0.5),
    volume: 0.65,
    pitch: 0.6,
    when: invalidFx.eq(1),
  });

  game.tick(() => {
    requestLock.set(0);
    moveFx.set(0);
    invalidFx.set(0);
    game.when(passNotice.gt(0), () => passNotice.sub(1));

    game.when(initialized.eq(0), () => {
      resetBoard();
      initialized.set(1);
    });

    game.reduce.any(players, blackPresent, player => player.state("othelloColor", EMPTY).eq(BLACK));
    game.reduce.any(players, whitePresent, player => player.state("othelloColor", EMPTY).eq(WHITE));

    game.when(game.condition.all([phase.eq(WAITING), blackPresent.eq(1), whitePresent.eq(1)]), () => phase.set(PLAYING));

    blackSeat.onUse(player => {
      const color = player.state("othelloColor", EMPTY);
      game.when(game.condition.all([phase.eq(WAITING), blackPresent.eq(0), color.eq(EMPTY)]), () => color.set(BLACK));
    });

    whiteSeat.onUse(player => {
      const color = player.state("othelloColor", EMPTY);
      game.when(game.condition.all([phase.eq(WAITING), whitePresent.eq(0), color.eq(EMPTY)]), () => color.set(WHITE));
    });

    resetButton.onUse(() => resetBoard());

    for (const cell of cells) {
      cell.hit.onUse(player => {
        const color = player.state("othelloColor", EMPTY);
        game.when(game.condition.all([requestLock.eq(0), phase.eq(PLAYING)]), () => {
          requestX.set(cell.x);
          requestZ.set(cell.z);
          game.when(color.eq(turn), () => {
            requestColor.set(color);
            requestLock.set(1);
          }, () => invalidFx.set(1));
        });
      });
    }

    game.when(game.condition.all([requestLock.eq(1), scanMode.eq(SCAN_NONE)]), () => {
      board.get(requestX, requestZ, probe);
      game.when(probe.eq(EMPTY), () => {
        scanOriginX.set(requestX);
        scanOriginZ.set(requestZ);
        scanOwn.set(requestColor);
        scanMode.set(SCAN_MOVE);
      }, () => invalidFx.set(1));
    });

    game.when(game.condition.all([phase.eq(CHECKING), scanMode.eq(SCAN_NONE)]), () => {
      board.get(checkX, checkZ, probe);
      game.when(probe.eq(EMPTY), () => {
        scanOriginX.set(checkX);
        scanOriginZ.set(checkZ);
        scanOwn.set(turn);
        scanMode.set(SCAN_LEGAL);
      }, () => advanceLegalityScan());
    });

    game.when(scanMode.ne(SCAN_NONE), () => {
      checkCandidate(scanOriginX, scanOriginZ, scanOwn);
      game.match(scanMode, [
        [SCAN_MOVE, () => {
          game.when(candidateValid.eq(1), () => {
            board.set(scanOriginX, scanOriginZ, scanOwn);
            game.match(scanOwn, [
              [BLACK, () => {
                blackScore.add(flippedTotal);
                blackScore.add(1);
                whiteScore.sub(flippedTotal);
              }],
              [WHITE, () => {
                whiteScore.add(flippedTotal);
                whiteScore.add(1);
                blackScore.sub(flippedTotal);
              }],
            ]);
            consecutivePasses.set(0);
            switchTurn();
            resetLegalityScan();
            phase.set(CHECKING);
            moveFx.set(1);
            boardWorld.rebuild();
          }, () => invalidFx.set(1));
        }],
        [SCAN_LEGAL, () => {
          game.when(candidateValid.eq(1), () => phase.set(PLAYING), () => advanceLegalityScan());
        }],
      ]);
      scanMode.set(SCAN_NONE);
    });

    game.forEachPlayer(players, player => {
      player.hud("othello", { text: ["OTHELLO   BLACK ", blackScore, "  -  WHITE ", whiteScore, "   |   Right-click a legal square"] });
    });
  });
});
