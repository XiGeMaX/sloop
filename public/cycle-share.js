const SHARE_TYPE = "sloop-cycle-share";
const SHARE_VERSION = 1;
const SHARE_WIRE_VERSION = 1;
const COMPRESSED_SHARE_PREFIX = "z.";
const MAX_SHARE_INPUT_LENGTH = 24000;
const MAX_SHARE_TOKEN_LENGTH = 20000;
const MAX_DECODED_SHARE_LENGTH = 100000;

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
      endDayOffset: item[6],
      note: item[7]
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

function binaryFromBytes(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return binary;
}

function encodeBase64UrlBytes(bytes) {
  return btoa(binaryFromBytes(bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64UrlBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function compressText(value) {
  const stream = new Blob([new TextEncoder().encode(value)])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompressText(value, maximumBytes) {
  const stream = new Blob([value])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      totalBytes += chunk.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => {});
        throw new Error("share_link_too_large");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function packSharePackage(sharePackage) {
  const presets = Array.isArray(sharePackage.presets) ? sharePackage.presets : [];
  return [
    SHARE_WIRE_VERSION,
    sharePackage.plan,
    presets.map((preset) => [
      String(preset?.id ?? ""),
      preset?.kind === "off" ? "o" : "w",
      String(preset?.name ?? "").slice(0, 28),
      String(preset?.start ?? ""),
      String(preset?.end ?? ""),
      Number(preset?.endDayOffset ?? 0),
      String(preset?.tone ?? "sky"),
      preset?.visibleOnHome === false ? 0 : 1
    ])
  ];
}

function unpackSharePackage(value) {
  if (!Array.isArray(value) || value[0] !== SHARE_WIRE_VERSION) {
    throw new Error("invalid_share_link");
  }
  const presets = Array.isArray(value[2]) ? value[2] : [];
  return {
    v: SHARE_VERSION,
    type: SHARE_TYPE,
    plan: value[1],
    presets: presets.map((preset) =>
      Array.isArray(preset)
        ? {
            id: String(preset[0] ?? ""),
            kind: preset[1] === "o" ? "off" : "work",
            name: String(preset[2] ?? ""),
            start: String(preset[3] ?? ""),
            end: String(preset[4] ?? ""),
            endDayOffset: Number(preset[5] ?? 0),
            tone: String(preset[6] ?? "sky"),
            visibleOnHome: preset[7] !== 0
          }
        : preset
    )
  };
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

export async function encodeCycleSharePackage(sharePackage) {
  if (typeof CompressionStream !== "function") {
    throw new Error("share_compression_unavailable");
  }

  let compressed;
  try {
    compressed = await compressText(JSON.stringify(packSharePackage(sharePackage)));
  } catch {
    throw new Error("share_compression_unavailable");
  }
  const token = `${COMPRESSED_SHARE_PREFIX}${encodeBase64UrlBytes(compressed)}`;
  if (token.length > MAX_SHARE_TOKEN_LENGTH) throw new Error("share_link_too_large");
  return token;
}

function extractShareToken(input) {
  const value = String(input ?? "").trim();
  if (!value) throw new Error("invalid_share_link");
  if (value.length > MAX_SHARE_INPUT_LENGTH) throw new Error("share_link_too_large");
  const match = /(?:[#?&]share=|^)([A-Za-z0-9_.-]+)$/.exec(value);
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

export async function decodeCycleShareInput(input) {
  let parsed;
  try {
    const token = extractShareToken(input);
    if (!token.startsWith(COMPRESSED_SHARE_PREFIX)) {
      throw new Error("invalid_share_link");
    }
    if (typeof DecompressionStream !== "function") {
      throw new Error("share_compression_unavailable");
    }
    const json = await decompressText(
      decodeBase64UrlBytes(token.slice(COMPRESSED_SHARE_PREFIX.length)),
      MAX_DECODED_SHARE_LENGTH
    );
    parsed = unpackSharePackage(JSON.parse(json));
  } catch (error) {
    if (
      error?.message === "share_link_too_large" ||
      error?.message === "share_compression_unavailable"
    ) {
      throw error;
    }
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
