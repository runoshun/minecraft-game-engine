import {
  LIMITS, fail, has, isObject, requiredArray, requiredMember,
  boundedInteger, finiteNumber, portableId, scale,
} from "./utils.mjs";

function boundedText(value, max, path, allowEmpty = false) {
  if (typeof value !== "string") fail(`${path} must be a string`);
  if ((!allowEmpty && value.length < 1) || value.length > max) {
    fail(`${path} must contain ${allowEmpty ? `0..${max}` : `1..${max}`} characters`);
  }
  return value;
}

export function parseSelections(spec, version, fixedPoint, api) {
  if (!has(spec, "selections")) return [];
  if (version < 20) fail(`${api}.selections requires portable version 20`);
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
    if (options.length < 1 || options.length > LIMITS.selectionOptions) {
      fail(`${p}.options must contain 1..${LIMITS.selectionOptions} entries`);
    }
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
