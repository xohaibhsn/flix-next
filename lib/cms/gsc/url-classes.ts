/**
 * GSC-3 URL classification labels.
 * Deterministic server-side only — no AI-generated classes.
 */

export const GSC_URL_CLASSES = [
  "CURRENT_CMS",
  "CURRENT_PUBLIC_NON_CMS",
  "REDIRECTED_HISTORICAL",
  "REMOVED_OR_404",
  "UNKNOWN",
] as const;

export type GscUrlClass = (typeof GSC_URL_CLASSES)[number];

export type GscUrlSourceKind =
  | "page"
  | "post"
  | "category"
  | "public_route"
  | "built_in_redirect"
  | "cms_redirect"
  | "known_removed"
  | "foreign_host"
  | "malformed"
  | "unmatched";

/**
 * Classification result for one GSC page URL.
 * Metrics / AI / restoration recommendations are intentionally absent.
 */
export type GscUrlClassification = {
  rawUrl: string;
  normalizedUrl: string | null;
  normalizedPath: string | null;
  classification: GscUrlClass;
  matchedCurrentUrl?: string;
  redirectDestination?: string;
  redirectStatusCode?: number;
  historicalKey?: string;
  reason?: string;
  sourceKind?: GscUrlSourceKind;
};
