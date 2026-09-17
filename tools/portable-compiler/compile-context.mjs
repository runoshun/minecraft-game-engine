import { fail, hashBase36, hashHex8, LIMITS, PLAYER_INPUT_NAMES } from "./utils.mjs";

export const PLAYER_STATE_SLOT_COUNT = LIMITS.playerStates;
export const PLAYER_HUD_TEMP_COUNT = LIMITS.hudTokens;

function slot(index) { return index.toString(36).padStart(2, "0"); }
export function objectiveName(namespace) { return `mcg${hashHex8(namespace)}`; }
export function persistentObjectiveName(namespace) { return `mcp${hashHex8(namespace)}`; }
export function persistentStorage(namespace) { return `${namespace}:portable_persistent`; }
export function sidebarObjectiveName(namespace) { return `mcgu${hashHex8(namespace)}`; }
export function ownerTag(namespace) { return `mcg_o_${hashBase36(namespace)}`; }
export function projectionTag(namespace, id) { return `mcg_v_${hashBase36(namespace)}_${id}`; }
export function textTag(namespace, id) { return `mcg_t_${hashBase36(namespace)}_${id}`; }
export function actorTag(namespace, id) { return `mcg_a_${hashBase36(namespace)}_${id}`; }
export function interactionTag(namespace, id) { return `mcg_i_${hashBase36(namespace)}_${id}`; }
export function itemDisplayTag(namespace, id) { return `mcg_m_${hashBase36(namespace)}_${id}`; }
export function placeablePendingTag(namespace, id) { return `mcg_pp_${hashBase36(namespace)}_${id}`; }
export function placeableAnchorTag(namespace, id, index) { return `mcg_pa_${hashBase36(namespace)}_${id}_${slot(index)}`; }
export function interactionControllerObjective(namespace, index) { return `mic${hashHex8(namespace)}${slot(index)}`; }
export function fullInteractionControllerObjectiveBank(namespace) {
  const out = [];
  for (let i = 0; i < LIMITS.interactions; i++) out.push(interactionControllerObjective(namespace, i));
  return out;
}
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
export function selectionObjectiveName(namespace, index) { return `mui${hashHex8(namespace)}${slot(index)}`; }
export function fullSelectionObjectiveBank(namespace) {
  const out = [];
  for (let i = 0; i < LIMITS.selections; i++) out.push(selectionObjectiveName(namespace, i));
  return out;
}
export function formTransportObjectiveName(namespace, index) { return `muf${hashHex8(namespace)}${slot(index)}`; }
export function formResultObjectiveName(namespace, index) { return `mur${hashHex8(namespace)}${slot(index)}`; }
export function fullFormTransportObjectiveBank(namespace) {
  const out = [];
  for (let i = 0; i < LIMITS.forms; i++) out.push(formTransportObjectiveName(namespace, i));
  return out;
}
export function fullFormResultObjectiveBank(namespace) {
  const out = [];
  for (let i = 0; i < LIMITS.forms; i++) out.push(formResultObjectiveName(namespace, i));
  return out;
}
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
    this.persistentObjective = persistentObjectiveName(namespace);
    this.functions = new Map();
    this.constants = new Map();
    this.textValues = new Map();
    this.sidebarValues = new Map();
    this.persistentStateHolders = new Map();
    this.persistentSchemaHolders = new Map();
    this.persistentGridKeys = new Map();
    const persistentHashes = new Map();
    const registerPersistent = (key, label) => {
      const hash = hashHex8(key);
      const previous = persistentHashes.get(hash);
      if (previous && previous !== key) fail(`persistent state hash collision between ${previous} and ${key}`);
      persistentHashes.set(hash, key);
      this.persistentStateHolders.set(key, `#p${hash}`);
      this.persistentSchemaHolders.set(key, `#v${hash}`);
    };
    Object.keys(program.persistentState || {}).sort().forEach(name => registerPersistent(`global:${name}`, `global persistent state ${name}`));
    const persistentGridHashes = new Map();
    const registerPersistentGrid = key => {
      const hash = hashHex8(`grid:${key}`);
      const previous = persistentGridHashes.get(hash);
      if (previous && previous !== key) fail(`persistent grid hash collision between ${previous} and ${key}`);
      persistentGridHashes.set(hash, key);
      this.persistentGridKeys.set(key, `g${hash}`);
    };
    [...(program.persistentGrids || [])].map(grid => grid.id).sort().forEach(id => registerPersistentGrid(`global:${id}`));
    this.playerStateObjectives = new Map();
    Object.keys(program.initialPlayerState || {}).sort().forEach((name, index) => this.playerStateObjectives.set(name, playerStateObjective(namespace, index)));
    this.placeableSlots = new Map();
    this.placeableStateSlots = new Map();
    let placeableSlotIndex = 0;
    [...(program.placeables || [])].sort((a, b) => a.id.localeCompare(b.id)).forEach(placeable => {
      Object.keys(placeable.initialState || {}).sort().forEach((name, stateIndex) => this.placeableStateSlots.set(`${placeable.id}:${name}`, stateIndex));
      for (let i = 0; i < placeable.maxInstances; i++) this.placeableSlots.set(`${placeable.id}:${i}`, placeableSlotIndex++);
    });
    this.interactionControllerSlots = new Map();
    [...(program.interactions || [])].map(value => value.id).sort().forEach((id, index) => this.interactionControllerSlots.set(id, index));
    this.selectionObjectives = new Map();
    [...(program.selections || [])].map(selection => selection.id).sort().forEach((id, index) => this.selectionObjectives.set(id, selectionObjectiveName(namespace, index)));
    this.formTransportObjectives = new Map();
    this.formResultObjectives = new Map();
    [...(program.forms || [])].map(form => form.id).sort().forEach((id, index) => {
      this.formTransportObjectives.set(id, formTransportObjectiveName(namespace, index));
      this.formResultObjectives.set(id, formResultObjectiveName(namespace, index));
    });
    this.gridObjectives = new Map();
    [...(program.grids || [])].map(grid => grid.id).sort().forEach((id, index) => this.gridObjectives.set(id, gridObjective(namespace, index)));
    this.rngHolders = new Map();
    [...(program.rngs || [])].map(rng => rng.id).sort().forEach((id, index) => this.rngHolders.set(id, `#r${slot(index)}`));
    this.sessionStateHolders = new Map();
    this.sessionGridObjectives = new Map();
    this.sessionRngHolders = new Map();
    [...(program.sessions || [])].sort((a, b) => a.id.localeCompare(b.id)).forEach((session, sessionIndex) => {
      Object.keys(session.persistentState || {}).sort().forEach(name => registerPersistent(`session:${session.id}:${name}`, `session persistent state ${session.id}.${name}`));
      [...(session.persistentGrids || [])].map(grid => grid.id).sort().forEach(id => registerPersistentGrid(`session:${session.id}:${id}`));
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
    this.nextCondition = 0;
    this.nextConditionScore = 0;
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
  nextConditionFunctionName() { return `condition_${String(this.nextCondition++).padStart(3, "0")}`; }
  nextConditionTemp() { return `#k${this.nextConditionScore++}`; }
  playerStateObjective(name) {
    const objective = this.playerStateObjectives.get(name);
    if (!objective) fail(`unknown player state objective: ${name}`);
    return objective;
  }
  playerInputObjective(name) { return playerInputObjective(this.namespace, name); }
  placeableSlot(id, slotValue) {
    const index = this.placeableSlots.get(`${id}:${slotValue}`);
    if (index === undefined) fail(`unknown placeable slot: ${id}[${slotValue}]`);
    return index;
  }
  placeableActiveHolder(id, slotValue) { return `#pa${slot(this.placeableSlot(id, slotValue))}`; }
  placeableAnchorHolder(id, slotValue, axis) {
    const prefix = ({ x: "px", y: "py", z: "pz", orientation: "po" })[axis];
    if (!prefix) fail(`unknown placeable anchor axis: ${axis}`);
    return `#${prefix}${slot(this.placeableSlot(id, slotValue))}`;
  }
  placeableStateHolder(id, slotValue, name) {
    const stateIndex = this.placeableStateSlots.get(`${id}:${name}`);
    if (stateIndex === undefined) fail(`unknown placeable state holder: ${id}.${name}`);
    return `#ps${slot(this.placeableSlot(id, slotValue))}${slot(stateIndex)}`;
  }
  placeableAnchorTag(id, slotValue) { return placeableAnchorTag(this.namespace, id, this.placeableSlot(id, slotValue)); }
  interactionControllerObjective(id) {
    const index = this.interactionControllerSlots.get(id);
    if (index === undefined) fail(`unknown interaction controller objective: ${id}`);
    return interactionControllerObjective(this.namespace, index);
  }
  interactionControllerGenerationHolder(id) {
    const index = this.interactionControllerSlots.get(id);
    if (index === undefined) fail(`unknown interaction controller generation: ${id}`);
    return `#ic${slot(index)}`;
  }
  selectionObjective(id) {
    const objective = this.selectionObjectives.get(id);
    if (!objective) fail(`unknown selection objective: ${id}`);
    return objective;
  }
  formTransportObjective(id) {
    const objective = this.formTransportObjectives.get(id);
    if (!objective) fail(`unknown form transport objective: ${id}`);
    return objective;
  }
  formResultObjective(id) {
    const objective = this.formResultObjectives.get(id);
    if (!objective) fail(`unknown form result objective: ${id}`);
    return objective;
  }
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
  persistentStateHolder(name, session = null) {
    const key = session ? `session:${session}:${name}` : `global:${name}`;
    const holder = this.persistentStateHolders.get(key);
    if (!holder) fail(`unknown ${session ? `session ${session} ` : ""}persistent state holder: ${name}`);
    return holder;
  }
  persistentSchemaHolder(name, session = null) {
    const key = session ? `session:${session}:${name}` : `global:${name}`;
    const holder = this.persistentSchemaHolders.get(key);
    if (!holder) fail(`unknown ${session ? `session ${session} ` : ""}persistent schema holder: ${name}`);
    return holder;
  }
  persistentGridKey(id, session = null) {
    const key = session ? `session:${session}:${id}` : `global:${id}`;
    const value = this.persistentGridKeys.get(key);
    if (!value) fail(`unknown ${session ? `session ${session} ` : ""}persistent grid storage key: ${id}`);
    return value;
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
      case "placeable_state": return { holder: this.placeableStateHolder(value.placeable, value.slot, value.name), objective: this.objective };
      case "persistent_state": return { holder: this.persistentStateHolder(value.name, value.session ?? null), objective: this.persistentObjective };
      case "session_state": return { holder: this.sessionStateHolder(value.session, value.name), objective: this.objective };
      case "input": return { holder: inputHolder(value.name), objective: this.objective };
      case "player_state": return { holder: "@s", objective: this.playerStateObjective(value.name) };
      case "player_input": return { holder: "@s", objective: this.playerInputObjective(value.name) };
      case "player_selection": return { holder: "@s", objective: this.selectionObjective(value.name) };
      case "player_form": return { holder: "@s", objective: this.formResultObjective(value.name) };
      case "grid_world_ready": return { holder: this.gridWorldReadyHolder(value.name, value.session ?? null), objective: this.objective };
      case "constant": return { holder: this.constantHolder(value.raw), objective: this.objective };
      default: fail(`unknown portable value kind: ${value.kind}`);
    }
  }
}
