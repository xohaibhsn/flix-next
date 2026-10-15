/**
 * Planning Editorial Evidence Capture V1 — private CMS payload contract.
 * All entries are EDITORIAL / UNVERIFIED. Never promotes to A2-1 groundedEvidence.
 */

import { isSafeHttpUrl } from "@/lib/cms/ai-seo/research-schemas";
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
