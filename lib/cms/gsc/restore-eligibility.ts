/**
 * RESTORE_HISTORICAL Phase 1 — server-owned restoration eligibility.
 *
 * Candidates are derived ONLY from the already-bounded GSC fusion evidence
 * catalog for this research run (Q#/P#/QP# with classifications attached).
 *
 * Phase-1 window limit (intentional / conservative):
 * Evidence IDs are created from recent queries / recent pages / recent
 * query×page only. Previous-period pages are comparison-only and do NOT
 * receive evidence IDs. A historical URL that appears only in previousPages
 * (no current P# / QP#) is therefore NOT eligible — do not fabricate IDs
 * and do not add extra historical GSC API calls.
 *
 * No Google / OpenAI calls. No CMS mutations.
 */

import type { GscUrlClass } from "@/lib/cms/gsc/url-classes";
import { withSlash } from "@/lib/cms/redirects";

/** Minimal page-bearing evidence shape consumed from the fusion catalog. */
export type GscRestorationEvidenceInput = {
  id: string;
  kind: "query" | "page" | "query_page";
  query?: string;
  pageUrl?: string;
  normalizedPath?: string | null;
  classification?: GscUrlClass;
  historicalKey?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscRestorationCandidateEvidence = {
  id: string;
  kind: "page" | "query_page";
  query?: string;
  pageUrl?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscRestorationCandidate = {
  path: string;
  historicalKey: string;
  classification: "REMOVED_OR_404";
  evidenceIds: string[];
  evidence: GscRestorationCandidateEvidence[];
};

function isPageBearing(
  record: GscRestorationEvidenceInput,
): record is GscRestorationEvidenceInput & { kind: "page" | "query_page" } {
  return record.kind === "page" || record.kind === "query_page";
}

function hasObservedMetrics(record: GscRestorationEvidenceInput): boolean {
  return record.clicks > 0 || record.impressions > 0;
}

/**
 * Build Phase-1 restoration candidates from the fusion evidence map.
 * Deduplicates by normalized path. Server facts only.
 */
export function buildGscRestorationCandidates(
  byId: ReadonlyMap<string, GscRestorationEvidenceInput>,
): GscRestorationCandidate[] {
  const byPath = new Map<
    string,
    {
      historicalKey: string;
      evidenceIds: string[];
      evidence: GscRestorationCandidateEvidence[];
    }
  >();

  for (const record of byId.values()) {
    if (!isPageBearing(record)) continue;
    if (record.classification !== "REMOVED_OR_404") continue;
    if (!record.normalizedPath || !record.historicalKey) continue;

    const path = withSlash(record.normalizedPath);
    if (path === "/") continue;
    if (!hasObservedMetrics(record)) continue;

    // CURRENT_*, REDIRECTED_HISTORICAL, UNKNOWN already excluded by classification.
    // Registry membership alone is insufficient — presence here requires a
    // classified page-bearing evidence ID with positive factual metrics.

    const row: GscRestorationCandidateEvidence = {
      id: record.id,
      kind: record.kind,
      query: record.query,
      pageUrl: record.pageUrl,
      clicks: record.clicks,
      impressions: record.impressions,
      ctr: record.ctr,
      position: record.position,
    };

    const existing = byPath.get(path);
    if (existing) {
      if (!existing.evidenceIds.includes(record.id)) {
        existing.evidenceIds.push(record.id);
        existing.evidence.push(row);
      }
      continue;
    }

    byPath.set(path, {
      historicalKey: record.historicalKey,
      evidenceIds: [record.id],
      evidence: [row],
    });
  }

  return [...byPath.entries()]
    .map(([path, value]) => ({
      path,
      historicalKey: value.historicalKey,
      classification: "REMOVED_OR_404" as const,
      evidenceIds: value.evidenceIds,
      evidence: value.evidence,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Allowlist of normalized restore paths for this research run. */
export function gscRestorationPathAllowlist(
  candidates: readonly GscRestorationCandidate[],
): ReadonlySet<string> {
  return new Set(candidates.map((candidate) => candidate.path));
}
