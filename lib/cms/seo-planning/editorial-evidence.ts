/**
 * Planning Editorial Evidence Capture V1 — private CMS payload contract.
 * All entries are EDITORIAL / UNVERIFIED. Never promotes to A2-1 groundedEvidence.
 */

import { isSafeHttpUrl } from "@/lib/cms/ai-seo/research-schemas";
import { SEO_PLANNING_FIELD_CAPS } from "@/lib/cms/seo-planning/constants";
import { sanitizeText } from "@/lib/cms/validation";

export const SEO_PLANNING_EDITORIAL_EVIDENCE_VERSION = "v1" as const;
export type SeoPlanningEditorialEvidenceVersion =
  typeof SEO_PLANNING_EDITORIAL_EVIDENCE_VERSION;

/** Payload key under draft.payload */
export const SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY = "editorialEvidenceV1" as const;

export const SEO_PLANNING_EDITORIAL_EVIDENCE_TYPES = [
  "EXTERNAL_REFERENCE",
  "PROPOSED_SITE_FACT",
] as const;
export type SeoPlanningEditorialEvidenceType =
  (typeof SEO_PLANNING_EDITORIAL_EVIDENCE_TYPES)[number];

/** Trust marker — always editorial; never independently verified. */
export const SEO_PLANNING_EDITORIAL_TRUST = "EDITORIAL_UNVERIFIED" as const;
export type SeoPlanningEditorialTrust = typeof SEO_PLANNING_EDITORIAL_TRUST;

export const SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS = {
  originalContribution: 1200,
  readerBenefit: 700,
  missingEvidenceNotes: 1000,
  entryCount: 5,
  claim: 400,
  url: 400,
  location: 200,
  notes: 300,
  id: 64,
} as const;

export type SeoPlanningEditorialEvidenceEntry = {
  id: string;
  evidenceType: SeoPlanningEditorialEvidenceType;
  /** Specific statement or claim being supported. */
  claim: string;
  /** Supporting URL when applicable (required for EXTERNAL_REFERENCE). */
  url: string;
  /** Evidence location / reference (section, page note, etc.). */
  location: string;
  /** Short editorial notes. */
  notes: string;
  trust: SeoPlanningEditorialTrust;
};

export type SeoPlanningEditorialEvidenceV1 = {
  version: SeoPlanningEditorialEvidenceVersion;
  originalContribution: string;
  readerBenefit: string;
  missingEvidenceNotes: string;
  entries: SeoPlanningEditorialEvidenceEntry[];
};

export type SeoPlanningEditorialEvidenceParseResult =
  | { ok: true; value: SeoPlanningEditorialEvidenceV1 }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const text = typeof value === "string" ? value.trim() : "";
  return (allowed as readonly string[]).includes(text) ? (text as T) : null;
}

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

/** HTTP(S) only; reject credentials and unsafe schemes. Does not fetch. */
export function isSafeEditorialEvidenceUrl(value: string): boolean {
  const url = value.trim();
  if (!url || !isSafeHttpUrl(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}

function sanitizeEntryId(raw: unknown, fallbackIndex: number): string {
  const text = sanitizeText(raw, SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.id).trim();
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(text)) return text;
  return `ee_${fallbackIndex + 1}`;
}

function emptyEvidence(): SeoPlanningEditorialEvidenceV1 {
  return {
    version: SEO_PLANNING_EDITORIAL_EVIDENCE_VERSION,
    originalContribution: "",
    readerBenefit: "",
    missingEvidenceNotes: "",
    entries: [],
  };
}

/**
 * Normalize editorial evidence from client/workspace input.
 * Rejects invalid EXTERNAL_REFERENCE URLs; does not invent entries.
 */
export function parseSeoPlanningEditorialEvidence(
  raw: unknown,
): SeoPlanningEditorialEvidenceParseResult {
  const row = asRecord(raw);
  if (!row) return { ok: false, error: "Editorial evidence data is invalid." };

  const originalContribution = trimField(
    row.originalContribution,
    SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.originalContribution,
  );
  const readerBenefit = trimField(
    row.readerBenefit,
    SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.readerBenefit,
  );
  const missingEvidenceNotes = trimField(
    row.missingEvidenceNotes,
    SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.missingEvidenceNotes,
  );

  const entriesRaw = Array.isArray(row.entries) ? row.entries : [];
  if (entriesRaw.length > SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.entryCount) {
    return {
      ok: false,
      error: `At most ${SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.entryCount} evidence entries are allowed.`,
    };
  }

  const entries: SeoPlanningEditorialEvidenceEntry[] = [];
  for (let i = 0; i < entriesRaw.length; i++) {
    const item = asRecord(entriesRaw[i]);
    if (!item) return { ok: false, error: "Each evidence entry must be an object." };

    const evidenceType = oneOf(item.evidenceType, SEO_PLANNING_EDITORIAL_EVIDENCE_TYPES);
    if (!evidenceType) {
      return { ok: false, error: "Choose a valid evidence type for each entry." };
    }

    const claim = trimField(item.claim, SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.claim);
    if (!claim) {
      return { ok: false, error: "Each evidence entry needs a specific claim or statement." };
    }

    const urlRaw = trimField(item.url, SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.url);
    if (evidenceType === "EXTERNAL_REFERENCE") {
      if (!urlRaw) {
        return { ok: false, error: "External references require an HTTP or HTTPS URL." };
      }
      if (!isSafeEditorialEvidenceUrl(urlRaw)) {
        return {
          ok: false,
          error: "Evidence URLs must be valid http(s) links without embedded credentials.",
        };
      }
    } else if (urlRaw && !isSafeEditorialEvidenceUrl(urlRaw)) {
      return {
        ok: false,
        error: "Evidence URLs must be valid http(s) links without embedded credentials.",
      };
    }

    const location = trimField(item.location, SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.location);
    const notes = trimField(item.notes, SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.notes);

    entries.push({
      id: sanitizeEntryId(item.id, i),
      evidenceType,
      claim,
      url: urlRaw && isSafeEditorialEvidenceUrl(urlRaw) ? urlRaw : "",
      location,
      notes,
      // Always force editorial trust — ignore any client "verified" claim.
      trust: SEO_PLANNING_EDITORIAL_TRUST,
    });
  }

  return {
    ok: true,
    value: {
      version: SEO_PLANNING_EDITORIAL_EVIDENCE_VERSION,
      originalContribution,
      readerBenefit,
      missingEvidenceNotes,
      entries,
    },
  };
}

export function readSeoPlanningEditorialEvidence(
  payload: unknown,
): SeoPlanningEditorialEvidenceV1 {
  const root = asRecord(payload);
  if (!root) return emptyEvidence();
  const raw = root[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY];
  if (raw == null) return emptyEvidence();
  const parsed = parseSeoPlanningEditorialEvidence(raw);
  return parsed.ok ? parsed.value : emptyEvidence();
}

/**
 * Merge editorial evidence into payload.
 * - `undefined` → preserve existing key
 * - `null` → remove key (explicit clear)
 * - value → set normalized V1 object
 */
export function mergeEditorialEvidenceIntoPayload(
  storedPayload: Record<string, unknown>,
  editorialEvidence: SeoPlanningEditorialEvidenceV1 | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...storedPayload };
  if (editorialEvidence === undefined) return next;
  if (editorialEvidence === null) {
    delete next[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY];
    return next;
  }
  next[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY] = editorialEvidence;
  return next;
}

/**
 * Ordinary full-row Planning saves (workspace/suggestions) must not clobber a
 * concurrent editorial-evidence merge. Under the write lock, copy the locked
 * row's editorialEvidenceV1 into the incoming payload (or delete if absent).
 * Only mergeSeoPlanningEditorialEvidence may intentionally change this key.
 */
export function preserveLockedEditorialEvidenceInPayload(
  lockedPayload: unknown,
  incomingPayload: unknown,
): Record<string, unknown> {
  const incoming =
    incomingPayload && typeof incomingPayload === "object" && !Array.isArray(incomingPayload)
      ? { ...(incomingPayload as Record<string, unknown>) }
      : {};
  const locked =
    lockedPayload && typeof lockedPayload === "object" && !Array.isArray(lockedPayload)
      ? (lockedPayload as Record<string, unknown>)
      : {};
  if (Object.prototype.hasOwnProperty.call(locked, SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY)) {
    incoming[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY] =
      locked[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY];
  } else {
    delete incoming[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY];
  }
  return incoming;
}

export const SEO_PLANNING_EDITORIAL_EVIDENCE_STALE_MESSAGE =
  "Editorial evidence changed elsewhere. Reload this plan and try again.";
export const SEO_PLANNING_EDITORIAL_EVIDENCE_IMMUTABLE_MESSAGE =
  "This planning draft cannot accept editorial evidence edits.";
export const SEO_PLANNING_EDITORIAL_EVIDENCE_SAVE_FAILED_MESSAGE =
  "Could not save editorial evidence. Please try again.";

/** True when any human-authored capture field or entry is present. */
export function hasSeoPlanningEditorialEvidenceContent(
  evidence: SeoPlanningEditorialEvidenceV1,
): boolean {
  if (evidence.originalContribution.trim()) return true;
  if (evidence.readerBenefit.trim()) return true;
  if (evidence.missingEvidenceNotes.trim()) return true;
  return evidence.entries.length > 0;
}

/** Prefix for collision-resistant evidence CAS tokens (SHA-256 hex). */
export const SEO_PLANNING_EDITORIAL_EVIDENCE_REVISION_PREFIX = "eev1_sha256_" as const;

/** Max length of `expectedEvidenceRevision` wire token (prefix + 64 hex). */
export const SEO_PLANNING_EDITORIAL_EVIDENCE_REVISION_MAX = 80;

const EDITORIAL_EVIDENCE_REVISION_RE =
  /^eev1_sha256_[a-f0-9]{64}$/;

/**
 * Canonical serialization for evidence CAS tokens.
 * Fixed key order; trust forced to EDITORIAL_UNVERIFIED so spoofed trust cannot fork the revision.
 * Absent payload key and empty V1 both canonicalize identically via readSeoPlanningEditorialEvidence.
 */
export function canonicalizeEditorialEvidenceForRevision(
  evidence: SeoPlanningEditorialEvidenceV1,
): string {
  const entries = evidence.entries.map((entry) => ({
    id: entry.id,
    evidenceType: entry.evidenceType,
    claim: entry.claim,
    url: entry.url,
    location: entry.location,
    notes: entry.notes,
    trust: SEO_PLANNING_EDITORIAL_TRUST,
  }));
  return JSON.stringify({
    version: SEO_PLANNING_EDITORIAL_EVIDENCE_VERSION,
    originalContribution: evidence.originalContribution,
    readerBenefit: evidence.readerBenefit,
    missingEvidenceNotes: evidence.missingEvidenceNotes,
    entries,
  });
}

/**
 * Sync SHA-256 hex of UTF-8 text — no Node `crypto` import (client + server safe).
 * Collision-resistant CAS material; not a MAC / authenticity proof by itself.
 */
export function sha256Utf8Hex(message: string): string {
  const bytes = utf8Encode(message);
  const hash = sha256Bytes(bytes);
  let out = "";
  for (let i = 0; i < hash.length; i++) {
    out += hash[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

function utf8Encode(text: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text);
  }
  // Narrow fallback for exotic runtimes without TextEncoder.
  const escaped = unescape(encodeURIComponent(text));
  const out = new Uint8Array(escaped.length);
  for (let i = 0; i < escaped.length; i++) out[i] = escaped.charCodeAt(i);
  return out;
}

function sha256Bytes(message: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLen = message.length * 8;
  const withPad = message.length + 1 + 8;
  const total = Math.ceil(withPad / 64) * 64;
  const padded = new Uint8Array(total);
  padded.set(message);
  padded[message.length] = 0x80;
  // length in bits as 64-bit big-endian (high 32 always 0 for our caps)
  padded[total - 4] = (bitLen >>> 24) & 0xff;
  padded[total - 3] = (bitLen >>> 16) & 0xff;
  padded[total - 2] = (bitLen >>> 8) & 0xff;
  padded[total - 1] = bitLen & 0xff;

  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      W[i] =
        ((padded[j]! << 24) | (padded[j + 1]! << 16) | (padded[j + 2]! << 8) | padded[j + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15]!, 7) ^ rotr(W[i - 15]!, 18) ^ (W[i - 15]! >>> 3);
      const s1 = rotr(W[i - 2]!, 17) ^ rotr(W[i - 2]!, 19) ^ (W[i - 2]! >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
    }

    let a = H[0]!;
    let b = H[1]!;
    let c = H[2]!;
    let d = H[3]!;
    let e = H[4]!;
    let f = H[5]!;
    let g = H[6]!;
    let h = H[7]!;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i]! + W[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (H[i]! >>> 24) & 0xff;
    out[i * 4 + 1] = (H[i]! >>> 16) & 0xff;
    out[i * 4 + 2] = (H[i]! >>> 8) & 0xff;
    out[i * 4 + 3] = H[i]! & 0xff;
  }
  return out;
}

/**
 * Content revision token for stale-save CAS (not a DB column).
 * SHA-256 over deterministic canonical evidence JSON — client/server equality, collision-resistant.
 * Arbitrary client strings are not authenticity proofs; server recomputes from locked row.
 */
export function fingerprintEditorialEvidence(
  evidence: SeoPlanningEditorialEvidenceV1,
): string {
  const canonical = canonicalizeEditorialEvidenceForRevision(evidence);
  return `${SEO_PLANNING_EDITORIAL_EVIDENCE_REVISION_PREFIX}${sha256Utf8Hex(canonical)}`;
}

export function fingerprintEditorialEvidenceFromPayload(payload: unknown): string {
  return fingerprintEditorialEvidence(readSeoPlanningEditorialEvidence(payload));
}

/** Reject malformed / non-SHA-256 revision tokens before lock work. */
export function isSeoPlanningEditorialEvidenceRevisionToken(value: string): boolean {
  return EDITORIAL_EVIDENCE_REVISION_RE.test(value.trim());
}

export type SeoPlanningEditorialEvidenceSaveInput = {
  id: string;
  expectedEvidenceRevision: string;
  /** Normalized evidence to store, or null for explicit clear. */
  evidence: SeoPlanningEditorialEvidenceV1 | null;
};

export type SeoPlanningEditorialEvidenceSaveParseResult =
  | { ok: true; value: SeoPlanningEditorialEvidenceSaveInput }
  | { ok: false; error: string };

/**
 * Parse client save payload. Ignores client trust/status/identity claims inside entries
 * via parseSeoPlanningEditorialEvidence. `clear: true` removes the payload key.
 */
export function parseSeoPlanningEditorialEvidenceSaveInput(
  raw: unknown,
): SeoPlanningEditorialEvidenceSaveParseResult {
  const row = asRecord(raw);
  if (!row) return { ok: false, error: "Editorial evidence save data is missing." };

  const id = sanitizeText(row.id, SEO_PLANNING_FIELD_CAPS.id).trim();
  if (!id) return { ok: false, error: "Planning draft id is required." };

  const expectedEvidenceRevision = sanitizeText(
    row.expectedEvidenceRevision,
    SEO_PLANNING_EDITORIAL_EVIDENCE_REVISION_MAX,
  ).trim();
  if (!expectedEvidenceRevision) {
    return { ok: false, error: "Evidence revision token is required." };
  }
  if (!isSeoPlanningEditorialEvidenceRevisionToken(expectedEvidenceRevision)) {
    return { ok: false, error: "Evidence revision token is invalid." };
  }

  if (row.clear === true) {
    return {
      ok: true,
      value: { id, expectedEvidenceRevision, evidence: null },
    };
  }

  const parsed = parseSeoPlanningEditorialEvidence(
    row.evidence !== undefined ? row.evidence : row,
  );
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    value: { id, expectedEvidenceRevision, evidence: parsed.value },
  };
}

/**
 * Map editorial capture to A2-1 pack inputs without inventing grounded evidence.
 * Sources are recorded URLs only (unverified). Original contribution uses
 * `source_backed` without verified sourceUrls so it cannot satisfy A2-1 support
 * and cannot promote READY without separately supplied trusted groundedEvidence.
 */
export function editorialEvidenceAsUntrustedPackHints(
  evidence: SeoPlanningEditorialEvidenceV1,
): {
  sources: Array<{ title: string; url: string; domain: string }>;
  originalContribution?: {
    statement: string;
    backing: "source_backed";
  };
} {
  const sources: Array<{ title: string; url: string; domain: string }> = [];
  for (const entry of evidence.entries) {
    if (!entry.url || !isSafeEditorialEvidenceUrl(entry.url)) continue;
    let domain = "";
    try {
      domain = new URL(entry.url).hostname.replace(/^www\./i, "");
    } catch {
      domain = "";
    }
    sources.push({
      title: entry.claim.slice(0, 160) || domain || entry.url,
      url: entry.url,
      domain,
    });
  }
  const statement = evidence.originalContribution.trim();
  return {
    sources,
    ...(statement
      ? {
          originalContribution: {
            statement,
            backing: "source_backed" as const,
            // Intentionally omit sourceUrls — editorial URLs are not verified.
          },
        }
      : {}),
  };
}
