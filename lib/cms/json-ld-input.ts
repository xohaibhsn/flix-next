const MAX_JSON_LD_CHARS = 50_000;

export type JsonLdDocument = Record<string, unknown> | Record<string, unknown>[];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function extractJsonLdPayload(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true as const, payload: "" };

  const scriptMatch = trimmed.match(/^<script\b([^>]*)>([\s\S]*?)<\/script>\s*$/i);
  if (!scriptMatch) return { ok: true as const, payload: trimmed };

  const attrs = scriptMatch[1] || "";
  const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.trim().toLowerCase() || "";
  if (type && type !== "application/ld+json") {
    return {
      ok: false as const,
      error: "Invalid JSON-LD: if you paste a script tag, it must use type=\"application/ld+json\".",
    };
  }
  if (/\bsrc\s*=/i.test(attrs)) {
    return { ok: false as const, error: "Invalid JSON-LD: external script sources are not allowed." };
  }
  return { ok: true as const, payload: scriptMatch[2].trim() };
}

export function parseJsonLdInput(raw: unknown): { ok: true; data: JsonLdDocument | null } | { ok: false; error: string } {
  const extracted = extractJsonLdPayload(typeof raw === "string" ? raw : "");
  if (!extracted.ok) return extracted;
  const payload = extracted.payload;
  if (!payload) return { ok: true, data: null };
  if (payload.length > MAX_JSON_LD_CHARS) {
    return { ok: false, error: "Invalid JSON-LD: schema is too large." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { ok: false, error: "Invalid JSON-LD: check commas, quotes or brackets." };
  }

  if (Array.isArray(parsed)) {
    if (!parsed.length) return { ok: true, data: null };
    if (!parsed.every(isPlainObject)) {
      return { ok: false, error: "Invalid JSON-LD: array items must be objects." };
    }
    return { ok: true, data: parsed };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: "Invalid JSON-LD: provide a JSON object or array of objects." };
  }
  return { ok: true, data: parsed };
}

export function normalizeJsonLdInput(raw: unknown): { ok: true; stored: string } | { ok: false; error: string } {
  const parsed = parseJsonLdInput(raw);
  if (!parsed.ok) return parsed;
  if (!parsed.data) return { ok: true, stored: "" };
  return { ok: true, stored: JSON.stringify(parsed.data, null, 2) };
}

export function sanitizeJsonLdField(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").slice(0, MAX_JSON_LD_CHARS);
}

export function serializeJsonLdScript(data: object | object[]) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
