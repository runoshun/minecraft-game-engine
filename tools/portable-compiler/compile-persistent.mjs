import { persistentStorage, runtimeStorage, stateHolder } from "./compile-context.mjs";

const FULL_SCORE_RANGE = "-2147483648..2147483647";

function scalarDeclarations(program) {
  const values = [];
  for (const [name, spec] of Object.entries(program.persistentState || {}).sort(([a], [b]) => a.localeCompare(b))) {
    values.push({ session: null, name, ...spec });
  }
  for (const session of [...(program.sessions || [])].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const [name, spec] of Object.entries(session.persistentState || {}).sort(([a], [b]) => a.localeCompare(b))) {
      values.push({ session: session.id, name, ...spec });
    }
  }
  return values;
}

function gridDeclarations(program) {
  const values = [];
  for (const grid of [...(program.persistentGrids || [])].sort((a, b) => a.id.localeCompare(b.id))) {
    values.push({ session: null, ...grid });
  }
  for (const session of [...(program.sessions || [])].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const grid of [...(session.persistentGrids || [])].sort((a, b) => a.id.localeCompare(b.id))) {
      values.push({ session: session.id, ...grid });
    }
  }
  return values;
}

function intArray(raw, count) { return `[I;${Array(count).fill(raw).join(",")}]`; }
function gridPath(value, ctx) { return `grids.${ctx.persistentGridKey(value.id, value.session)}`; }
function gridDefault(value) {
  return `{schema:${value.schema},width:${value.width},height:${value.height},cells:${intArray(value.initialRaw, value.width * value.height)}}`;
}
function gridPrefix(value) {
  return value.session ? `session_${value.session}_persistent_grid_${value.id}` : `persistent_grid_${value.id}`;
}
function findSession(program, id) {
  const value = (program.sessions || []).find(candidate => candidate.id === id);
  if (!value) throw new Error(`unknown compiled session: ${id}`);
  return value;
}
function findGrid(program, id, sessionId = null) {
  const values = sessionId ? findSession(program, sessionId).persistentGrids : program.persistentGrids;
  const value = (values || []).find(candidate => candidate.id === id);
  if (!value) throw new Error(`unknown compiled ${sessionId ? `session ${sessionId} ` : ""}persistent grid: ${id}`);
  return { session: sessionId, ...value };
}
function operation(targetHolder, targetObjective, operator, value, ctx) {
  const source = ctx.score(value);
  return `scoreboard players operation ${targetHolder} ${targetObjective} ${operator} ${source.holder} ${source.objective}`;
}
function assignValue(lines, holder, value, ctx) {
  if (value.kind === "constant") lines.push(`scoreboard players set ${holder} ${ctx.objective} ${value.raw}`);
  else lines.push(operation(holder, ctx.objective, "=", value, ctx));
}
function assignInteger(lines, holder, value, ctx) {
  assignValue(lines, holder, value, ctx);
  if (ctx.program.fixedPoint !== 1) lines.push(`scoreboard players operation ${holder} ${ctx.objective} /= ${ctx.constantHolder(ctx.program.fixedPoint)} ${ctx.objective}`);
}
function targetHolder(action, ctx) {
  return action.session ? ctx.sessionStateHolder(action.session, action.target) : stateHolder(action.target);
}
function macroPath(ctx) { return `${runtimeStorage(ctx.namespace)} macro`; }

function ensureIndexFunctions(value, ctx) {
  const prefix = gridPrefix(value), storage = persistentStorage(ctx.namespace), path = gridPath(value, ctx);
  const getMacro = `${prefix}_get_macro`, setMacro = `${prefix}_set_macro`, getAt = `${prefix}_get_at`, setAt = `${prefix}_set_at`;
  if (!ctx.functions.has(getMacro)) ctx.functions.set(getMacro, [`$execute store result score #gv ${ctx.objective} run data get storage ${storage} ${path}.cells[$(i)] 1`]);
  if (!ctx.functions.has(setMacro)) ctx.functions.set(setMacro, [`$execute store result storage ${storage} ${path}.cells[$(i)] int 1 run scoreboard players get #gv ${ctx.objective}`]);
  if (!ctx.functions.has(getAt)) ctx.functions.set(getAt, [
    `scoreboard players operation #gi ${ctx.objective} = #gz ${ctx.objective}`,
    `scoreboard players operation #gi ${ctx.objective} *= ${ctx.constantHolder(value.width)} ${ctx.objective}`,
    `scoreboard players operation #gi ${ctx.objective} += #gx ${ctx.objective}`,
    `execute store result storage ${runtimeStorage(ctx.namespace)} macro.i int 1 run scoreboard players get #gi ${ctx.objective}`,
    `function ${ctx.namespace}:portable/${getMacro} with storage ${macroPath(ctx)}`,
  ]);
  if (!ctx.functions.has(setAt)) ctx.functions.set(setAt, [
    `scoreboard players operation #gi ${ctx.objective} = #gz ${ctx.objective}`,
    `scoreboard players operation #gi ${ctx.objective} *= ${ctx.constantHolder(value.width)} ${ctx.objective}`,
    `scoreboard players operation #gi ${ctx.objective} += #gx ${ctx.objective}`,
    `execute store result storage ${runtimeStorage(ctx.namespace)} macro.i int 1 run scoreboard players get #gi ${ctx.objective}`,
    `function ${ctx.namespace}:portable/${setMacro} with storage ${macroPath(ctx)}`,
  ]);
  return { getAt, setAt };
}

function ensureFillFunction(value, ctx) {
  const name = `${gridPrefix(value)}_fill`;
  if (!ctx.functions.has(name)) {
    const storage = persistentStorage(ctx.namespace), path = gridPath(value, ctx), body = [];
    for (let i = 0; i < value.width * value.height; i++) {
      body.push(`execute store result storage ${storage} ${path}.cells[${i}] int 1 run scoreboard players get #gv ${ctx.objective}`);
    }
    ctx.functions.set(name, body);
  }
  return name;
}

function ensureRectFunctions(value, ctx) {
  const prefix = gridPrefix(value), name = `${prefix}_rect_prepare`;
  if (ctx.functions.has(name)) return name;
  const storage = persistentStorage(ctx.namespace), path = gridPath(value, ctx);
  const body = [
    `scoreboard players operation #gex ${ctx.objective} = #gx ${ctx.objective}`,
    `scoreboard players operation #gex ${ctx.objective} += #gw ${ctx.objective}`,
    `scoreboard players remove #gex ${ctx.objective} 1`,
    `scoreboard players operation #gez ${ctx.objective} = #gz ${ctx.objective}`,
    `scoreboard players operation #gez ${ctx.objective} += #gh ${ctx.objective}`,
    `scoreboard players remove #gez ${ctx.objective} 1`,
  ];
  for (let z = 0; z < value.height; z++) {
    const zHolder = ctx.constantHolder(z), row = `${prefix}_rect_row_${String(z).padStart(2, "0")}`, rowBody = [];
    for (let x = 0; x < value.width; x++) {
      const xHolder = ctx.constantHolder(x), index = z * value.width + x;
      rowBody.push(`execute if score #gx ${ctx.objective} <= ${xHolder} ${ctx.objective} if score #gex ${ctx.objective} >= ${xHolder} ${ctx.objective} run execute store result storage ${storage} ${path}.cells[${index}] int 1 run scoreboard players get #gv ${ctx.objective}`);
    }
    ctx.functions.set(row, rowBody);
    body.push(`execute if score #gz ${ctx.objective} <= ${zHolder} ${ctx.objective} if score #gez ${ctx.objective} >= ${zHolder} ${ctx.objective} run function ${ctx.namespace}:portable/${row}`);
  }
  ctx.functions.set(name, body);
  return name;
}

export function hasPersistentData(program) {
  return scalarDeclarations(program).length > 0 || gridDeclarations(program).length > 0;
}

export function compilePersistentLoad(program, lines, ctx) {
  const scalars = scalarDeclarations(program), grids = gridDeclarations(program), storage = persistentStorage(ctx.namespace);
  if (scalars.length) {
    lines.push(`execute unless data storage ${storage} {objective_ready:1b} run scoreboard objectives add ${ctx.persistentObjective} dummy`);
    lines.push(`execute unless data storage ${storage} {objective_ready:1b} run data modify storage ${storage} objective_ready set value 1b`);
    for (const value of scalars) {
      const holder = ctx.persistentStateHolder(value.name, value.session), schemaHolder = ctx.persistentSchemaHolder(value.name, value.session);
      lines.push(`execute unless score ${holder} ${ctx.persistentObjective} matches ${FULL_SCORE_RANGE} run scoreboard players set ${holder} ${ctx.persistentObjective} ${value.initialRaw}`);
      if (value.onSchemaMismatch === "reset") lines.push(`execute unless score ${schemaHolder} ${ctx.persistentObjective} matches ${value.schema} run scoreboard players set ${holder} ${ctx.persistentObjective} ${value.initialRaw}`);
      lines.push(`scoreboard players set ${schemaHolder} ${ctx.persistentObjective} ${value.schema}`);
    }
  }
  for (const value of grids) {
    const path = gridPath(value, ctx), fallback = gridDefault(value), cells = intArray(value.initialRaw, value.width * value.height);
    lines.push(`execute unless data storage ${storage} ${path} run data modify storage ${storage} ${path} set value ${fallback}`);
    lines.push(`execute unless data storage ${storage} ${path}{width:${value.width},height:${value.height}} run data modify storage ${storage} ${path} set value ${fallback}`);
    if (value.onSchemaMismatch === "reset") lines.push(`execute unless data storage ${storage} ${path}{schema:${value.schema}} run data modify storage ${storage} ${path}.cells set value ${cells}`);
    lines.push(`data modify storage ${storage} ${path}.schema set value ${value.schema}`);
  }
}

export function compilePersistentGridAction(action, lines, ctx) {
  if (!action.op.startsWith("persistent_grid_")) return false;
  const value = findGrid(ctx.program, action.grid, action.session ?? null), storage = persistentStorage(ctx.namespace), path = gridPath(value, ctx);
  if (action.op === "persistent_grid_fill") {
    if (action.value.kind === "constant") lines.push(`data modify storage ${storage} ${path}.cells set value ${intArray(action.value.raw, value.width * value.height)}`);
    else {
      assignValue(lines, "#gv", action.value, ctx);
      lines.push(`function ${ctx.namespace}:portable/${ensureFillFunction(value, ctx)}`);
    }
    return true;
  }
  assignInteger(lines, "#gx", action.x, ctx);
  assignInteger(lines, "#gz", action.z, ctx);
  if (action.op === "persistent_grid_get") {
    const { getAt } = ensureIndexFunctions(value, ctx);
    lines.push(`scoreboard players set #gv ${ctx.objective} ${value.outsideRaw}`);
    lines.push(`execute if score #gx ${ctx.objective} matches 0..${value.width - 1} if score #gz ${ctx.objective} matches 0..${value.height - 1} run function ${ctx.namespace}:portable/${getAt}`);
    lines.push(`scoreboard players operation ${targetHolder(action, ctx)} ${ctx.objective} = #gv ${ctx.objective}`);
    return true;
  }
  if (action.op === "persistent_grid_set") {
    const { setAt } = ensureIndexFunctions(value, ctx);
    assignValue(lines, "#gv", action.value, ctx);
    lines.push(`execute if score #gx ${ctx.objective} matches 0..${value.width - 1} if score #gz ${ctx.objective} matches 0..${value.height - 1} run function ${ctx.namespace}:portable/${setAt}`);
    return true;
  }
  if (action.op === "persistent_grid_fill_rect") {
    assignInteger(lines, "#gw", action.width, ctx);
    assignInteger(lines, "#gh", action.height, ctx);
    assignValue(lines, "#gv", action.value, ctx);
    lines.push(`execute if score #gw ${ctx.objective} matches 1.. if score #gh ${ctx.objective} matches 1.. run function ${ctx.namespace}:portable/${ensureRectFunctions(value, ctx)}`);
    return true;
  }
  return false;
}

export function persistentResetLines(program, ctx) {
  const lines = [];
  for (const value of scalarDeclarations(program)) {
    lines.push(`scoreboard players set ${ctx.persistentStateHolder(value.name, value.session)} ${ctx.persistentObjective} ${value.initialRaw}`);
    lines.push(`scoreboard players set ${ctx.persistentSchemaHolder(value.name, value.session)} ${ctx.persistentObjective} ${value.schema}`);
  }
  for (const value of gridDeclarations(program)) lines.push(`data modify storage ${persistentStorage(ctx.namespace)} ${gridPath(value, ctx)} set value ${gridDefault(value)}`);
  if (!lines.length) lines.push("# no persistent declarations");
  return lines;
}

export function persistentPurgeLines(program, ctx) {
  const scalars = scalarDeclarations(program), grids = gridDeclarations(program), lines = [];
  if (scalars.length) {
    lines.push(`scoreboard objectives remove ${ctx.persistentObjective}`);
    lines.push(`data remove storage ${persistentStorage(ctx.namespace)} objective_ready`);
  }
  if (grids.length) lines.push(`data remove storage ${persistentStorage(ctx.namespace)} grids`);
  if (!lines.length) lines.push("# no persistent declarations");
  return lines;
}
