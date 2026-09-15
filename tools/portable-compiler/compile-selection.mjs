import { fullSelectionObjectiveBank } from "./compile-context.mjs";
import { dialogBodyJson } from "./parse-dialog.mjs";
import { FORM_RESULT_IDLE_RAW, FORM_TRANSPORT_IDLE_RAW, FORM_TRANSPORT_PENDING_RAW, SELECTION_IDLE_RAW } from "./dialog-state.mjs";

export { SELECTION_IDLE_RAW } from "./dialog-state.mjs";

export function selectionDialogResource(namespace, id) {
  return `${namespace}:portable/selection/${id}`;
}

function runCommandAction(label, command, tooltip = null) {
  const value = {
    label,
    action: { type: "minecraft:run_command", command },
  };
  if (tooltip !== null) value.tooltip = tooltip;
  return value;
}

export function selectionDialogJson(selection, ctx) {
  const objective = ctx.selectionObjective(selection.id);
  if (selection.kind === "confirmation") {
    const value = {
      type: "minecraft:confirmation",
      title: selection.title,
      can_close_with_escape: true,
      pause: false,
      after_action: "close",
      yes: runCommandAction(selection.yes.label, `trigger ${objective} set ${selection.yes.raw}`, selection.yes.tooltip),
      no: runCommandAction(selection.no.label, `trigger ${objective} set ${selection.no.raw}`, selection.no.tooltip),
    };
    if (selection.body.length) value.body = dialogBodyJson(selection.body);
    return value;
  }

  const value = {
    type: "minecraft:multi_action",
    title: selection.title,
    can_close_with_escape: true,
    pause: false,
    after_action: "close",
    columns: selection.columns,
    actions: selection.options.map(option => runCommandAction(option.label, `trigger ${objective} set ${option.raw}`, option.tooltip)),
    exit_action: runCommandAction(selection.cancel.label, `trigger ${objective} set ${selection.cancel.raw}`, selection.cancel.tooltip ?? null),
  };
  if (Array.isArray(selection.body)) {
    if (selection.body.length) value.body = dialogBodyJson(selection.body);
  } else if (selection.body.length) {
    value.body = [{ type: "minecraft:plain_message", contents: selection.body, width: 320 }];
  }
  return value;
}

export function compileSelectionLoad(program, lines, ctx) {
  if (program.version < 20) return;
  for (const objective of fullSelectionObjectiveBank(ctx.namespace)) lines.push(`scoreboard objectives remove ${objective}`);
  for (const selection of program.selections) lines.push(`scoreboard objectives add ${ctx.selectionObjective(selection.id)} trigger`);
}

export function selectionPlayerInitLines(program, ctx) {
  if (program.version < 20) return [];
  return program.selections.map(selection => `scoreboard players set @s ${ctx.selectionObjective(selection.id)} ${SELECTION_IDLE_RAW}`);
}

function ensureOpenFunction(selection, ctx) {
  const name = `selection_${selection.id}_open`;
  if (ctx.functions.has(name)) return name;
  const objective = ctx.selectionObjective(selection.id);
  const body = [];
  for (const other of ctx.program.selections) {
    if (other.id === selection.id) continue;
    body.push(`execute if score @s ${ctx.selectionObjective(other.id)} matches 0 run scoreboard players set @s ${ctx.selectionObjective(other.id)} ${SELECTION_IDLE_RAW}`);
  }
  if (ctx.program.version >= 21) {
    for (const form of ctx.program.forms) {
      const result = ctx.formResultObjective(form.id), transport = ctx.formTransportObjective(form.id);
      body.push(`execute if score @s ${result} matches ${FORM_RESULT_IDLE_RAW} if score @s ${transport} matches ${FORM_TRANSPORT_PENDING_RAW} run scoreboard players set @s ${transport} ${FORM_TRANSPORT_IDLE_RAW}`);
    }
  }
  body.push(`scoreboard players set @s ${objective} 0`);
  body.push(`scoreboard players enable @s ${objective}`);
  body.push(`dialog show @s ${selectionDialogResource(ctx.namespace, selection.id)}`);
  ctx.functions.set(name, body);
  return name;
}

export function compileSelectionAction(action, lines, ctx) {
  if (action.op !== "selection_open" && action.op !== "selection_clear") return false;
  const selection = ctx.program.selections.find(value => value.id === action.selection);
  if (!selection) throw new Error(`unknown compiled selection: ${action.selection}`);
  const objective = ctx.selectionObjective(selection.id);
  if (action.op === "selection_open") {
    lines.push(`execute if score @s ${objective} matches ${SELECTION_IDLE_RAW} run function ${ctx.namespace}:portable/${ensureOpenFunction(selection, ctx)}`);
  } else {
    lines.push(`execute if score @s ${objective} matches 0 run dialog clear @s`);
    lines.push(`scoreboard players set @s ${objective} ${SELECTION_IDLE_RAW}`);
  }
  return true;
}

export function selectionCleanupLines(program, ctx) {
  if (program.version < 20) return [];
  const lines = [];
  for (const selection of program.selections) {
    lines.push(`execute as @a if score @s ${ctx.selectionObjective(selection.id)} matches 0 run dialog clear @s`);
  }
  for (const objective of fullSelectionObjectiveBank(ctx.namespace)) lines.push(`scoreboard objectives remove ${objective}`);
  return lines;
}
