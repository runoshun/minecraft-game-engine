import { fail, hashBase36, hashHex8, LIMITS, PLAYER_INPUT_NAMES } from "./utils.mjs";

export const PLAYER_STATE_SLOT_COUNT = LIMITS.playerStates;
export const PLAYER_HUD_TEMP_COUNT = LIMITS.hudTokens;

function slot(index) { return index.toString(36).padStart(2, "0"); }
export function objectiveName(namespace) { return `mcg${hashHex8(namespace)}`; }
export function sidebarObjectiveName(namespace) { return `mcgu${hashHex8(namespace)}`; }
export function ownerTag(namespace) { return `mcg_o_${hashBase36(namespace)}`; }
export function projectionTag(namespace, id) { return `mcg_v_${hashBase36(namespace)}_${id}`; }
export function textTag(namespace, id) { return `mcg_t_${hashBase36(namespace)}_${id}`; }
export function actorTag(namespace, id) { return `mcg_a_${hashBase36(namespace)}_${id}`; }
export function cameraTag(namespace, id) { return `mcg_c_${hashBase36(namespace)}_${id}`; }
export function particleTag(namespace, id) { return `mcg_p_${hashBase36(namespace)}_${id}`; }
export function soundTag(namespace, id) { return `mcg_s_${hashBase36(namespace)}_${id}`; }
export function stateHolder(name) { return `#${name}`; }
export function inputHolder(name) { return `#in_${name}`; }
export function sidebarRowHolder(index) { return `r${String(index).padStart(2, "0")}`; }
export function playerStateObjective(namespace, index) { return `mps${hashHex8(namespace)}${slot(index)}`; }
export function playerInputObjective(namespace, name) {
  const index = PLAYER_INPUT_NAMES.indexOf(name);
  if (index < 0) fail(`unknown player input objective: ${name}`);
  return `mpi${hashHex8(namespace)}${slot(index)}`;
}
export function playerHudTempObjective(namespace, index) { return `mph${hashHex8(namespace)}${slot(index)}`; }
export function playerInitObjective(namespace) { return `mpz${hashHex8(namespace)}`; }
export function gridObjective(namespace, index) { return `mgg${hashHex8(namespace)}${slot(index)}`; }
export function fullGridObjectiveBank(namespace) {
  const out = [];
  for (let i = 0; i < LIMITS.grids; i++) out.push(gridObjective(namespace, i));
  return out;
}
export function sessionGridObjective(namespace, index) { return `mgs${hashHex8(namespace)}${slot(index)}`; }
export function fullSessionGridObjectiveBank(namespace) {
  const out = [];
  for (let i = 0; i < LIMITS.sessions * LIMITS.grids; i++) out.push(sessionGridObjective(namespace, i));
  return out;
}
export function runtimeStorage(namespace) { return `${namespace}:portable_runtime`; }
export function fullPlayerObjectiveBank(namespace) {
  const out = [playerInitObjective(namespace)];
  for (let i = 0; i < PLAYER_STATE_SLOT_COUNT; i++) out.push(playerStateObjective(namespace, i));
  for (const name of PLAYER_INPUT_NAMES) out.push(playerInputObjective(namespace, name));
  for (let i = 0; i < PLAYER_HUD_TEMP_COUNT; i++) out.push(playerHudTempObjective(namespace, i));
  return out;
}

export class CompileContext {
  constructor(namespace, program) {
    this.namespace = namespace;
    this.program = program;
    this.objective = objectiveName(namespace);
    this.functions = new Map();
    this.constants = new Map();
    this.textValues = new Map();
    this.sidebarValues = new Map();
    this.playerStateObjectives = new Map();
    Object.keys(program.initialPlayerState || {}).sort().forEach((name, index) => this.playerStateObjectives.set(name, playerStateObjective(namespace, index)));
    this.gridObjectives = new Map();
    [...(program.grids || [])].map(grid => grid.id).sort().forEach((id, index) => this.gridObjectives.set(id, gridObjective(namespace, index)));
    this.rngHolders = new Map();
    [...(program.rngs || [])].map(rng => rng.id).sort().forEach((id, index) => this.rngHolders.set(id, `#r${slot(index)}`));
    this.sessionStateHolders = new Map();
    this.sessionGridObjectives = new Map();
    this.sessionRngHolders = new Map();
    [...(program.sessions || [])].sort((a, b) => a.id.localeCompare(b.id)).forEach((session, sessionIndex) => {
      Object.keys(session.initialState).sort().forEach((name, stateIndex) => {
        this.sessionStateHolders.set(`${session.id}:${name}`, `#ss${slot(sessionIndex)}${slot(stateIndex)}`);
      });
      [...session.grids].map(grid => grid.id).sort().forEach((id, gridIndex) => {
        this.sessionGridObjectives.set(`${session.id}:${id}`, sessionGridObjective(namespace, sessionIndex * LIMITS.grids + gridIndex));
      });
      [...session.rngs].map(rng => rng.id).sort().forEach((id, rngIndex) => {
        this.sessionRngHolders.set(`${session.id}:${id}`, `#sr${slot(sessionIndex)}${slot(rngIndex)}`);
      });
    });
    this.gridWorldSlots = new Map();
    let gridWorldIndex = 0;
    [...(program.gridWorlds || [])].map(value => value.id).sort().forEach(id => this.gridWorldSlots.set(`global:${id}`, gridWorldIndex++));
    [...(program.sessions || [])].sort((a, b) => a.id.localeCompare(b.id)).forEach(session => {
      [...(session.gridWorlds || [])].map(value => value.id).sort().forEach(id => this.gridWorldSlots.set(`session:${session.id}:${id}`, gridWorldIndex++));
    });
    this.nextConstant = 0;
    this.nextBranch = 0;
    this.nextPlayer = 0;
    this.nextProjection = 0;
    this.nextHud = 0;
    this.nextText = 0;
    this.nextSidebar = 0;
    this.nextCollision = 0;
    this.usesNegate = false;
  }
  constantHolder(raw) {
    if (!this.constants.has(raw)) this.constants.set(raw, `#c${this.nextConstant++}`);
    return this.constants.get(raw);
  }
  nextBranchFunctionName() { return `branch_${String(this.nextBranch++).padStart(3, "0")}`; }
  nextPlayerFunctionName() { return `player_${String(this.nextPlayer++).padStart(3, "0")}`; }
  nextProjectionTemp() { return `#v${this.nextProjection++}`; }
  nextHudTemp() { return `#h${this.nextHud++}`; }
  nextCollisionTemp() { return `#q${this.nextCollision++}`; }
  playerStateObjective(name) {
    const objective = this.playerStateObjectives.get(name);
    if (!objective) fail(`unknown player state objective: ${name}`);
    return objective;
  }
  playerInputObjective(name) { return playerInputObjective(this.namespace, name); }
  playerHudTempObjective(index) {
    if (index < 0 || index >= PLAYER_HUD_TEMP_COUNT) fail(`player HUD temp index exceeds ${PLAYER_HUD_TEMP_COUNT}`);
    return playerHudTempObjective(this.namespace, index);
  }
  gridObjective(id) {
    const objective = this.gridObjectives.get(id);
    if (!objective) fail(`unknown grid objective: ${id}`);
    return objective;
  }
  rngHolder(id) {
    const holder = this.rngHolders.get(id);
    if (!holder) fail(`unknown RNG holder: ${id}`);
    return holder;
  }
  sessionStateHolder(session, name) {
    const holder = this.sessionStateHolders.get(`${session}:${name}`);
    if (!holder) fail(`unknown session state holder: ${session}.${name}`);
    return holder;
  }
  sessionGridObjective(session, id) {
    const objective = this.sessionGridObjectives.get(`${session}:${id}`);
    if (!objective) fail(`unknown session grid objective: ${session}.${id}`);
    return objective;
  }
  sessionRngHolder(session, id) {
    const holder = this.sessionRngHolders.get(`${session}:${id}`);
    if (!holder) fail(`unknown session RNG holder: ${session}.${id}`);
    return holder;
  }
  gridWorldSlot(id, session = null) {
    const key = session ? `session:${session}:${id}` : `global:${id}`;
    const index = this.gridWorldSlots.get(key);
    if (index === undefined) fail(`unknown ${session ? `session ${session} ` : ""}grid-world projection: ${id}`);
    return slot(index);
  }
  gridWorldReadyHolder(id, session = null) { return `#w${this.gridWorldSlot(id, session)}r`; }
  gridWorldActiveHolder(id, session = null) { return `#w${this.gridWorldSlot(id, session)}a`; }
  gridWorldCursorHolder(id, session = null) { return `#w${this.gridWorldSlot(id, session)}c`; }
  textValueHolder(id, index) {
    const key = `${id}:${index}`;
    if (!this.textValues.has(key)) this.textValues.set(key, `#t${this.nextText++}`);
    return this.textValues.get(key);
  }
  sidebarValueHolder(sidebar, row, index) {
    const key = `${sidebar}:${row}:${index}`;
    if (!this.sidebarValues.has(key)) this.sidebarValues.set(key, `#u${this.nextSidebar++}`);
    return this.sidebarValues.get(key);
  }
  score(value) {
    switch (value.kind) {
      case "state": return { holder: stateHolder(value.name), objective: this.objective };
      case "session_state": return { holder: this.sessionStateHolder(value.session, value.name), objective: this.objective };
      case "input": return { holder: inputHolder(value.name), objective: this.objective };
      case "player_state": return { holder: "@s", objective: this.playerStateObjective(value.name) };
      case "player_input": return { holder: "@s", objective: this.playerInputObjective(value.name) };
      case "grid_world_ready": return { holder: this.gridWorldReadyHolder(value.name, value.session ?? null), objective: this.objective };
      case "constant": return { holder: this.constantHolder(value.raw), objective: this.objective };
      default: fail(`unknown portable value kind: ${value.kind}`);
    }
  }
}
