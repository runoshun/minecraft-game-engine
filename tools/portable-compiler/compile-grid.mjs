import {
  fullGridObjectiveBank, fullSessionGridObjectiveBank, runtimeStorage, stateHolder,
} from "./compile-context.mjs";
import { floorDiv } from "./utils.mjs";

const RNG_MULTIPLIER = 1664525;
const RNG_INCREMENT = 1013904223;

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
  if (ctx.program.fixedPoint !== 1) {
    lines.push(`scoreboard players operation ${holder} ${ctx.objective} /= ${ctx.constantHolder(ctx.program.fixedPoint)} ${ctx.objective}`);
  }
}

function session(program, id) {
  const value = (program.sessions || []).find(candidate => candidate.id === id);
  if (!value) throw new Error(`unknown compiled session: ${id}`);
  return value;
}

function grid(program, id, sessionId = null) {
  const values = sessionId ? session(program, sessionId).grids : program.grids;
  const value = values.find(candidate => candidate.id === id);
  if (!value) throw new Error(`unknown compiled ${sessionId ? `session ${sessionId} ` : ""}grid: ${id}`);
  return value;
}

function rng(program, id, sessionId = null) {
  const values = sessionId ? session(program, sessionId).rngs : program.rngs;
  const value = values.find(candidate => candidate.id === id);
  if (!value) throw new Error(`unknown compiled ${sessionId ? `session ${sessionId} ` : ""}RNG: ${id}`);
  return value;
}

function scopedGridObjective(ctx, sessionId, id) {
  return sessionId ? ctx.sessionGridObjective(sessionId, id) : ctx.gridObjective(id);
}

function scopedRngHolder(ctx, sessionId, id) {
  return sessionId ? ctx.sessionRngHolder(sessionId, id) : ctx.rngHolder(id);
}

function scopedStateHolder(ctx, sessionId, name) {
  return sessionId ? ctx.sessionStateHolder(sessionId, name) : stateHolder(name);
}

function gridFunctionPrefix(sessionId, id) {
  return sessionId ? `session_${sessionId}_grid_${id}` : `grid_${id}`;
}

function macroPath(ctx) { return `${runtimeStorage(ctx.namespace)} macro`; }

function ensureGridFunctions(gridValue, ctx, sessionId = null) {
  const id = gridValue.id;
  const objective = scopedGridObjective(ctx, sessionId, id);
  const prefix = gridFunctionPrefix(sessionId, id);
  const getMacro = `${prefix}_get_macro`;
  const setMacro = `${prefix}_set_macro`;
  const getAt = `${prefix}_get_at`;
  const setAt = `${prefix}_set_at`;
  const fill = `${prefix}_fill`;
  const rectPrepare = `${prefix}_rect_prepare`;

  if (!ctx.functions.has(getMacro)) {
    ctx.functions.set(getMacro, [`$scoreboard players operation #gv ${ctx.objective} = g$(i) ${objective}`]);
  }
  if (!ctx.functions.has(setMacro)) {
    ctx.functions.set(setMacro, [`$scoreboard players operation g$(i) ${objective} = #gv ${ctx.objective}`]);
  }
  if (!ctx.functions.has(getAt)) {
    ctx.functions.set(getAt, [
      `scoreboard players operation #gi ${ctx.objective} = #gz ${ctx.objective}`,
      `scoreboard players operation #gi ${ctx.objective} *= ${ctx.constantHolder(gridValue.width)} ${ctx.objective}`,
      `scoreboard players operation #gi ${ctx.objective} += #gx ${ctx.objective}`,
      `execute store result storage ${runtimeStorage(ctx.namespace)} macro.i int 1 run scoreboard players get #gi ${ctx.objective}`,
      `function ${ctx.namespace}:portable/${getMacro} with storage ${macroPath(ctx)}`,
    ]);
  }
  if (!ctx.functions.has(setAt)) {
    ctx.functions.set(setAt, [
      `scoreboard players operation #gi ${ctx.objective} = #gz ${ctx.objective}`,
      `scoreboard players operation #gi ${ctx.objective} *= ${ctx.constantHolder(gridValue.width)} ${ctx.objective}`,
      `scoreboard players operation #gi ${ctx.objective} += #gx ${ctx.objective}`,
      `execute store result storage ${runtimeStorage(ctx.namespace)} macro.i int 1 run scoreboard players get #gi ${ctx.objective}`,
      `function ${ctx.namespace}:portable/${setMacro} with storage ${macroPath(ctx)}`,
    ]);
  }
  if (!ctx.functions.has(fill)) {
    const body = [];
    for (let i = 0; i < gridValue.width * gridValue.height; i++) {
      body.push(`scoreboard players operation g${i} ${objective} = #gv ${ctx.objective}`);
    }
    ctx.functions.set(fill, body);
  }
  if (!ctx.functions.has(rectPrepare)) {
    const body = [
      `scoreboard players operation #gex ${ctx.objective} = #gx ${ctx.objective}`,
      `scoreboard players operation #gex ${ctx.objective} += #gw ${ctx.objective}`,
      `scoreboard players remove #gex ${ctx.objective} 1`,
      `scoreboard players operation #gez ${ctx.objective} = #gz ${ctx.objective}`,
      `scoreboard players operation #gez ${ctx.objective} += #gh ${ctx.objective}`,
      `scoreboard players remove #gez ${ctx.objective} 1`,
    ];
    for (let z = 0; z < gridValue.height; z++) {
      const zHolder = ctx.constantHolder(z);
      const row = `${prefix}_rect_row_${String(z).padStart(2, "0")}`;
      const rowBody = [];
      for (let x = 0; x < gridValue.width; x++) {
        const xHolder = ctx.constantHolder(x);
        const index = z * gridValue.width + x;
        rowBody.push(`execute if score #gx ${ctx.objective} <= ${xHolder} ${ctx.objective} if score #gex ${ctx.objective} >= ${xHolder} ${ctx.objective} run scoreboard players operation g${index} ${objective} = #gv ${ctx.objective}`);
      }
      ctx.functions.set(row, rowBody);
      body.push(`execute if score #gz ${ctx.objective} <= ${zHolder} ${ctx.objective} if score #gez ${ctx.objective} >= ${zHolder} ${ctx.objective} run function ${ctx.namespace}:portable/${row}`);
    }
    ctx.functions.set(rectPrepare, body);
  }
}

export function compileGridAction(action, lines, ctx) {
  if (action.op.startsWith("grid_") && action.op !== "grid_world_rebuild") {
    const gridValue = grid(ctx.program, action.grid, action.session);
    ensureGridFunctions(gridValue, ctx, action.session);
    const prefix = gridFunctionPrefix(action.session, gridValue.id);
    if (action.op === "grid_fill") {
      assignValue(lines, "#gv", action.value, ctx);
      lines.push(`function ${ctx.namespace}:portable/${prefix}_fill`);
      return true;
    }

    assignInteger(lines, "#gx", action.x, ctx);
    assignInteger(lines, "#gz", action.z, ctx);
    if (action.op === "grid_get") {
      lines.push(`scoreboard players set #gv ${ctx.objective} ${gridValue.outsideRaw}`);
      lines.push(`execute if score #gx ${ctx.objective} matches 0..${gridValue.width - 1} if score #gz ${ctx.objective} matches 0..${gridValue.height - 1} run function ${ctx.namespace}:portable/${prefix}_get_at`);
      lines.push(`scoreboard players operation ${scopedStateHolder(ctx, action.session, action.target)} ${ctx.objective} = #gv ${ctx.objective}`);
      return true;
    }
    if (action.op === "grid_set") {
      assignValue(lines, "#gv", action.value, ctx);
      lines.push(`execute if score #gx ${ctx.objective} matches 0..${gridValue.width - 1} if score #gz ${ctx.objective} matches 0..${gridValue.height - 1} run function ${ctx.namespace}:portable/${prefix}_set_at`);
      return true;
    }
    if (action.op === "grid_fill_rect") {
      assignInteger(lines, "#gw", action.width, ctx);
      assignInteger(lines, "#gh", action.height, ctx);
      assignValue(lines, "#gv", action.value, ctx);
      lines.push(`execute if score #gw ${ctx.objective} matches 1.. if score #gh ${ctx.objective} matches 1.. run function ${ctx.namespace}:portable/${prefix}_rect_prepare`);
      return true;
    }
  }

  if (action.op === "rng_reset") {
    const value = rng(ctx.program, action.rng, action.session);
    lines.push(`scoreboard players set ${scopedRngHolder(ctx, action.session, value.id)} ${ctx.objective} ${value.seed}`);
    return true;
  }
  if (action.op === "rng_int") {
    const value = rng(ctx.program, action.rng, action.session);
    const holder = scopedRngHolder(ctx, action.session, value.id);
    lines.push(`scoreboard players operation ${holder} ${ctx.objective} *= ${ctx.constantHolder(RNG_MULTIPLIER)} ${ctx.objective}`);
    lines.push(`scoreboard players operation ${holder} ${ctx.objective} += ${ctx.constantHolder(RNG_INCREMENT)} ${ctx.objective}`);
    lines.push(`scoreboard players operation #rr ${ctx.objective} = ${holder} ${ctx.objective}`);
    lines.push(`scoreboard players operation #rr ${ctx.objective} %= ${ctx.constantHolder(action.range)} ${ctx.objective}`);
    if (action.min !== 0) lines.push(`scoreboard players operation #rr ${ctx.objective} += ${ctx.constantHolder(action.min)} ${ctx.objective}`);
    if (ctx.program.fixedPoint !== 1) lines.push(`scoreboard players operation #rr ${ctx.objective} *= ${ctx.constantHolder(ctx.program.fixedPoint)} ${ctx.objective}`);
    lines.push(`scoreboard players operation ${scopedStateHolder(ctx, action.session, action.target)} ${ctx.objective} = #rr ${ctx.objective}`);
    return true;
  }
  if (action.op === "grid_world_rebuild") {
    lines.push(`scoreboard players set ${ctx.gridWorldCursorHolder(action.target)} ${ctx.objective} 0`);
    lines.push(`scoreboard players set ${ctx.gridWorldReadyHolder(action.target)} ${ctx.objective} 0`);
    lines.push(`scoreboard players set ${ctx.gridWorldActiveHolder(action.target)} ${ctx.objective} 1`);
    return true;
  }
  return false;
}

export function compileGridLoad(program, lines, ctx) {
  if (program.version < 13) return;
  for (const objective of fullGridObjectiveBank(ctx.namespace)) lines.push(`scoreboard objectives remove ${objective}`);
  if (program.version >= 15) for (const objective of fullSessionGridObjectiveBank(ctx.namespace)) lines.push(`scoreboard objectives remove ${objective}`);
  lines.push(`data remove storage ${runtimeStorage(ctx.namespace)} macro`);

  for (const gridValue of program.grids) {
    const objective = ctx.gridObjective(gridValue.id);
    lines.push(`scoreboard objectives add ${objective} dummy`);
    const body = [];
    for (let i = 0; i < gridValue.width * gridValue.height; i++) body.push(`scoreboard players set g${i} ${objective} ${gridValue.initialRaw}`);
    const name = `grid_${gridValue.id}_init`;
    ctx.functions.set(name, body);
    lines.push(`function ${ctx.namespace}:portable/${name}`);
  }
  for (const value of program.rngs) lines.push(`scoreboard players set ${ctx.rngHolder(value.id)} ${ctx.objective} ${value.seed}`);
  if (program.version >= 15) {
    for (const sessionValue of program.sessions) {
      for (const gridValue of sessionValue.grids) {
        const objective = ctx.sessionGridObjective(sessionValue.id, gridValue.id);
        lines.push(`scoreboard objectives add ${objective} dummy`);
        const body = [];
        for (let i = 0; i < gridValue.width * gridValue.height; i++) body.push(`scoreboard players set g${i} ${objective} ${gridValue.initialRaw}`);
        const name = `${gridFunctionPrefix(sessionValue.id, gridValue.id)}_init`;
        ctx.functions.set(name, body);
        lines.push(`function ${ctx.namespace}:portable/${name}`);
      }
      for (const value of sessionValue.rngs) lines.push(`scoreboard players set ${ctx.sessionRngHolder(sessionValue.id, value.id)} ${ctx.objective} ${value.seed}`);
    }
  }
  for (const projection of program.gridWorlds) {
    lines.push(`scoreboard players set ${ctx.gridWorldReadyHolder(projection.id)} ${ctx.objective} 0`);
    lines.push(`scoreboard players set ${ctx.gridWorldActiveHolder(projection.id)} ${ctx.objective} 0`);
    lines.push(`scoreboard players set ${ctx.gridWorldCursorHolder(projection.id)} ${ctx.objective} 0`);
  }
}

export function gridCleanupLines(program, ctx) {
  if (program.version < 13) return [];
  const lines = [];
  for (const objective of fullGridObjectiveBank(ctx.namespace)) lines.push(`scoreboard objectives remove ${objective}`);
  if (program.version >= 15) for (const objective of fullSessionGridObjectiveBank(ctx.namespace)) lines.push(`scoreboard objectives remove ${objective}`);
  lines.push(`data remove storage ${runtimeStorage(ctx.namespace)} macro`);
  return lines;
}

function chunkIsOwned(program, projection, blockX, blockZ) {
  if (!program.ownership || program.ownership.dimension !== projection.dimension) return false;
  const cx = floorDiv(blockX, 16), cz = floorDiv(blockZ, 16);
  return cx >= floorDiv(program.ownership.minX, 16) && cx <= floorDiv(program.ownership.maxX, 16)
    && cz >= floorDiv(program.ownership.minZ, 16) && cz <= floorDiv(program.ownership.maxZ, 16);
}

function projectionSliceBody(program, projection, gridValue, start, end, ctx) {
  const objective = ctx.gridObjective(gridValue.id);
  const byChunk = new Map();
  for (let index = start; index < end; index++) {
    const x = projection.originX + (index % gridValue.width);
    const z = projection.originZ + Math.floor(index / gridValue.width);
    const key = `${floorDiv(x, 16)},${floorDiv(z, 16)}`;
    if (!byChunk.has(key)) byChunk.set(key, []);
    byChunk.get(key).push({ index, x, z });
  }

  const body = [];
  for (const cells of byChunk.values()) {
    const first = cells[0], bx = floorDiv(first.x, 16) * 16, bz = floorDiv(first.z, 16) * 16;
    const owned = chunkIsOwned(program, projection, first.x, first.z);
    if (!owned) body.push(`execute in ${projection.dimension} run forceload add ${bx} ${bz}`);
    for (const cell of cells) {
      for (const palette of projection.palette) {
        body.push(`execute in ${projection.dimension} if score g${cell.index} ${objective} matches ${palette.raw} run setblock ${cell.x} ${projection.y} ${cell.z} ${palette.block}`);
      }
    }
    if (!owned) body.push(`execute in ${projection.dimension} run forceload remove ${bx} ${bz}`);
  }
  if (end >= gridValue.width * gridValue.height) {
    body.push(`scoreboard players set ${ctx.gridWorldCursorHolder(projection.id)} ${ctx.objective} ${gridValue.width * gridValue.height}`);
    body.push(`scoreboard players set ${ctx.gridWorldActiveHolder(projection.id)} ${ctx.objective} 0`);
    body.push(`scoreboard players set ${ctx.gridWorldReadyHolder(projection.id)} ${ctx.objective} ${program.fixedPoint}`);
  } else {
    body.push(`scoreboard players set ${ctx.gridWorldCursorHolder(projection.id)} ${ctx.objective} ${end}`);
  }
  return body;
}

export function compileGridWorldServices(program, tick, ctx) {
  if (program.version < 13) return;
  if (!program.gridWorlds.length) return;
  tick.push(`scoreboard players set #ws ${ctx.objective} 0`);
  for (const projection of program.gridWorlds) {
    const gridValue = grid(program, projection.grid);
    const total = gridValue.width * gridValue.height;
    let sliceIndex = 0;
    for (let start = 0; start < total; start += projection.cellsPerTick) {
      const end = Math.min(total, start + projection.cellsPerTick);
      const name = `grid_world_${projection.id}_slice_${String(sliceIndex++).padStart(3, "0")}`;
      const body = [`scoreboard players set #ws ${ctx.objective} 1`, ...projectionSliceBody(program, projection, gridValue, start, end, ctx)];
      ctx.functions.set(name, body);
      tick.push(`execute if score #ws ${ctx.objective} matches 0 if score ${ctx.gridWorldActiveHolder(projection.id)} ${ctx.objective} matches 1 if score ${ctx.gridWorldCursorHolder(projection.id)} ${ctx.objective} matches ${start} run function ${ctx.namespace}:portable/${name}`);
    }
  }
}
