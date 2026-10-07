/** Shared Pre-Publish SEO QA types — safe for client + server imports. */

export type PrePublishSeverity = "blocker" | "warning" | "pass";

export type PrePublishIssueCode =
  | "PREPUB_TITLE_MISSING"
  | "PREPUB_CONTENT_EMPTY"
  | "PREPUB_SLUG_INVALID"
  | "PREPUB_SLUG_DUPLICATE"
  | "PREPUB_CANONICAL_MALFORMED"
  | "PREPUB_PUBLISHED_SLUG_CHANGED"
  | "PREPUB_FEATURED_MEDIA_BROKEN"
  | "PREPUB_OG_MEDIA_BROKEN"
  | "PREPUB_PUBLISHED_NOINDEX"
  | "PREPUB_CANONICAL_TO_OTHER"
  | "PREPUB_NOINDEX_SITEMAP"
  | "PREPUB_TITLE_LENGTH"
  | "PREPUB_DESCRIPTION_MISSING"
  | "PREPUB_DESCRIPTION_LENGTH"
  | "PREPUB_FEATURED_MISSING"
  | "PREPUB_MEDIA_ALT"
  | "PREPUB_INTERNAL_LINKS_ZERO"
  | "PREPUB_SELF_LINK"
  | "PREPUB_DUPLICATE_TITLE"
  | "PREPUB_DUPLICATE_SEO_TITLE"
  | "PREPUB_DUPLICATE_DESCRIPTION"
  | "PREPUB_HEADING_STRUCTURE"
  | "PREPUB_CANONICAL_HTTP"
  | "PREPUB_CANONICAL_WWW";

export type PrePublishIssue = {
  code: PrePublishIssueCode;
  severity: Exclude<PrePublishSeverity, "pass">;
  message: string;
  field?: string;
  evidence?: string;
};

export type PrePublishQaStatus = "pass" | "warnings" | "blocked";

export type PrePublishMode = "full" | "regression" | "skip";

export type PrePublishQaResult = {
  status: PrePublishQaStatus;
  blockers: PrePublishIssue[];
  warnings: PrePublishIssue[];
  passes: Array<{ code: string; message: string }>;
  confirmationRequired: boolean;
  candidateFingerprint: string;
  mode: PrePublishMode;
};
