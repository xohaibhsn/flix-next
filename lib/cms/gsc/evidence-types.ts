/**
 * GSC-2 UK evidence-pack contract.
 * Transient server-side only — no persistence, no UI wiring in this phase.
 */

import type { GscSearchAnalyticsRow } from "@/lib/cms/gsc/types";

export const GSC_EVIDENCE_STATUSES = [
  "AVAILABLE",
  "NOT_CONFIGURED",
  "UNAVAILABLE",
  "NO_ROWS",
] as const;

export type GscEvidenceStatus = (typeof GSC_EVIDENCE_STATUSES)[number];

export type GscEvidenceWindowMeta = {
  recentStart: string;
  recentEnd: string;
  previousStart: string;
  previousEnd: string;
  reportingLagDays: number;
};

export type GscEvidenceCountryMeta = {
  /** Display / product country code. */
  code: "GB";
  /** Search Console filter expression. */
  expression: "gbr";
};

/**
 * Bounded UK Search Console evidence pack.
 *
 * Metric fields on rows are Google pass-through values (clicks, impressions, ctr, position).
 * Absence of a URL/query from a bounded array means "not present in this bounded result",
 * not "no search demand".
 */
export type GscUkEvidencePack = {
  status: GscEvidenceStatus;
  window: GscEvidenceWindowMeta;
  country: GscEvidenceCountryMeta;
  recentQueries: GscSearchAnalyticsRow[];
  recentPages: GscSearchAnalyticsRow[];
  recentQueryPages: GscSearchAnalyticsRow[];
  previousPages: GscSearchAnalyticsRow[];
  /** Safe operator message — never includes secrets or raw Google payloads. */
  message?: string;
};

export type GscUkEvidencePackBuildStats = {
  googleCalls: number;
};
