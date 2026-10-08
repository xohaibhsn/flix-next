/**
 * Priority Score V1 — named deterministic heuristics.
 * Not empirically optimized. Not CMS-configurable.
 * Change requires scoreVersion bump.
 */

/** Public score bounds. */
export const SEO_PRIORITY_SCORE_MIN = 0;
export const SEO_PRIORITY_SCORE_MAX = 100;

/** Tier thresholds (inclusive lower bounds for MEDIUM/HIGH). */
export const SEO_PRIORITY_TIER_HIGH_MIN = 70;
export const SEO_PRIORITY_TIER_MEDIUM_MIN = 40;

/** Positive component caps — sum to 100 before risk penalty. */
export const MAX_DEMAND_POINTS = 20;
export const MAX_OPPORTUNITY_POINTS = 22;
export const MAX_CONFIDENCE_POINTS = 18;
export const MAX_COVERAGE_POINTS = 22;
export const MAX_MOMENTUM_POINTS = 10;

/** Risk is a penalty only (subtracted). */
export const MAX_RISK_PENALTY = 30;

/** Confidence ladder (NBA confidence primary). */
export const CONFIDENCE_POINTS_HIGH = 18;
export const CONFIDENCE_POINTS_MEDIUM = 11;
export const CONFIDENCE_POINTS_LOW = 5;

/**
 * Impressions buckets (max of attached refs).
 * Boundaries are V1 heuristics — capped so huge counts cannot dominate.
 */
export const IMPRESSIONS_BUCKET_NONE_MAX = 0;
export const IMPRESSIONS_BUCKET_LOW_MAX = 49;
export const IMPRESSIONS_BUCKET_MODERATE_MAX = 199;
export const IMPRESSIONS_BUCKET_STRONG_MAX = 999;
/** ≥1000 → VERY_STRONG */

export const IMPRESSIONS_POINTS_NONE = 0;
export const IMPRESSIONS_POINTS_LOW = 4;
export const IMPRESSIONS_POINTS_MODERATE = 8;
export const IMPRESSIONS_POINTS_STRONG = 12;
export const IMPRESSIONS_POINTS_VERY_STRONG = 14;

/**
 * Average position buckets (lower rank number = better visibility).
 * Used as qualitative opportunity signal only — not traffic forecasts.
 */
export const POSITION_STRONG_MAX = 5;
export const POSITION_MID_MAX = 15;
export const POSITION_WEAK_MAX = 40;

export const POSITION_POINTS_STRONG = 8;
export const POSITION_POINTS_MID = 10;
export const POSITION_POINTS_WEAK = 5;
export const POSITION_POINTS_FAR = 2;
export const POSITION_POINTS_UNAVAILABLE = 0;

/**
 * CTR supporting points — TITLE_META_UPDATE / REFRESH only.
 * Small by design; no industry benchmark comparison in V1.
 */
export const CTR_LOW_MAX = 0.02;
export const CTR_MID_MAX = 0.05;
export const CTR_POINTS_LOW_WITH_IMPRESSIONS = 3;
export const CTR_POINTS_MID = 2;
export const CTR_POINTS_HIGH = 1;
export const CTR_POINTS_NONE = 0;

/** Momentum direction points (action-aware in score.ts). */
export const MOMENTUM_POINTS_UP = 8;
export const MOMENTUM_POINTS_DOWN_REFRESH = 10;
export const MOMENTUM_POINTS_DOWN_OTHER = 3;
export const MOMENTUM_POINTS_FLAT = 2;
export const MOMENTUM_POINTS_NONE = 0;

/** Demand narrative / flag points. */
export const DEMAND_POINTS_MATERIAL_WEB = 10;
export const DEMAND_POINTS_MATERIAL_WHY = 6;
export const DEMAND_POINTS_EXPLICIT_WEB_FLAG = 4;
export const DEMAND_POINTS_GSC_PRESENT_FLAG = 4;

/** Coverage / distinctness (action-aware). */
export const COVERAGE_NEW_BLOG_PASS_NONE = 22;
export const COVERAGE_NEW_BLOG_PASS_PARTIAL = 8;
export const COVERAGE_NEW_BLOG_NO_PASS = 4;
export const COVERAGE_REFRESH_CLEAR_TARGET = 18;
export const COVERAGE_REFRESH_SOFT_TARGET = 8;
export const COVERAGE_HISTORICAL_ELIGIBLE = 16;
export const COVERAGE_INTERNAL_BASE = 8;
export const COVERAGE_TITLE_META_BASE = 8;
export const COVERAGE_DEFERRED_BASE = 4;
export const COVERAGE_HOLD_BASE = 2;

/** Opportunity family bases (before GSC additives, still capped). */
export const OPPORTUNITY_BASE_NEW_BLOG = 8;
export const OPPORTUNITY_BASE_REFRESH = 6;
export const OPPORTUNITY_BASE_HISTORICAL = 8;
export const OPPORTUNITY_BASE_INTERNAL = 6;
export const OPPORTUNITY_BASE_TITLE_META = 6;
export const OPPORTUNITY_BASE_DEFERRED = 2;
export const OPPORTUNITY_BASE_HOLD = 0;

/** Risk penalty points (subtracted, capped). */
export const RISK_MISSING_REFRESH = 6;
export const RISK_REFRESH_UNKNOWN = 8;
export const RISK_REFRESH_DUPLICATE = 10;
export const RISK_REFRESH_CANNIBALIZATION = 10;
export const RISK_INCOMPLETE_CORPUS = 4;
export const RISK_MISSING_GSC_WHEN_EXPECTED = 4;
export const RISK_SPARSE_RESEARCH = 6;
export const RISK_MISSING_TARGET = 6;
export const RISK_NBA_BLOCKERS = 4;
export const RISK_HOLD_STATUS = 4;
