type PlayerInput = {
  id: string; name: string; dimension: string; x: number; y: number; z: number;
  forward: boolean; backward: boolean; left: boolean; right: boolean;
  jump: boolean; sneak: boolean; sprint: boolean;
  jumpPressed: boolean; sneakPressed: boolean; sprintPressed: boolean;
};
type DirectionButtons = { forward: boolean; backward: boolean; left: boolean; right: boolean };
type Mode = "inactive" | "field" | "dialogue" | "shop" | "battle" | "victory" | "defeat";
type BattlePhase = "choose" | "enemy";
type Point = { gx: number; gz: number };
type Enemy = Point & { id: string; name: string; hp: number; maxHp: number; attack: number; gold: number; xp: number; alive: boolean };
type CameraState = { x: number; y: number; z: number; yaw: number; pitch: number };

const MAP_WIDTH = 15, MAP_HEIGHT = 13, ORIGIN_X = 60, ORIGIN_Z = 0, FLOOR_Y = 100, ACTOR_Y = 101;
const FIELD_CAMERA: CameraState = { x: 58, y: 107, z: -1, yaw: -50, pitch: 32 };
const BATTLE_CAMERA: CameraState = { x: 75.5, y: 106.5, z: 15, yaw: 135, pitch: 25 };
const POSITION_EPSILON = 0.25;
const START_TRIGGER = { x: 57.5, y: 143, z: 6.5 };
const STOP_TRIGGER = { x: 58.5, y: 143, z: 6.5 };
const GUIDE = { gx: 4, gz: 4, id: "jrpg_guide" };
const MERCHANT = { gx: 9, gz: 4, id: "jrpg_merchant" };
const PLAYER_START = { gx: 7, gz: 6 };
const PLAYER_MAX_HP = 20, BASE_ATTACK = 7, SWORD_BONUS = 3, POTION_HEAL = 8;
const POTION_PRICE = 5, SWORD_PRICE = 12, ENEMY_ACTION_DELAY = 12, VICTORY_DELAY = 24, DEFEAT_DELAY = 32;

const guideLines = [
  "Guide: Welcome to the prototype plaza!",
  "Guide: The Merchant sells potions and a sword upgrade.",
  "Guide: Bump into a slime to enter turn-based combat.",
];
const player = { gx: 7, gz: 6, yaw: 0, hp: 20, attack: 7, gold: 20, xp: 0, potions: 1, swordBought: false };
let enemies: Enemy[] = [];
let mode: Mode = "inactive", controllerId: string | null = null, controllerName = "", cameraAttached = false, skipInput = false;
let previousDirection: DirectionButtons = { forward: false, backward: false, left: false, right: false };
let dialogueIndex = 0, shopSelection = 0, shopMessage = "Choose an item.", battleSelection = 0;
let battlePhase: BattlePhase = "choose", battleTimer = 0, battleMessage = "", activeEnemyId: string | null = null, battleTurn = 0;
const startTriggerConsumed = new Set<string>(), stopTriggerConsumed = new Set<string>();

function worldX(gx: number): number { return ORIGIN_X + gx + 0.5; }
function worldZ(gz: number): number { return ORIGIN_Z + gz + 0.5; }
function yawForStep(dx: number, dz: number): number {
  if (dz > 0) return 0; if (dz < 0) return 180; if (dx > 0) return -90; if (dx < 0) return 90; return player.yaw;
}
function inBounds(gx: number, gz: number): boolean { return gx >= 1 && gx < MAP_WIDTH - 1 && gz >= 1 && gz < MAP_HEIGHT - 1; }
function near(value: number, expected: number): boolean { return Math.abs(value - expected) <= POSITION_EPSILON; }
function isTrigger(p: PlayerInput, t: { x: number; y: number; z: number }): boolean {
  return p.dimension === "minecraft:overworld" && near(p.x, t.x) && near(p.y, t.y) && near(p.z, t.z);
}
function isAtCameraAnchor(p: PlayerInput, camera: CameraState): boolean {
  return p.dimension === "minecraft:overworld" && near(p.x, camera.x) && near(p.y, camera.y) && near(p.z, camera.z);
}
function currentCameraOptions(): CameraState {
  if (mode === "battle" || mode === "victory" || mode === "defeat") return BATTLE_CAMERA;
  return FIELD_CAMERA;
}
function directionAction(p: PlayerInput): { dx: number; dz: number } | null {
  if (p.forward && !previousDirection.forward) return { dx: 0, dz: 1 };
  if (p.backward && !previousDirection.backward) return { dx: 0, dz: -1 };
  if (p.left && !previousDirection.left) return { dx: 1, dz: 0 };
  if (p.right && !previousDirection.right) return { dx: -1, dz: 0 };
  return null;
}
function menuDelta(p: PlayerInput): number {
  if (p.forward && !previousDirection.forward) return -1;
  if (p.backward && !previousDirection.backward) return 1;
  return 0;
}
function rememberDirections(p: PlayerInput): void {
  previousDirection = { forward: p.forward, backward: p.backward, left: p.left, right: p.right };
}
function spawnText(id: string, text: string, gx: number, gz: number, yOffset: number): void {
  render.spawn(id, { visual: { kind: "text", text }, x: worldX(gx), y: ACTOR_Y + yOffset, z: worldZ(gz), billboard: "center", scale: 0.8 });
}
function resetEnemies(): void {
  enemies = [
    { id: "jrpg_slime_1", name: "Green Slime", gx: 10, gz: 9, hp: 18, maxHp: 18, attack: 5, gold: 6, xp: 4, alive: true },
    { id: "jrpg_slime_2", name: "Blue Slime", gx: 12, gz: 8, hp: 24, maxHp: 24, attack: 6, gold: 9, xp: 6, alive: true },
  ];
}
function spawnEnemyProjection(enemy: Enemy): void {
  render.spawn(enemy.id, {
    visual: { kind: "block", block: enemy.id.endsWith("1") ? "minecraft:slime_block" : "minecraft:blue_concrete" },
    x: worldX(enemy.gx), y: ACTOR_Y + 0.05, z: worldZ(enemy.gz), scale: 0.62, offset: { x: -0.31, y: 0, z: -0.31 },
  });
  spawnText(`${enemy.id}_label`, `${enemy.name} ${enemy.hp}/${enemy.maxHp}`, enemy.gx, enemy.gz, 1.15);
}
function updateEnemyProjection(enemy: Enemy): void {
  if (enemy.alive) render.update(`${enemy.id}_label`, { visual: { kind: "text", text: `${enemy.name} ${Math.max(0, enemy.hp)}/${enemy.maxHp}` } });
}
function spawnScene(): void {
  actors.spawn("jrpg_hero", { x: worldX(player.gx), y: ACTOR_Y, z: worldZ(player.gz), yaw: player.yaw });
  actors.spawn(GUIDE.id, { x: worldX(GUIDE.gx), y: ACTOR_Y, z: worldZ(GUIDE.gz), yaw: 180 });
  actors.spawn(MERCHANT.id, { x: worldX(MERCHANT.gx), y: ACTOR_Y, z: worldZ(MERCHANT.gz), yaw: 180 });
  spawnText("jrpg_guide_label", "Guide", GUIDE.gx, GUIDE.gz, 2.15);
  spawnText("jrpg_merchant_label", "Merchant", MERCHANT.gx, MERCHANT.gz, 2.15);
  for (const enemy of enemies) if (enemy.alive) spawnEnemyProjection(enemy);
}
function clearScene(): void {
  actors.remove("jrpg_hero"); actors.remove(GUIDE.id); actors.remove(MERCHANT.id);
  render.remove("jrpg_guide_label"); render.remove("jrpg_merchant_label");
  for (const enemy of enemies) { render.remove(enemy.id); render.remove(`${enemy.id}_label`); }
}
function projectPlayer(): void {
  actors.move("jrpg_hero", { x: worldX(player.gx), y: ACTOR_Y, z: worldZ(player.gz), yaw: player.yaw });
}
function resetPlayer(): void {
  player.gx = PLAYER_START.gx; player.gz = PLAYER_START.gz; player.yaw = 0; player.hp = PLAYER_MAX_HP;
  player.attack = BASE_ATTACK; player.gold = 20; player.xp = 0; player.potions = 1; player.swordBought = false;
}
function currentEnemy(): Enemy | undefined { return activeEnemyId ? enemies.find(enemy => enemy.id === activeEnemyId) : undefined; }
function startSession(p: PlayerInput): void {
  if (controllerId) stopSession(false);
  controllerId = p.id; controllerName = p.name; resetPlayer(); resetEnemies(); mode = "field"; activeEnemyId = null;
  battlePhase = "choose"; battleTimer = 0; battleTurn = 0; battleSelection = 0; dialogueIndex = 0; shopSelection = 0;
  shopMessage = "Choose an item."; previousDirection = { forward: false, backward: false, left: false, right: false }; skipInput = true;
  spawnScene();
  effects.sound({ sound: "minecraft:block.amethyst_block.chime", x: worldX(player.gx), y: ACTOR_Y, z: worldZ(player.gz), volume: 0.8, pitch: 1.0 });
  game.log("JRPG_START", p.name, `gold=${player.gold}`, `hp=${player.hp}`);
}
function stopSession(logStop: boolean): void {
  const oldController = controllerId; clearScene();
  if (oldController) { ui.panel(oldController, null); if (cameraAttached) camera.detach(oldController); }
  cameraAttached = false; controllerId = null; controllerName = ""; mode = "inactive"; activeEnemyId = null; battleTimer = 0;
  previousDirection = { forward: false, backward: false, left: false, right: false };
  if (logStop) game.log("JRPG_STOP");
}
function openDialogue(): void {
  mode = "dialogue"; dialogueIndex = 0; skipInput = true;
  effects.sound({ sound: "minecraft:entity.villager.yes", x: worldX(GUIDE.gx), y: ACTOR_Y, z: worldZ(GUIDE.gz), volume: 0.7, pitch: 1.1 });
  game.log("JRPG_DIALOGUE_OPEN", "Guide");
}
function advanceDialogue(): void {
  dialogueIndex += 1;
  if (dialogueIndex >= guideLines.length) { mode = "field"; dialogueIndex = 0; game.log("JRPG_DIALOGUE_CLOSE", "Guide"); }
  else effects.sound({ sound: "minecraft:ui.button.click", x: worldX(GUIDE.gx), y: ACTOR_Y, z: worldZ(GUIDE.gz), volume: 0.5, pitch: 1.2 });
}
function openShop(): void {
  mode = "shop"; shopSelection = 0; shopMessage = "Choose an item."; skipInput = true;
  effects.sound({ sound: "minecraft:entity.villager.trade", x: worldX(MERCHANT.gx), y: ACTOR_Y, z: worldZ(MERCHANT.gz), volume: 0.7, pitch: 1.0 });
  game.log("JRPG_SHOP_OPEN", `gold=${player.gold}`);
}
function leaveShop(): void {
  mode = "field"; shopMessage = "";
  effects.sound({ sound: "minecraft:ui.button.click", x: worldX(MERCHANT.gx), y: ACTOR_Y, z: worldZ(MERCHANT.gz), volume: 0.5, pitch: 0.9 });
  game.log("JRPG_SHOP_CLOSE", `gold=${player.gold}`, `potions=${player.potions}`, `attack=${player.attack}`);
}
function buySelectedShopItem(): void {
  if (shopSelection === 0) {
    if (player.gold < POTION_PRICE) { shopMessage = "Not enough gold."; effects.sound({ sound: "minecraft:entity.villager.no", x: worldX(MERCHANT.gx), y: ACTOR_Y, z: worldZ(MERCHANT.gz), volume: 0.6, pitch: 1.0 }); return; }
    player.gold -= POTION_PRICE; player.potions += 1; shopMessage = `Bought Potion. Gold ${player.gold}.`;
    effects.sound({ sound: "minecraft:entity.experience_orb.pickup", x: worldX(MERCHANT.gx), y: ACTOR_Y, z: worldZ(MERCHANT.gz), volume: 0.6, pitch: 1.3 });
    game.log("JRPG_SHOP_BUY", "potion", `gold=${player.gold}`, `potions=${player.potions}`); return;
  }
  if (shopSelection === 1) {
    if (player.swordBought) { shopMessage = "Iron Sword already owned."; return; }
    if (player.gold < SWORD_PRICE) { shopMessage = "Not enough gold."; effects.sound({ sound: "minecraft:entity.villager.no", x: worldX(MERCHANT.gx), y: ACTOR_Y, z: worldZ(MERCHANT.gz), volume: 0.6, pitch: 1.0 }); return; }
    player.gold -= SWORD_PRICE; player.swordBought = true; player.attack = BASE_ATTACK + SWORD_BONUS;
    shopMessage = `Equipped Iron Sword. ATK ${player.attack}.`;
    effects.sound({ sound: "minecraft:item.armor.equip_iron", x: worldX(MERCHANT.gx), y: ACTOR_Y, z: worldZ(MERCHANT.gz), volume: 0.8, pitch: 1.1 });
    game.log("JRPG_SHOP_BUY", "iron_sword", `gold=${player.gold}`, `attack=${player.attack}`); return;
  }
  leaveShop();
}
function startBattle(enemy: Enemy): void {
  mode = "battle"; activeEnemyId = enemy.id; battleSelection = 0; battlePhase = "choose"; battleTimer = 0; battleTurn = 1;
  battleMessage = `${enemy.name} appeared!`; skipInput = true;
  effects.sound({ sound: "minecraft:entity.player.levelup", x: worldX(enemy.gx), y: ACTOR_Y, z: worldZ(enemy.gz), volume: 0.8, pitch: 0.7 });
  game.log("JRPG_BATTLE_START", enemy.name, `hp=${enemy.hp}`);
}
function beginEnemyTurn(message: string): void { battleMessage = message; battlePhase = "enemy"; battleTimer = ENEMY_ACTION_DELAY; }
function finishVictory(enemy: Enemy): void {
  enemy.alive = false; enemy.hp = 0; render.remove(enemy.id); render.remove(`${enemy.id}_label`);
  player.gold += enemy.gold; player.xp += enemy.xp; mode = "victory"; battleTimer = VICTORY_DELAY;
  battleMessage = `Victory! +${enemy.gold}G +${enemy.xp}XP`;
  effects.particle({ particle: "minecraft:happy_villager", x: worldX(enemy.gx), y: ACTOR_Y + 0.8, z: worldZ(enemy.gz) });
  effects.sound({ sound: "minecraft:ui.toast.challenge_complete", x: worldX(enemy.gx), y: ACTOR_Y, z: worldZ(enemy.gz), volume: 0.8, pitch: 1.0 });
  game.log("JRPG_BATTLE_VICTORY", enemy.name, `gold=${player.gold}`, `xp=${player.xp}`);
}
function playerAttackEnemy(enemy: Enemy): void {
  const variance = (battleTurn % 3) - 1, damage = Math.max(1, player.attack + variance);
  enemy.hp -= damage; battleMessage = `${controllerName} attacks for ${damage}!`;
  effects.particle({ particle: "minecraft:damage_indicator", x: worldX(enemy.gx), y: ACTOR_Y + 0.8, z: worldZ(enemy.gz) });
  effects.sound({ sound: "minecraft:entity.player.attack.strong", x: worldX(enemy.gx), y: ACTOR_Y, z: worldZ(enemy.gz), volume: 0.75, pitch: 1.0 });
  game.log("JRPG_PLAYER_ATTACK", enemy.name, `damage=${damage}`, `enemyHp=${Math.max(0, enemy.hp)}`);
  if (enemy.hp <= 0) { finishVictory(enemy); return; }
  updateEnemyProjection(enemy); beginEnemyTurn(`${enemy.name} is preparing to attack...`);
}
function usePotionInBattle(enemy: Enemy): void {
  if (player.potions <= 0) { battleMessage = "No potions left."; effects.sound({ sound: "minecraft:entity.villager.no", x: worldX(player.gx), y: ACTOR_Y, z: worldZ(player.gz), volume: 0.5, pitch: 1.1 }); return; }
  player.potions -= 1; const before = player.hp; player.hp = Math.min(PLAYER_MAX_HP, player.hp + POTION_HEAL); const healed = player.hp - before;
  effects.particle({ particle: "minecraft:heart", x: worldX(player.gx), y: ACTOR_Y + 1.0, z: worldZ(player.gz) });
  effects.sound({ sound: "minecraft:entity.experience_orb.pickup", x: worldX(player.gx), y: ACTOR_Y, z: worldZ(player.gz), volume: 0.6, pitch: 1.5 });
  game.log("JRPG_USE_POTION", `healed=${healed}`, `remaining=${player.potions}`); beginEnemyTurn(`Potion restored ${healed} HP.`);
}
function executeBattleCommand(): void {
  const enemy = currentEnemy();
  if (!enemy || !enemy.alive || battlePhase !== "choose") return;
  if (battleSelection === 0) { playerAttackEnemy(enemy); return; }
  if (battleSelection === 1) { usePotionInBattle(enemy); return; }
  battleMessage = `Escaped from ${enemy.name}.`; mode = "field"; activeEnemyId = null; battlePhase = "choose";
  effects.sound({ sound: "minecraft:entity.enderman.teleport", x: worldX(player.gx), y: ACTOR_Y, z: worldZ(player.gz), volume: 0.6, pitch: 1.3 });
  game.log("JRPG_BATTLE_RUN", enemy.name);
}
function enemyAttack(): void {
  const enemy = currentEnemy(); if (!enemy || !enemy.alive || mode !== "battle") return;
  const damage = Math.max(1, enemy.attack + ((battleTurn + 1) % 2)); player.hp -= damage; battleMessage = `${enemy.name} hits for ${damage}!`;
  effects.particle({ particle: "minecraft:damage_indicator", x: worldX(player.gx), y: ACTOR_Y + 0.8, z: worldZ(player.gz) });
  effects.sound({ sound: "minecraft:entity.player.hurt", x: worldX(player.gx), y: ACTOR_Y, z: worldZ(player.gz), volume: 0.8, pitch: 0.9 });
  game.log("JRPG_ENEMY_ATTACK", enemy.name, `damage=${damage}`, `playerHp=${Math.max(0, player.hp)}`);
  if (player.hp <= 0) {
    player.hp = 0; mode = "defeat"; battleTimer = DEFEAT_DELAY; battleMessage = "Defeated... Returning to the plaza.";
    effects.sound({ sound: "minecraft:entity.player.death", x: worldX(player.gx), y: ACTOR_Y, z: worldZ(player.gz), volume: 0.7, pitch: 1.0 });
    game.log("JRPG_BATTLE_DEFEAT", enemy.name); return;
  }
  battleTurn += 1; battlePhase = "choose";
}
function recoverFromDefeat(): void {
  const enemy = currentEnemy(); if (enemy && enemy.alive) { enemy.hp = enemy.maxHp; updateEnemyProjection(enemy); }
  activeEnemyId = null; player.hp = PLAYER_MAX_HP; player.gx = PLAYER_START.gx; player.gz = PLAYER_START.gz; player.yaw = 0;
  projectPlayer(); mode = "field"; battlePhase = "choose"; battleMessage = ""; game.log("JRPG_RECOVER", `hp=${player.hp}`);
}
function tryFieldStep(dx: number, dz: number): void {
  const nx = player.gx + dx, nz = player.gz + dz; player.yaw = yawForStep(dx, dz); projectPlayer();
  if (!inBounds(nx, nz)) { effects.sound({ sound: "minecraft:block.stone.hit", x: worldX(player.gx), y: ACTOR_Y, z: worldZ(player.gz), volume: 0.45, pitch: 0.8 }); return; }
  if (nx === GUIDE.gx && nz === GUIDE.gz) { openDialogue(); return; }
  if (nx === MERCHANT.gx && nz === MERCHANT.gz) { openShop(); return; }
  const enemy = enemies.find(candidate => candidate.alive && candidate.gx === nx && candidate.gz === nz);
  if (enemy) { startBattle(enemy); return; }
  player.gx = nx; player.gz = nz; projectPlayer();
  effects.sound({ sound: "minecraft:block.stone.step", x: worldX(player.gx), y: ACTOR_Y, z: worldZ(player.gz), volume: 0.35, pitch: 1.1 });
}
function selector(selected: boolean, label: string): string { return `${selected ? ">" : " "} ${label}`; }
function updateHud(): void {
  if (!controllerId) return;
  if (mode === "field") {
    ui.panel(controllerId, { title: "JRPG Demo", rows: [
      { id: "hp", label: "HP", value: `${player.hp}/${PLAYER_MAX_HP}` },
      { id: "atk", label: "ATK", value: String(player.attack) },
      { id: "gold", label: "Gold", value: `${player.gold}G` },
      { id: "xp", label: "XP", value: String(player.xp) },
      { id: "potions", label: "Potions", value: String(player.potions) },
      { id: "enemies", label: "Slimes", value: String(enemies.filter(enemy => enemy.alive).length) },
      { id: "goal", label: "Goal", value: "Talk / shop / battle" },
      { id: "controls", label: "WASD", value: "move / bump interact" },
    ] }); return;
  }
  if (mode === "dialogue") {
    ui.panel(controllerId, { title: "Conversation", rows: [
      { id: "speaker", label: "NPC", value: "Guide" },
      { id: "line", label: guideLines[dialogueIndex] ?? "..." },
      { id: "next", label: "Jump", value: dialogueIndex + 1 < guideLines.length ? "Next" : "Close" },
      { id: "back", label: "Sneak", value: "Close" },
    ] }); return;
  }
  if (mode === "shop") {
    ui.panel(controllerId, { title: "Merchant", rows: [
      { id: "gold", label: "Gold", value: `${player.gold}G` },
      { id: "potion", label: selector(shopSelection === 0, `Potion ${POTION_PRICE}G`), value: `Owned ${player.potions}` },
      { id: "sword", label: selector(shopSelection === 1, `Iron Sword ${SWORD_PRICE}G`), value: player.swordBought ? "Owned" : "+3 ATK" },
      { id: "leave", label: selector(shopSelection === 2, "Leave") },
      { id: "message", label: shopMessage },
      { id: "controls", label: "W/S + Jump", value: "select / buy" },
      { id: "back", label: "Sneak", value: "leave" },
    ] }); return;
  }
  if (mode === "battle") {
    const enemy = currentEnemy();
    ui.panel(controllerId, { title: "Turn Battle", rows: [
      { id: "enemy", label: enemy?.name ?? "Enemy", value: enemy ? `${Math.max(0, enemy.hp)}/${enemy.maxHp}` : "-" },
      { id: "hp", label: "Hero HP", value: `${player.hp}/${PLAYER_MAX_HP}` },
      { id: "turn", label: "Turn", value: String(battleTurn) },
      { id: "message", label: battleMessage },
      { id: "attack", label: selector(battleSelection === 0, `Attack (${player.attack} ATK)`) },
      { id: "potion", label: selector(battleSelection === 1, `Potion x${player.potions}`) },
      { id: "run", label: selector(battleSelection === 2, "Run") },
      { id: "controls", label: battlePhase === "choose" ? "W/S + Jump" : "Enemy turn...", value: battlePhase === "choose" ? "select / confirm" : "" },
    ] }); return;
  }
  if (mode === "victory") {
    ui.panel(controllerId, { title: "Victory!", rows: [
      { id: "message", label: battleMessage }, { id: "gold", label: "Gold", value: `${player.gold}G` }, { id: "xp", label: "XP", value: String(player.xp) },
    ] }); return;
  }
  if (mode === "defeat") {
    ui.panel(controllerId, { title: "Defeat", rows: [
      { id: "message", label: battleMessage }, { id: "recover", label: "Recovery", value: String(battleTimer) },
    ] });
  }
}

function handleModeInput(p: PlayerInput): void {
  if (mode === "field") { const action = directionAction(p); if (action) tryFieldStep(action.dx, action.dz); return; }
  if (mode === "dialogue") {
    if (p.sneakPressed) { mode = "field"; game.log("JRPG_DIALOGUE_CLOSE", "Guide"); }
    else if (p.jumpPressed) advanceDialogue();
    return;
  }
  if (mode === "shop") {
    if (p.sneakPressed) { leaveShop(); return; }
    const delta = menuDelta(p);
    if (delta !== 0) { shopSelection = (shopSelection + delta + 3) % 3; shopMessage = "Choose an item."; effects.sound({ sound: "minecraft:ui.button.click", x: worldX(MERCHANT.gx), y: ACTOR_Y, z: worldZ(MERCHANT.gz), volume: 0.35, pitch: 1.15 }); }
    else if (p.jumpPressed) buySelectedShopItem();
    return;
  }
  if (mode === "battle" && battlePhase === "choose") {
    const delta = menuDelta(p);
    if (delta !== 0) { battleSelection = (battleSelection + delta + 3) % 3; effects.sound({ sound: "minecraft:ui.button.click", x: worldX(player.gx), y: ACTOR_Y, z: worldZ(player.gz), volume: 0.35, pitch: 1.1 }); }
    else if (p.jumpPressed) executeBattleCommand();
  }
}

// lifecycle
game.onStart(() => {
  mode = "inactive"; controllerId = null; controllerName = ""; cameraAttached = false; resetEnemies();
  startTriggerConsumed.clear(); stopTriggerConsumed.clear();
  previousDirection = { forward: false, backward: false, left: false, right: false };
  game.log("JRPG_READY", "run /function jrpg_demo:start");
});

game.onTick(() => {
  const players = input.players() as PlayerInput[];
  for (const id of Array.from(startTriggerConsumed)) {
    const p = players.find(candidate => candidate.id === id);
    if (!p || !isTrigger(p, START_TRIGGER)) startTriggerConsumed.delete(id);
  }
  for (const id of Array.from(stopTriggerConsumed)) {
    const p = players.find(candidate => candidate.id === id);
    if (!p || !isTrigger(p, STOP_TRIGGER)) stopTriggerConsumed.delete(id);
  }

  const stopRequest = players.find(candidate => isTrigger(candidate, STOP_TRIGGER) && !stopTriggerConsumed.has(candidate.id));
  if (stopRequest) { stopTriggerConsumed.add(stopRequest.id); stopSession(true); return; }
  const startRequest = players.find(candidate => isTrigger(candidate, START_TRIGGER) && !startTriggerConsumed.has(candidate.id));
  if (startRequest) { startTriggerConsumed.add(startRequest.id); startSession(startRequest); }

  if (controllerId && !players.some(candidate => candidate.id === controllerId)) {
    game.log("JRPG_CONTROLLER_DISCONNECTED", controllerName); stopSession(false); return;
  }
  const p = controllerId ? players.find(candidate => candidate.id === controllerId) : undefined;
  if (!p || mode === "inactive") return;

  const cameraState = currentCameraOptions();
  if (!cameraAttached) { camera.attach(p.id, cameraState); cameraAttached = true; }
  else if (!isAtCameraAnchor(p, cameraState)) camera.attach(p.id, cameraState);

  if (mode === "battle" && battlePhase === "enemy") {
    battleTimer -= 1; if (battleTimer <= 0) enemyAttack();
  } else if (mode === "victory") {
    battleTimer -= 1; if (battleTimer <= 0) { activeEnemyId = null; battleMessage = ""; mode = "field"; }
  }
  else if (mode === "defeat") {
    battleTimer -= 1; if (battleTimer <= 0) recoverFromDefeat();
  } else if (skipInput) {
    skipInput = false;
  } else {
    handleModeInput(p);
  }

  rememberDirections(p);
  updateHud();
});
