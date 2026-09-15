import { fullFormResultObjectiveBank, fullFormTransportObjectiveBank } from "./compile-context.mjs";
import { dialogBodyJson } from "./parse-dialog.mjs";
import {
  FORM_RESULT_IDLE_RAW, FORM_TRANSPORT_CANCEL_RAW, FORM_TRANSPORT_IDLE_RAW, FORM_TRANSPORT_PENDING_RAW,
  SELECTION_IDLE_RAW,
} from "./dialog-state.mjs";

export function formDialogResource(namespace, id) { return `${namespace}:portable/form/${id}`; }

function staticAction(label, command, tooltip = null) {
  const value = { label, action: { type: "minecraft:run_command", command } };
  if (tooltip !== null) value.tooltip = tooltip;
  return value;
}

function dynamicAction(label, template, tooltip = null) {
  const value = { label, action: { type: "minecraft:dynamic/run_command", template } };
  if (tooltip !== null) value.tooltip = tooltip;
  return value;
}

function inputJson(form) {
  const input = form.input;
  if (input.type === "boolean") {
    return {
      type: "minecraft:boolean", key: "v", label: input.label, initial: input.initial,
      on_true: "1", on_false: "0",
    };
  }
  if (input.type === "option") {
    return {
      type: "minecraft:single_option", key: "v", label: input.label,
      label_visible: input.labelVisible, width: input.width,
      options: input.options.map((option, index) => ({ id: String(index), display: option.label, ...(index === input.initialIndex ? { initial: true } : {}) })),
    };
  }
  return {
    type: "minecraft:number_range", key: "v", label: input.label, width: input.width,
    start: input.start, end: input.end, step: input.step, initial: input.initial,
  };
}

export function formDialogJson(form, ctx) {
  const transport = ctx.formTransportObjective(form.id);
  const value = {
    type: "minecraft:multi_action",
    title: form.title,
    can_close_with_escape: true,
    pause: false,
    after_action: "close",
    inputs: [inputJson(form)],
    columns: 1,
    actions: [dynamicAction(form.submit.label, `trigger ${transport} set $(v)`, form.submit.tooltip)],
    exit_action: staticAction(form.cancel.label, `trigger ${transport} set ${FORM_TRANSPORT_CANCEL_RAW}`, form.cancel.tooltip),
  };
  if (form.body.length) value.body = dialogBodyJson(form.body);
  return value;
}

export function compileFormLoad(program, lines, ctx) {
  if (program.version < 21) return;
  for (const objective of fullFormTransportObjectiveBank(ctx.namespace)) lines.push(`scoreboard objectives remove ${objective}`);
  for (const objective of fullFormResultObjectiveBank(ctx.namespace)) lines.push(`scoreboard objectives remove ${objective}`);
  for (const form of program.forms) {
    lines.push(`scoreboard objectives add ${ctx.formTransportObjective(form.id)} trigger`);
    lines.push(`scoreboard objectives add ${ctx.formResultObjective(form.id)} dummy`);
  }
}

export function formPlayerInitLines(program, ctx) {
  if (program.version < 21) return [];
  const lines = [];
  for (const form of program.forms) {
    lines.push(`scoreboard players set @s ${ctx.formTransportObjective(form.id)} ${FORM_TRANSPORT_IDLE_RAW}`);
    lines.push(`scoreboard players set @s ${ctx.formResultObjective(form.id)} ${FORM_RESULT_IDLE_RAW}`);
  }
  return lines;
}

function validTransportCondition(form, ctx) {
  const transport = ctx.formTransportObjective(form.id);
  if (form.input.type === "boolean") return `if score @s ${transport} matches 0..1`;
  if (form.input.type === "option") return `if score @s ${transport} matches 0..${form.input.options.length - 1}`;
  return `if score @s ${transport} matches ${form.input.start}..${form.input.end}`;
}

function ensureResolveFunction(form, ctx) {
  const name = `form_${form.id}_resolve`;
  if (ctx.functions.has(name)) return name;
  const transport = ctx.formTransportObjective(form.id), result = ctx.formResultObjective(form.id), body = [];
  body.push(`execute if score @s ${transport} matches ${FORM_TRANSPORT_CANCEL_RAW} run scoreboard players set @s ${result} ${form.cancel.raw}`);
  body.push(`execute if score @s ${transport} matches ${FORM_TRANSPORT_CANCEL_RAW} run scoreboard players set @s ${transport} ${FORM_TRANSPORT_IDLE_RAW}`);
  body.push(`execute if score @s ${transport} matches ${FORM_TRANSPORT_IDLE_RAW} run return 0`);

  if (form.input.type === "boolean") {
    body.push(`execute if score @s ${transport} matches 0 run scoreboard players set @s ${result} ${form.input.falseRaw}`);
    body.push(`execute if score @s ${transport} matches 1 run scoreboard players set @s ${result} ${form.input.trueRaw}`);
  } else if (form.input.type === "option") {
    form.input.options.forEach((option, index) => body.push(`execute if score @s ${transport} matches ${index} run scoreboard players set @s ${result} ${option.raw}`));
  } else {
    const valid = validTransportCondition(form, ctx);
    let aligned = "";
    if (form.input.step !== 1) {
      const scratch = "#form_step";
      body.push(`scoreboard players operation ${scratch} ${ctx.objective} = @s ${transport}`);
      body.push(`scoreboard players operation ${scratch} ${ctx.objective} -= ${ctx.constantHolder(form.input.start)} ${ctx.objective}`);
      body.push(`scoreboard players operation ${scratch} ${ctx.objective} %= ${ctx.constantHolder(form.input.step)} ${ctx.objective}`);
      aligned = ` if score ${scratch} ${ctx.objective} matches 0`;
    }
    body.push(`execute ${valid}${aligned} run scoreboard players operation @s ${result} = @s ${transport}`);
    if (ctx.program.fixedPoint !== 1) body.push(`execute ${valid}${aligned} run scoreboard players operation @s ${result} *= ${ctx.constantHolder(ctx.program.fixedPoint)} ${ctx.objective}`);
  }

  const valid = form.input.type === "range"
    ? `${validTransportCondition(form, ctx)}${form.input.step === 1 ? "" : ` if score #form_step ${ctx.objective} matches 0`}`
    : validTransportCondition(form, ctx);
  body.push(`execute ${valid} run scoreboard players set @s ${transport} ${FORM_TRANSPORT_IDLE_RAW}`);
  body.push(`execute unless score @s ${transport} matches ${FORM_TRANSPORT_IDLE_RAW} run scoreboard players set @s ${transport} ${FORM_TRANSPORT_PENDING_RAW}`);
  body.push(`execute if score @s ${transport} matches ${FORM_TRANSPORT_PENDING_RAW} run scoreboard players enable @s ${transport}`);
  ctx.functions.set(name, body);
  return name;
}

export function compileFormTickPrelude(program, lines, ctx) {
  if (program.version < 21) return;
  for (const form of program.forms) {
    const transport = ctx.formTransportObjective(form.id), result = ctx.formResultObjective(form.id);
    const fn = ensureResolveFunction(form, ctx);
    lines.push(`execute as @a if score @s ${result} matches ${FORM_RESULT_IDLE_RAW} unless score @s ${transport} matches ${FORM_TRANSPORT_IDLE_RAW} unless score @s ${transport} matches ${FORM_TRANSPORT_PENDING_RAW} run function ${ctx.namespace}:portable/${fn}`);
  }
}

function ensureOpenFunction(form, ctx) {
  const name = `form_${form.id}_open`;
  if (ctx.functions.has(name)) return name;
  const transport = ctx.formTransportObjective(form.id), result = ctx.formResultObjective(form.id), body = [];
  for (const selection of ctx.program.selections) {
    body.push(`execute if score @s ${ctx.selectionObjective(selection.id)} matches 0 run scoreboard players set @s ${ctx.selectionObjective(selection.id)} ${SELECTION_IDLE_RAW}`);
  }
  for (const other of ctx.program.forms) {
    if (other.id === form.id) continue;
    const otherTransport = ctx.formTransportObjective(other.id), otherResult = ctx.formResultObjective(other.id);
    body.push(`execute if score @s ${otherResult} matches ${FORM_RESULT_IDLE_RAW} if score @s ${otherTransport} matches ${FORM_TRANSPORT_PENDING_RAW} run scoreboard players set @s ${otherTransport} ${FORM_TRANSPORT_IDLE_RAW}`);
  }
  body.push(`scoreboard players set @s ${result} ${FORM_RESULT_IDLE_RAW}`);
  body.push(`scoreboard players set @s ${transport} ${FORM_TRANSPORT_PENDING_RAW}`);
  body.push(`scoreboard players enable @s ${transport}`);
  body.push(`dialog show @s ${formDialogResource(ctx.namespace, form.id)}`);
  ctx.functions.set(name, body);
  return name;
}

export function compileFormAction(action, lines, ctx) {
  if (action.op !== "form_open" && action.op !== "form_clear") return false;
  const form = ctx.program.forms.find(value => value.id === action.form);
  if (!form) throw new Error(`unknown compiled form: ${action.form}`);
  const transport = ctx.formTransportObjective(form.id), result = ctx.formResultObjective(form.id);
  if (action.op === "form_open") {
    lines.push(`execute if score @s ${result} matches ${FORM_RESULT_IDLE_RAW} if score @s ${transport} matches ${FORM_TRANSPORT_IDLE_RAW} run function ${ctx.namespace}:portable/${ensureOpenFunction(form, ctx)}`);
  } else {
    lines.push(`execute if score @s ${result} matches ${FORM_RESULT_IDLE_RAW} if score @s ${transport} matches ${FORM_TRANSPORT_PENDING_RAW} run dialog clear @s`);
    lines.push(`scoreboard players set @s ${result} ${FORM_RESULT_IDLE_RAW}`);
    lines.push(`scoreboard players set @s ${transport} ${FORM_TRANSPORT_IDLE_RAW}`);
  }
  return true;
}

export function formCleanupLines(program, ctx) {
  if (program.version < 21) return [];
  const lines = [];
  for (const form of program.forms) {
    lines.push(`execute as @a if score @s ${ctx.formResultObjective(form.id)} matches ${FORM_RESULT_IDLE_RAW} if score @s ${ctx.formTransportObjective(form.id)} matches ${FORM_TRANSPORT_PENDING_RAW} run dialog clear @s`);
  }
  for (const objective of fullFormTransportObjectiveBank(ctx.namespace)) lines.push(`scoreboard objectives remove ${objective}`);
  for (const objective of fullFormResultObjectiveBank(ctx.namespace)) lines.push(`scoreboard objectives remove ${objective}`);
  return lines;
}
