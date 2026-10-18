const SHARE_TYPE = "sloop-cycle-share";
const SHARE_VERSION = 1;
const MAX_SHARE_INPUT_LENGTH = 24000;
const MAX_SHARE_TOKEN_LENGTH = 20000;

function planCycle(plan) {
  const cycle = plan?.c ?? plan?.cycle;
  return Array.isArray(cycle) ? cycle : [];
}

function compactShiftSource(item) {
  if (Array.isArray(item)) {
    return {
      kind: item[0] === "o" || item[0] === "off" ? "off" : "work",
      name: item[1],
      start: item[2],
      end: item[3],
      tone: item[4],
      presetId: item[5],
      endDayOffset: item[6]
    };
  }
  return item || {};
}

function shiftPresetId(item) {
  const shift = compactShiftSource(item);
  return String(shift.presetId ?? shift.p ?? "").trim();
}

function presetCoreSignature(preset) {
  return [
    preset.kind,
    preset.start,
    preset.end,
    preset.endDayOffset,
    preset.tone
  ].join("\u0000");
}

export function presetSignature(preset) {
  return [
    presetCoreSignature(preset),
    preset.name
  ].join("\u0000");
}

function binaryFromText(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return binary;
}

function textFromBinary(value) {
  const bytes = Uint8Array.from(value, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Url(value) {
  return btoa(binaryFromText(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  return textFromBinary(atob(padded));
}

export function buildCycleSharePackage(plan, presets) {
  const byId = new Map(
    (Array.isArray(presets) ? presets : [])
      .filter((preset) => preset?.id)
      .map((preset) => [preset.id, preset])
  );
  const referenced = new Map();

  for (const item of planCycle(plan)) {
    const shift = compactShiftSource(item);
    const id = shiftPresetId(item);
    if (!id || referenced.has(id)) continue;
    const preset = byId.get(id);
    referenced.set(id, {
      id,
      kind: shift.kind === "off" ? "off" : "work",
      name: String(shift.name ?? "").slice(0, 28),
      start: String(shift.start ?? ""),
      end: String(shift.end ?? ""),
      endDayOffset: Number(shift.endDayOffset ?? 0),
      tone: String(shift.tone ?? "sky"),
      visibleOnHome: preset?.visibleOnHome !== false
    });
  }

  return {
    v: SHARE_VERSION,
    type: SHARE_TYPE,
    plan,
    presets: [...referenced.values()]
  };
}

export function encodeCycleSharePackage(sharePackage) {
  const token = encodeBase64Url(JSON.stringify(sharePackage));
  if (token.length > MAX_SHARE_TOKEN_LENGTH) {
    throw new Error("share_link_too_large");
  }
  return token;
}

function extractShareToken(input) {
  const value = String(input ?? "").trim();
  if (!value) throw new Error("invalid_share_link");
  if (value.length > MAX_SHARE_INPUT_LENGTH) throw new Error("share_link_too_large");
  if (value.startsWith("{")) return value;

  const match = /(?:[#?&]share=|^)([A-Za-z0-9_-]+)$/.exec(value);
  if (match) return match[1];

  try {
    const url = new URL(value);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const token = hash.get("share") || url.searchParams.get("share");
    if (token) return token;
  } catch {
    // A plain share token is handled by the expression above.
  }
  throw new Error("invalid_share_link");
}

export function decodeCycleShareInput(input) {
  let parsed;
  try {
    const token = extractShareToken(input);
    const json = token.startsWith("{") ? token : decodeBase64Url(token);
    parsed = JSON.parse(json);
  } catch (error) {
    if (error?.message === "share_link_too_large") throw error;
    throw new Error("invalid_share_link");
  }
  if (
    parsed?.type !== SHARE_TYPE ||
    parsed?.v !== SHARE_VERSION ||
    !parsed.plan ||
    !Array.isArray(parsed.presets)
  ) {
    throw new Error("invalid_share_link");
  }
  return parsed;
}

export function matchSharedPresets(sharedPresets, localPresets) {
  const local = Array.isArray(localPresets) ? localPresets : [];
  const bySignature = new Map();
  const byIdAndCore = new Map();
  for (const preset of local) {
    bySignature.set(presetSignature(preset), preset);
    byIdAndCore.set(`${preset.id}\u0000${presetCoreSignature(preset)}`, preset);
  }

  const mapping = new Map();
  const missing = [];
  for (const preset of Array.isArray(sharedPresets) ? sharedPresets : []) {
    if (!preset?.id) continue;
    const matched =
      bySignature.get(presetSignature(preset)) ??
      byIdAndCore.get(`${preset.id}\u0000${presetCoreSignature(preset)}`);
    if (matched) mapping.set(preset.id, matched.id);
    else missing.push(preset);
  }
  return { mapping, missing };
}
