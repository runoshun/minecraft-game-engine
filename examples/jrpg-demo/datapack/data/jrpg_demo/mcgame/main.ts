const ORIGIN_X = 60;
const ORIGIN_Z = 0;
const FLOOR_Y = 100;
const ACTOR_Y = 101;
const GUIDE_X = 4;
const GUIDE_Z = 4;
const MERCHANT_X = 9;
const MERCHANT_Z = 4;
const SLIME1_X = 10;
const SLIME1_Z = 9;
const SLIME2_X = 12;
const SLIME2_Z = 8;

const MODE_FIELD = 0;
const MODE_DIALOGUE = 1;
const MODE_SHOP = 2;
const MODE_BATTLE = 3;
const MODE_VICTORY = 4;
const MODE_DEFEAT = 5;

portableDsl({ fixedPoint: 1000, ownership: { minX: 56, minZ: -4, maxX: 80, maxZ: 16 } }, game => {
  const forward = game.input("forward", 0, { source: "first_player_forward" });
  const backward = game.input("backward", 0, { source: "first_player_backward" });
  const left = game.input("left", 0, { source: "first_player_left" });
  const right = game.input("right", 0, { source: "first_player_right" });
  const jump = game.input("jump", 0, { source: "first_player_jump" });
  const sneak = game.input("sneak", 0, { source: "first_player_sneak" });

  const prevForward = game.state("prevForward", 0);
  const prevBackward = game.state("prevBackward", 0);
  const prevLeft = game.state("prevLeft", 0);
  const prevRight = game.state("prevRight", 0);
  const prevJump = game.state("prevJump", 0);
  const prevSneak = game.state("prevSneak", 0);
  const actionLock = game.state("actionLock", 0);
  const fx = game.state("fx", 0);

  const mode = game.state("mode", MODE_FIELD);
  const playerX = game.state("playerX", 7);
  const playerZ = game.state("playerZ", 6);
  const playerYaw = game.state("playerYaw", 0);
  const playerHp = game.state("playerHp", 20);
  const playerAttack = game.state("playerAttack", 7);
  const gold = game.state("gold", 20);
  const xp = game.state("xp", 0);
  const potions = game.state("potions", 1);
  const swordBought = game.state("swordBought", 0);

  const dialogueIndex = game.state("dialogueIndex", 0);
  const selection = game.state("selection", 0);
  const activeEnemy = game.state("activeEnemy", 0);
  const battlePhase = game.state("battlePhase", 0);
  const battleTimer = game.state("battleTimer", 0);
  const battleTurn = game.state("battleTurn", 0);

  const slime1Hp = game.state("slime1Hp", 18);
  const slime1Alive = game.state("slime1Alive", 1);
  const slime2Hp = game.state("slime2Hp", 24);
  const slime2Alive = game.state("slime2Alive", 1);

  const dialogue0Visible = game.state("dialogue0Visible", 0);
  const dialogue1Visible = game.state("dialogue1Visible", 0);
  const dialogue2Visible = game.state("dialogue2Visible", 0);
  const shopVisible = game.state("shopVisible", 0);
  const battleVisible = game.state("battleVisible", 0);
  const victoryVisible = game.state("victoryVisible", 0);
  const defeatVisible = game.state("defeatVisible", 0);

  game.camera("main", { x: 58, y: 107, z: -1, yaw: -50, pitch: 32 });

  game.worldFill("clear", {
    fromX: 59, fromY: 99, fromZ: -1,
    toX: 75, toY: 104, toZ: 13,
    block: "minecraft:air",
  });
  game.worldFill("foundation", {
    fromX: 60, fromY: 99, fromZ: 0,
    toX: 74, toY: 99, toZ: 12,
    block: "minecraft:stone_bricks",
  });
  game.worldFill("floor", {
    fromX: 60, fromY: FLOOR_Y, fromZ: 0,
    toX: 74, toY: FLOOR_Y, toZ: 12,
    block: "minecraft:polished_andesite",
  });
  game.worldFill("wall_n", {
    fromX: 60, fromY: 101, fromZ: 0,
    toX: 74, toY: 103, toZ: 0,
    block: "minecraft:stone_bricks",
  });
  game.worldFill("wall_s", {
    fromX: 60, fromY: 101, fromZ: 12,
    toX: 74, toY: 103, toZ: 12,
    block: "minecraft:stone_bricks",
  });
  game.worldFill("wall_w", {
    fromX: 60, fromY: 101, fromZ: 1,
    toX: 60, toY: 103, toZ: 11,
    block: "minecraft:stone_bricks",
  });
  game.worldFill("wall_e", {
    fromX: 74, fromY: 101, fromZ: 1,
    toX: 74, toY: 103, toZ: 11,
    block: "minecraft:stone_bricks",
  });
  game.worldBatch("markers", { blocks: [
    { x: 64, y: 100, z: 4, block: "minecraft:chiseled_stone_bricks" },
    { x: 69, y: 100, z: 4, block: "minecraft:emerald_block" },
    { x: 70, y: 100, z: 9, block: "minecraft:moss_block" },
    { x: 72, y: 100, z: 8, block: "minecraft:moss_block" },
  ] });

  game.actor("hero", {
    x: game.at(playerX, ORIGIN_X + 0.5),
    y: ACTOR_Y,
    z: game.at(playerZ, ORIGIN_Z + 0.5),
    yaw: playerYaw,
  });
  game.actor("guide", { x: ORIGIN_X + GUIDE_X + 0.5, y: ACTOR_Y, z: ORIGIN_Z + GUIDE_Z + 0.5, yaw: 180 });
  game.actor("merchant", { x: ORIGIN_X + MERCHANT_X + 0.5, y: ACTOR_Y, z: ORIGIN_Z + MERCHANT_Z + 0.5, yaw: 180 });

  game.block("slime1", {
    block: "minecraft:slime_block",
    x: ORIGIN_X + SLIME1_X + 0.5, y: ACTOR_Y + 0.25, z: ORIGIN_Z + SLIME1_Z + 0.5,
    scale: 0.7, translation: { x: -0.35, y: -0.35, z: -0.35 },
    when: slime1Alive.eq(1),
  });
  game.block("slime2", {
    block: "minecraft:blue_concrete",
    x: ORIGIN_X + SLIME2_X + 0.5, y: ACTOR_Y + 0.25, z: ORIGIN_Z + SLIME2_Z + 0.5,
    scale: 0.7, translation: { x: -0.35, y: -0.35, z: -0.35 },
    when: slime2Alive.eq(1),
  });

  game.text("title", {
    text: "PORTABLE JRPG",
    x: 67.5, y: 104.4, z: 6.5,
    scale: 0.7, billboard: "center",
  });
  game.text("guide_label", {
    text: "GUIDE", x: 64.5, y: 103.2, z: 4.5,
    scale: 0.45, billboard: "center",
  });
  game.text("merchant_label", {
    text: "MERCHANT", x: 69.5, y: 103.2, z: 4.5,
    scale: 0.45, billboard: "center",
  });
  game.text("slime1_label", {
    text: ["GREEN SLIME  ", slime1Hp, "/18"],
    x: 70.5, y: 102.8, z: 9.5,
    scale: 0.38, billboard: "center", when: slime1Alive.eq(1),
  });
  game.text("slime2_label", {
    text: ["BLUE SLIME  ", slime2Hp, "/24"],
    x: 72.5, y: 102.8, z: 8.5,
    scale: 0.38, billboard: "center", when: slime2Alive.eq(1),
  });
  game.text("dialogue0", {
    text: "Guide: Welcome to the portable prototype plaza!",
    x: 67.5, y: 103.8, z: 5.5, scale: 0.42, billboard: "center", when: dialogue0Visible.eq(1),
  });
  game.text("dialogue1", {
    text: "Guide: The Merchant sells potions and a sword upgrade.",
    x: 67.5, y: 103.8, z: 5.5, scale: 0.42, billboard: "center", when: dialogue1Visible.eq(1),
  });
  game.text("dialogue2", {
    text: "Guide: Bump into a slime to enter turn-based combat.",
    x: 67.5, y: 103.8, z: 5.5, scale: 0.42, billboard: "center", when: dialogue2Visible.eq(1),
  });
  game.text("shop_help", {
    text: ["SHOP  SELECT ", selection, "   GOLD ", gold, "   POTIONS ", potions],
    x: 67.5, y: 103.8, z: 5.5, scale: 0.42, billboard: "center", when: shopVisible.eq(1),
  });
  game.text("battle_help", {
    text: ["BATTLE  ENEMY ", activeEnemy, "   SELECT ", selection, "   TURN ", battleTurn],
    x: 67.5, y: 103.8, z: 5.5, scale: 0.42, billboard: "center", when: battleVisible.eq(1),
  });
  game.text("victory", {
    text: "VICTORY!", x: 67.5, y: 103.8, z: 5.5,
    scale: 0.65, billboard: "center", when: victoryVisible.eq(1),
  });
  game.text("defeat", {
    text: "DEFEATED... RECOVERING", x: 67.5, y: 103.8, z: 5.5,
    scale: 0.55, billboard: "center", when: defeatVisible.eq(1),
  });

  game.sidebar("main", {
    title: "PORTABLE JRPG",
    rows: [
      { id: "mode", text: ["MODE ", mode] },
      { id: "hp", text: ["HP ", playerHp, "/20"] },
      { id: "atk", text: ["ATK ", playerAttack] },
      { id: "gold", text: ["GOLD ", gold] },
      { id: "xp", text: ["XP ", xp] },
      { id: "potions", text: ["POTIONS ", potions] },
      { id: "select", text: ["SELECT ", selection] },
      { id: "enemy", text: ["ENEMY ", activeEnemy] },
      { id: "turn", text: ["TURN ", battleTurn] },
      { id: "controls", text: "WASD / SPACE / SNEAK" },
    ],
  });
  game.hud("main", {
    text: ["MODE ", mode, "  HP ", playerHp, "  GOLD ", gold, "  SPACE CONFIRM  SNEAK BACK"],
  });

  game.particle("action", {
    particle: "minecraft:happy_villager",
    x: game.at(playerX, ORIGIN_X + 0.5), y: ACTOR_Y + 1.0, z: game.at(playerZ, ORIGIN_Z + 0.5),
    delta: 0.18, speed: 0.02, count: 5, force: true, when: fx.eq(1),
  });
  game.sound("action", {
    sound: "minecraft:block.note_block.pling",
    x: game.at(playerX, ORIGIN_X + 0.5), y: ACTOR_Y, z: game.at(playerZ, ORIGIN_Z + 0.5),
    volume: 0.65, pitch: 1.25, when: fx.eq(1),
  });

  function startBattle(enemyId: number) {
    activeEnemy.set(enemyId);
    mode.set(MODE_BATTLE);
    selection.set(0);
    battlePhase.set(0);
    battleTimer.set(0);
    battleTurn.set(1);
    fx.set(1);
  }

  function resolveStepInteractions(dx: number, dz: number) {
    game.when(playerX.eq(GUIDE_X), () => game.when(playerZ.eq(GUIDE_Z), () => {
      playerX.add(-dx); playerZ.add(-dz); mode.set(MODE_DIALOGUE); dialogueIndex.set(0); fx.set(1);
    }));
    game.when(playerX.eq(MERCHANT_X), () => game.when(playerZ.eq(MERCHANT_Z), () => {
      playerX.add(-dx); playerZ.add(-dz); mode.set(MODE_SHOP); selection.set(0); fx.set(1);
    }));
    game.when(slime1Alive.eq(1), () => game.when(playerX.eq(SLIME1_X), () => game.when(playerZ.eq(SLIME1_Z), () => {
      playerX.add(-dx); playerZ.add(-dz); startBattle(1);
    })));
    game.when(slime2Alive.eq(1), () => game.when(playerX.eq(SLIME2_X), () => game.when(playerZ.eq(SLIME2_Z), () => {
      playerX.add(-dx); playerZ.add(-dz); startBattle(2);
    })));
  }

  function step(dx: number, dz: number, yaw: number) {
    playerYaw.set(yaw);
    playerX.add(dx);
    playerZ.add(dz);
    game.when(playerX.lt(1), () => playerX.set(1));
    game.when(playerX.gt(13), () => playerX.set(13));
    game.when(playerZ.lt(1), () => playerZ.set(1));
    game.when(playerZ.gt(11), () => playerZ.set(11));
    resolveStepInteractions(dx, dz);
  }

  function attackEnemy(enemyId: number, hp: ReturnType<typeof game.state>, alive: ReturnType<typeof game.state>, rewardGold: number, rewardXp: number) {
    game.when(activeEnemy.eq(enemyId), () => {
      hp.sub(playerAttack);
      fx.set(1);
      game.when(hp.lte(0), () => {
        hp.set(0);
        alive.set(0);
        gold.add(rewardGold);
        xp.add(rewardXp);
        mode.set(MODE_VICTORY);
        battleTimer.set(24);
      }, () => {
        battlePhase.set(1);
        battleTimer.set(12);
      });
    });
  }

  function enemyTurn(enemyId: number, damage: number) {
    game.when(activeEnemy.eq(enemyId), () => {
      playerHp.sub(damage);
      fx.set(1);
      game.when(playerHp.lte(0), () => {
        playerHp.set(0);
        mode.set(MODE_DEFEAT);
        battleTimer.set(32);
      }, () => {
        battleTurn.add(1);
        battlePhase.set(0);
      });
    });
  }

  game.tick(() => {
    fx.set(0);
    actionLock.set(0);

    game.when(mode.eq(MODE_FIELD), () => {
      game.when(actionLock.eq(0), () => game.when(forward.eq(1), () => game.when(prevForward.eq(0), () => {
        step(0, 1, 0); actionLock.set(1);
      })));
      game.when(actionLock.eq(0), () => game.when(backward.eq(1), () => game.when(prevBackward.eq(0), () => {
        step(0, -1, 180); actionLock.set(1);
      })));
      game.when(actionLock.eq(0), () => game.when(left.eq(1), () => game.when(prevLeft.eq(0), () => {
        step(1, 0, -90); actionLock.set(1);
      })));
      game.when(actionLock.eq(0), () => game.when(right.eq(1), () => game.when(prevRight.eq(0), () => {
        step(-1, 0, 90); actionLock.set(1);
      })));
    });

    game.when(mode.eq(MODE_DIALOGUE), () => {
      game.when(sneak.eq(1), () => game.when(prevSneak.eq(0), () => { mode.set(MODE_FIELD); fx.set(1); }));
      game.when(jump.eq(1), () => game.when(prevJump.eq(0), () => {
        dialogueIndex.add(1); fx.set(1);
        game.when(dialogueIndex.gt(2), () => { dialogueIndex.set(0); mode.set(MODE_FIELD); });
      }));
    });

    game.when(mode.eq(MODE_SHOP), () => {
      game.when(actionLock.eq(0), () => {
        game.when(sneak.eq(1), () => game.when(prevSneak.eq(0), () => { mode.set(MODE_FIELD); fx.set(1); }));
        game.when(forward.eq(1), () => game.when(prevForward.eq(0), () => {
          selection.sub(1); game.when(selection.lt(0), () => selection.set(2)); fx.set(1);
        }));
        game.when(backward.eq(1), () => game.when(prevBackward.eq(0), () => {
          selection.add(1); game.when(selection.gt(2), () => selection.set(0)); fx.set(1);
        }));
        game.when(jump.eq(1), () => game.when(prevJump.eq(0), () => {
          game.when(selection.eq(0), () => game.when(gold.gte(5), () => { gold.sub(5); potions.add(1); fx.set(1); }));
          game.when(selection.eq(1), () => game.when(swordBought.eq(0), () => game.when(gold.gte(12), () => {
            gold.sub(12); swordBought.set(1); playerAttack.set(10); fx.set(1);
          })));
          game.when(selection.eq(2), () => { mode.set(MODE_FIELD); fx.set(1); });
        }));
      });
    });

    game.when(mode.eq(MODE_BATTLE), () => {
      game.when(battlePhase.eq(0), () => {
        game.when(actionLock.eq(0), () => {
        game.when(forward.eq(1), () => game.when(prevForward.eq(0), () => {
          selection.sub(1); game.when(selection.lt(0), () => selection.set(2)); fx.set(1);
        }));
        game.when(backward.eq(1), () => game.when(prevBackward.eq(0), () => {
          selection.add(1); game.when(selection.gt(2), () => selection.set(0)); fx.set(1);
        }));
        game.when(jump.eq(1), () => game.when(prevJump.eq(0), () => {
          game.when(selection.eq(0), () => {
            attackEnemy(1, slime1Hp, slime1Alive, 6, 4);
            attackEnemy(2, slime2Hp, slime2Alive, 9, 6);
          });
          game.when(selection.eq(1), () => {
            game.when(potions.gt(0), () => {
              potions.sub(1); playerHp.add(8); game.when(playerHp.gt(20), () => playerHp.set(20));
              battlePhase.set(1); battleTimer.set(12); fx.set(1);
            });
          });
          game.when(selection.eq(2), () => {
            mode.set(MODE_FIELD); activeEnemy.set(0); battlePhase.set(0); fx.set(1);
          });
        }));
        });
      });
      game.when(battlePhase.eq(1), () => {
        battleTimer.sub(1);
        game.when(battleTimer.lte(0), () => {
          enemyTurn(1, 5);
          enemyTurn(2, 6);
        });
      });
    });

    game.when(mode.eq(MODE_VICTORY), () => {
      battleTimer.sub(1);
      game.when(battleTimer.lte(0), () => { mode.set(MODE_FIELD); activeEnemy.set(0); battlePhase.set(0); });
    });

    game.when(mode.eq(MODE_DEFEAT), () => {
      battleTimer.sub(1);
      game.when(battleTimer.lte(0), () => {
        game.when(activeEnemy.eq(1), () => game.when(slime1Alive.eq(1), () => slime1Hp.set(18)));
        game.when(activeEnemy.eq(2), () => game.when(slime2Alive.eq(1), () => slime2Hp.set(24)));
        playerHp.set(20); playerX.set(7); playerZ.set(6); playerYaw.set(0);
        activeEnemy.set(0); battlePhase.set(0); mode.set(MODE_FIELD);
      });
    });

    dialogue0Visible.set(0); dialogue1Visible.set(0); dialogue2Visible.set(0);
    shopVisible.set(0); battleVisible.set(0); victoryVisible.set(0); defeatVisible.set(0);
    game.when(mode.eq(MODE_DIALOGUE), () => {
      game.when(dialogueIndex.eq(0), () => dialogue0Visible.set(1));
      game.when(dialogueIndex.eq(1), () => dialogue1Visible.set(1));
      game.when(dialogueIndex.eq(2), () => dialogue2Visible.set(1));
    });
    game.when(mode.eq(MODE_SHOP), () => shopVisible.set(1));
    game.when(mode.eq(MODE_BATTLE), () => battleVisible.set(1));
    game.when(mode.eq(MODE_VICTORY), () => victoryVisible.set(1));
    game.when(mode.eq(MODE_DEFEAT), () => defeatVisible.set(1));

    prevForward.set(forward);
    prevBackward.set(backward);
    prevLeft.set(left);
    prevRight.set(right);
    prevJump.set(jump);
    prevSneak.set(sneak);
  });
});
