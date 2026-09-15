import {
  LIMITS, fail, has, isObject, requiredArray, requiredMember, requiredString,
  boundedInteger, finiteNumber, portableId, scale,
} from "./utils.mjs";
import { parseDialogBody, parseDialogText } from "./parse-dialog.mjs";

function boundedText(value, max, path, allowEmpty = false) {
  if (typeof value !== "string") fail(`${path} must be a string`);
  if ((!allowEmpty && value.length < 1) || value.length > max) {
    fail(`${path} must contain ${allowEmpty ? `0..${max}` : `1..${max}`} characters`);
  }
  return value;
}

function parseLegacySelections(spec, fixedPoint, api) {
  const values = requiredArray(spec, "selections", api);
  if (values.length > LIMITS.selections) fail(`${api}.selections exceeds max selection count ${LIMITS.selections}`);
  const ids = new Set();
  return values.map((value, index) => {
    const p = `${api}.selections[${index}]`;
    if (!isObject(value)) fail(`${p} must be an object`);
    const id = portableId(value, p);
    if (ids.has(id)) fail(`${p}.id is duplicated: ${id}`);
    ids.add(id);
    const title = boundedText(requiredMember(value, "title", p), 128, `${p}.title`);
    const body = has(value, "body") ? boundedText(value.body, 1024, `${p}.body`, true) : "";
    const columns = has(value, "columns") ? boundedInteger(value.columns, 1, 4, `${p}.columns`) : 1;
    const options = requiredArray(value, "options", p);
    if (options.length < 1 || options.length > LIMITS.selectionOptions) fail(`${p}.options must contain 1..${LIMITS.selectionOptions} entries`);
    const rawValues = new Set([0, -2147483648]);
    const parsedOptions = options.map((option, optionIndex) => {
      const q = `${p}.options[${optionIndex}]`;
      if (!isObject(option)) fail(`${q} must be an object`);
      const label = boundedText(requiredMember(option, "label", q), 128, `${q}.label`);
      const tooltip = has(option, "tooltip") && option.tooltip !== null ? boundedText(option.tooltip, 256, `${q}.tooltip`, true) : null;
      const logical = finiteNumber(requiredMember(option, "value", q), `${q}.value`);
      const raw = scale(logical, fixedPoint, `${q}.value`);
      if (rawValues.has(raw)) fail(`${q}.value resolves to reserved or duplicate raw result ${raw}`);
      rawValues.add(raw);
      return { label, tooltip, raw };
    });
    const cancelValue = has(value, "cancel") ? requiredMember(value, "cancel", p) : { label: "Cancel", value: -1 };
    if (!isObject(cancelValue)) fail(`${p}.cancel must be an object`);
    const cancelLabel = boundedText(has(cancelValue, "label") ? cancelValue.label : "Cancel", 128, `${p}.cancel.label`);
    const cancelLogical = finiteNumber(has(cancelValue, "value") ? cancelValue.value : -1, `${p}.cancel.value`);
    const cancelRaw = scale(cancelLogical, fixedPoint, `${p}.cancel.value`);
    if (rawValues.has(cancelRaw)) fail(`${p}.cancel.value resolves to reserved or duplicate raw result ${cancelRaw}`);
    return { id, title, body, columns, options: parsedOptions, cancel: { label: cancelLabel, raw: cancelRaw } };
  });
}

function resultButton(value, fixedPoint, path, fallbackLabel, fallbackValue, rawValues) {
  if (value === undefined) value = { label: fallbackLabel, value: fallbackValue };
  if (!isObject(value)) fail(`${path} must be an object`);
  for (const key of Object.keys(value)) if (!["label", "tooltip", "value"].includes(key)) fail(`${path}.${key} is not supported`);
  const label = parseDialogText(has(value, "label") ? value.label : fallbackLabel, `${path}.label`);
  const tooltip = has(value, "tooltip") && value.tooltip !== null ? parseDialogText(value.tooltip, `${path}.tooltip`, { allowEmpty: true }) : null;
  const logical = finiteNumber(has(value, "value") ? value.value : fallbackValue, `${path}.value`);
  const raw = scale(logical, fixedPoint, `${path}.value`);
  if (rawValues.has(raw)) fail(`${path}.value resolves to reserved or duplicate raw result ${raw}`);
  rawValues.add(raw);
  return { label, tooltip, raw };
}

function parseRichSelections(spec, fixedPoint, api) {
  const values = requiredArray(spec, "selections", api);
  if (values.length > LIMITS.selections) fail(`${api}.selections exceeds max selection/confirmation count ${LIMITS.selections}`);
  const ids = new Set();
  return values.map((value, index) => {
    const p = `${api}.selections[${index}]`;
    if (!isObject(value)) fail(`${p} must be an object`);
    const id = portableId(value, p);
    if (ids.has(id)) fail(`${p}.id is duplicated: ${id}`);
    ids.add(id);
    const kind = has(value, "kind") ? requiredString(value, "kind", p) : "selection";
    if (kind !== "selection" && kind !== "confirmation") fail(`${p}.kind must be selection or confirmation`);
    const title = parseDialogText(requiredMember(value, "title", p), `${p}.title`);
    const body = parseDialogBody(has(value, "body") ? value.body : undefined, `${p}.body`);
    const rawValues = new Set([0, -2147483648]);

    if (kind === "confirmation") {
      for (const key of Object.keys(value)) if (!["id", "kind", "title", "body", "yes", "no"].includes(key)) fail(`${p}.${key} is not supported for confirmation`);
      const yes = resultButton(has(value, "yes") ? value.yes : undefined, fixedPoint, `${p}.yes`, "Yes", 1, rawValues);
      const no = resultButton(has(value, "no") ? value.no : undefined, fixedPoint, `${p}.no`, "No", -1, rawValues);
      return { id, kind, title, body, yes, no };
    }

    for (const key of Object.keys(value)) if (!["id", "kind", "title", "body", "columns", "options", "cancel"].includes(key)) fail(`${p}.${key} is not supported for selection`);
    const columns = has(value, "columns") ? boundedInteger(value.columns, 1, 4, `${p}.columns`) : 1;
    const options = requiredArray(value, "options", p);
    if (options.length < 1 || options.length > LIMITS.selectionOptions) fail(`${p}.options must contain 1..${LIMITS.selectionOptions} entries`);
    const parsedOptions = options.map((option, optionIndex) => resultButton(option, fixedPoint, `${p}.options[${optionIndex}]`, `Option ${optionIndex + 1}`, undefined, rawValues));
    const cancel = resultButton(has(value, "cancel") ? value.cancel : undefined, fixedPoint, `${p}.cancel`, "Cancel", -1, rawValues);
    return { id, kind, title, body, columns, options: parsedOptions, cancel };
  });
}

export function parseSelections(spec, version, fixedPoint, api) {
  if (!has(spec, "selections")) return [];
  if (version < 20) fail(`${api}.selections requires portable version 20`);
  return version === 20 ? parseLegacySelections(spec, fixedPoint, api) : parseRichSelections(spec, fixedPoint, api);
}
