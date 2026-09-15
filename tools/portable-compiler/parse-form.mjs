import {
  LIMITS, fail, has, isObject, requiredArray, requiredMember, requiredString,
  boundedInteger, finiteNumber, memberBoolean, portableId, scale,
} from "./utils.mjs";
import { parseDialogBody, parseDialogText } from "./parse-dialog.mjs";
import { FORM_RESULT_IDLE_RAW, FORM_TRANSPORT_CANCEL_RAW, FORM_TRANSPORT_PENDING_RAW } from "./dialog-state.mjs";

function scaledResult(value, fixedPoint, path) {
  const logical = finiteNumber(value, path);
  const raw = scale(logical, fixedPoint, path);
  if (raw === FORM_RESULT_IDLE_RAW) fail(`${path} resolves to reserved form-result raw value ${FORM_RESULT_IDLE_RAW}`);
  return { logical, raw };
}

function button(value, path, fallbackLabel) {
  if (value === undefined) return { label: fallbackLabel, tooltip: null };
  if (!isObject(value)) fail(`${path} must be an object`);
  const out = {
    label: parseDialogText(has(value, "label") ? value.label : fallbackLabel, `${path}.label`),
    tooltip: has(value, "tooltip") ? parseDialogText(value.tooltip, `${path}.tooltip`, { allowEmpty: true }) : null,
  };
  for (const key of Object.keys(value)) if (!["label", "tooltip", "value"].includes(key)) fail(`${path}.${key} is not supported`);
  return out;
}

export function parseForms(spec, version, fixedPoint, api) {
  if (!has(spec, "forms")) return [];
  if (version < 21) fail(`${api}.forms requires portable version 21`);
  const values = requiredArray(spec, "forms", api);
  if (values.length > LIMITS.forms) fail(`${api}.forms exceeds max form count ${LIMITS.forms}`);
  const ids = new Set();
  return values.map((value, index) => {
    const p = `${api}.forms[${index}]`;
    if (!isObject(value)) fail(`${p} must be an object`);
    const id = portableId(value, p);
    if (ids.has(id)) fail(`${p}.id is duplicated: ${id}`);
    ids.add(id);
    for (const key of Object.keys(value)) if (!["id", "title", "body", "input", "submit", "cancel"].includes(key)) fail(`${p}.${key} is not supported`);

    const title = parseDialogText(requiredMember(value, "title", p), `${p}.title`);
    const body = parseDialogBody(has(value, "body") ? value.body : undefined, `${p}.body`);
    const inputValue = requiredMember(value, "input", p);
    if (!isObject(inputValue)) fail(`${p}.input must be an object`);
    const type = requiredString(inputValue, "type", `${p}.input`);
    let input;
    const resultRaws = new Set();

    if (type === "boolean") {
      for (const key of Object.keys(inputValue)) if (!["type", "label", "initial", "trueValue", "falseValue"].includes(key)) fail(`${p}.input.${key} is not supported`);
      const trueResult = scaledResult(has(inputValue, "trueValue") ? inputValue.trueValue : 1, fixedPoint, `${p}.input.trueValue`);
      const falseResult = scaledResult(has(inputValue, "falseValue") ? inputValue.falseValue : 0, fixedPoint, `${p}.input.falseValue`);
      if (trueResult.raw === falseResult.raw) fail(`${p}.input trueValue and falseValue must resolve to distinct values`);
      resultRaws.add(trueResult.raw); resultRaws.add(falseResult.raw);
      input = {
        type,
        label: parseDialogText(requiredMember(inputValue, "label", `${p}.input`), `${p}.input.label`),
        initial: has(inputValue, "initial") ? memberBoolean(inputValue, "initial", false, `${p}.input`) : false,
        trueRaw: trueResult.raw,
        falseRaw: falseResult.raw,
      };
    } else if (type === "option") {
      for (const key of Object.keys(inputValue)) if (!["type", "label", "options", "initial", "width", "labelVisible"].includes(key)) fail(`${p}.input.${key} is not supported`);
      const rawOptions = requiredArray(inputValue, "options", `${p}.input`);
      if (rawOptions.length < 1 || rawOptions.length > LIMITS.formOptions) fail(`${p}.input.options must contain 1..${LIMITS.formOptions} entries`);
      const options = rawOptions.map((option, optionIndex) => {
        const q = `${p}.input.options[${optionIndex}]`;
        if (!isObject(option)) fail(`${q} must be an object`);
        for (const key of Object.keys(option)) if (!["label", "value"].includes(key)) fail(`${q}.${key} is not supported`);
        const result = scaledResult(requiredMember(option, "value", q), fixedPoint, `${q}.value`);
        if (resultRaws.has(result.raw)) fail(`${q}.value resolves to duplicate raw result ${result.raw}`);
        resultRaws.add(result.raw);
        return { label: parseDialogText(requiredMember(option, "label", q), `${q}.label`), logical: result.logical, raw: result.raw };
      });
      let initialIndex = 0;
      if (has(inputValue, "initial")) {
        const initial = finiteNumber(inputValue.initial, `${p}.input.initial`);
        initialIndex = options.findIndex(option => option.logical === initial);
        if (initialIndex < 0) fail(`${p}.input.initial must equal one declared option value`);
      }
      input = {
        type,
        label: parseDialogText(requiredMember(inputValue, "label", `${p}.input`), `${p}.input.label`),
        options,
        initialIndex,
        width: has(inputValue, "width") ? boundedInteger(inputValue.width, 1, 1024, `${p}.input.width`) : 200,
        labelVisible: has(inputValue, "labelVisible") ? memberBoolean(inputValue, "labelVisible", true, `${p}.input`) : true,
      };
    } else if (type === "range") {
      for (const key of Object.keys(inputValue)) if (!["type", "label", "start", "end", "step", "initial", "width"].includes(key)) fail(`${p}.input.${key} is not supported`);
      const start = boundedInteger(requiredMember(inputValue, "start", `${p}.input`), -2147483646, 2147483646, `${p}.input.start`);
      const end = boundedInteger(requiredMember(inputValue, "end", `${p}.input`), -2147483646, 2147483646, `${p}.input.end`);
      if (start > end) fail(`${p}.input requires start <= end`);
      const step = has(inputValue, "step") ? boundedInteger(inputValue.step, 1, 2147483646, `${p}.input.step`) : 1;
      const initial = has(inputValue, "initial") ? boundedInteger(inputValue.initial, start, end, `${p}.input.initial`) : start;
      if ((initial - start) % step !== 0) fail(`${p}.input.initial must align to start + N * step`);
      scale(start, fixedPoint, `${p}.input.start`); scale(end, fixedPoint, `${p}.input.end`);
      if (scale(start, fixedPoint, `${p}.input.start`) === FORM_RESULT_IDLE_RAW || scale(end, fixedPoint, `${p}.input.end`) === FORM_RESULT_IDLE_RAW) fail(`${p}.input range collides with reserved result sentinel`);
      input = {
        type,
        label: parseDialogText(requiredMember(inputValue, "label", `${p}.input`), `${p}.input.label`),
        start, end, step, initial,
        width: has(inputValue, "width") ? boundedInteger(inputValue.width, 1, 1024, `${p}.input.width`) : 200,
      };
    } else if (type === "text") {
      fail(`${p}.input.type text is not portable in v21: vanilla permission-0 trigger transport cannot return arbitrary strings`);
    } else {
      fail(`${p}.input.type must be boolean, option, or range`);
    }

    const submit = button(has(value, "submit") ? value.submit : undefined, `${p}.submit`, "Submit");
    const cancelValue = has(value, "cancel") ? value.cancel : undefined;
    const cancelButton = button(cancelValue, `${p}.cancel`, "Cancel");
    const cancelResult = scaledResult(cancelValue && has(cancelValue, "value") ? cancelValue.value : -1, fixedPoint, `${p}.cancel.value`);
    if (resultRaws.has(cancelResult.raw)) fail(`${p}.cancel.value collides with an input result`);
    if (input.type === "range" && cancelResult.logical >= input.start && cancelResult.logical <= input.end && Number.isInteger(cancelResult.logical) && (cancelResult.logical - input.start) % input.step === 0) {
      fail(`${p}.cancel.value collides with a possible range result`);
    }

    return { id, title, body, input, submit, cancel: { ...cancelButton, raw: cancelResult.raw } };
  });
}
