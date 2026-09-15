import {
  RESOURCE_ID, fail, has, isObject, requiredMember, requiredString,
  boundedInteger, memberBoolean,
} from "./utils.mjs";

const NAMED_COLORS = new Set([
  "black", "dark_blue", "dark_green", "dark_aqua", "dark_red", "dark_purple", "gold", "gray",
  "dark_gray", "blue", "green", "aqua", "red", "light_purple", "yellow", "white",
]);
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const SPAN_KEYS = new Set(["text", "color", "bold", "italic", "underlined", "strikethrough"]);

function rejectUnknown(value, allowed, path) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${path}.${key} is not supported`);
}

function literal(value, path, allowEmpty) {
  if (typeof value !== "string") fail(`${path} must be a string`);
  if ((!allowEmpty && value.length < 1) || value.length > 256) {
    fail(`${path} must contain ${allowEmpty ? "0..256" : "1..256"} characters`);
  }
  return value;
}

function parseSpan(value, path, allowEmpty) {
  if (typeof value === "string") return literal(value, path, allowEmpty);
  if (!isObject(value)) fail(`${path} must be a string or rich-text span`);
  rejectUnknown(value, SPAN_KEYS, path);
  const out = { text: literal(requiredMember(value, "text", path), `${path}.text`, allowEmpty) };
  if (has(value, "color")) {
    if (typeof value.color !== "string" || (!NAMED_COLORS.has(value.color) && !HEX_COLOR.test(value.color))) {
      fail(`${path}.color must be a standard Minecraft color name or #RRGGBB`);
    }
    out.color = value.color;
  }
  for (const key of ["bold", "italic", "underlined", "strikethrough"]) {
    if (has(value, key)) out[key] = memberBoolean(value, key, false, path);
  }
  return out;
}

export function parseDialogText(value, path, { allowEmpty = false } = {}) {
  if (Array.isArray(value)) {
    if (value.length < 1 || value.length > 32) fail(`${path} must contain 1..32 rich-text spans`);
    return value.map((span, index) => parseSpan(span, `${path}[${index}]`, allowEmpty));
  }
  return parseSpan(value, path, allowEmpty);
}

export function parseDialogBody(value, path) {
  if (value === undefined || value === null || value === "") return [];
  if (typeof value === "string") {
    if (value.length > 1024) fail(`${path} string must contain 0..1024 characters`);
    return value.length ? [{ kind: "text", text: value, width: 320 }] : [];
  }
  if (!Array.isArray(value)) fail(`${path} must be a string or body-element array`);
  if (value.length > 16) fail(`${path} exceeds max dialog body element count 16`);
  return value.map((entry, index) => {
    const p = `${path}[${index}]`;
    if (!isObject(entry)) fail(`${p} must be an object`);
    const type = requiredString(entry, "type", p);
    if (type === "text") {
      rejectUnknown(entry, new Set(["type", "text", "width"]), p);
      return {
        kind: "text",
        text: parseDialogText(requiredMember(entry, "text", p), `${p}.text`, { allowEmpty: true }),
        width: has(entry, "width") ? boundedInteger(entry.width, 1, 1024, `${p}.width`) : 320,
      };
    }
    if (type === "item") {
      rejectUnknown(entry, new Set(["type", "item", "count", "description", "descriptionWidth", "showTooltip", "showDecoration", "width", "height"]), p);
      const item = requiredString(entry, "item", p);
      if (!RESOURCE_ID.test(item)) fail(`${p}.item is not a valid resource id: ${item}`);
      const out = {
        kind: "item",
        item,
        count: has(entry, "count") ? boundedInteger(entry.count, 1, 99, `${p}.count`) : 1,
        showTooltip: has(entry, "showTooltip") ? memberBoolean(entry, "showTooltip", true, p) : true,
        showDecoration: has(entry, "showDecoration") ? memberBoolean(entry, "showDecoration", true, p) : true,
        width: has(entry, "width") ? boundedInteger(entry.width, 1, 256, `${p}.width`) : 16,
        height: has(entry, "height") ? boundedInteger(entry.height, 1, 256, `${p}.height`) : 16,
      };
      if (has(entry, "description")) {
        out.description = parseDialogText(entry.description, `${p}.description`, { allowEmpty: true });
        out.descriptionWidth = has(entry, "descriptionWidth") ? boundedInteger(entry.descriptionWidth, 1, 1024, `${p}.descriptionWidth`) : 200;
      } else if (has(entry, "descriptionWidth")) {
        fail(`${p}.descriptionWidth requires description`);
      }
      return out;
    }
    fail(`${p}.type must be text or item`);
  });
}

export function dialogBodyJson(body) {
  return body.map(entry => {
    if (entry.kind === "text") return { type: "minecraft:plain_message", contents: entry.text, width: entry.width };
    const value = {
      type: "minecraft:item",
      item: { id: entry.item, count: entry.count },
      show_tooltip: entry.showTooltip,
      show_decoration: entry.showDecoration,
      width: entry.width,
      height: entry.height,
    };
    if (entry.description !== undefined) value.description = { contents: entry.description, width: entry.descriptionWidth };
    return value;
  });
}
