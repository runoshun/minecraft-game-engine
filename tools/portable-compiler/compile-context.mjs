import { fail, hashBase36, hashHex8 } from "./utils.mjs";

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

export class CompileContext {
  constructor(namespace, program) {
    this.namespace = namespace;
    this.program = program;
    this.objective = objectiveName(namespace);
    this.functions = new Map();
    this.constants = new Map();
    this.textValues = new Map();
    this.sidebarValues = new Map();
    this.nextConstant = 0;
    this.nextBranch = 0;
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
  nextProjectionTemp() { return `#v${this.nextProjection++}`; }
  nextHudTemp() { return `#h${this.nextHud++}`; }
  nextCollisionTemp() { return `#q${this.nextCollision++}`; }
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
      case "input": return { holder: inputHolder(value.name), objective: this.objective };
      case "constant": return { holder: this.constantHolder(value.raw), objective: this.objective };
      default: fail(`unknown portable value kind: ${value.kind}`);
    }
  }
}
