/** Shared GSC Search Analytics types. Server-only usage — never import from client components. */

export const GSC_READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly" as const;

export const GSC_SEARCH_ANALYTICS_ENDPOINT_PREFIX =
  "https://www.googleapis.com/webmasters/v3/sites/" as const;

export const GSC_ERROR_CODES = [
  "NOT_CONFIGURED",
  "AUTH_FAILED",
  "PERMISSION_DENIED",
  "PROPERTY_NOT_FOUND",
  "QUOTA_OR_RATE_LIMIT",
  "GOOGLE_UNAVAILABLE",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type GscErrorCode = (typeof GSC_ERROR_CODES)[number];

/** Controlled dimensions for future evidence-pack work. Not a free-form Google proxy. */
export const GSC_DIMENSIONS = ["query", "page", "country", "device", "date"] as const;
export type GscDimension = (typeof GSC_DIMENSIONS)[number];

export const GSC_FILTER_DIMENSIONS = ["country", "device", "page", "query", "searchAppearance"] as const;
export type GscFilterDimension = (typeof GSC_FILTER_DIMENSIONS)[number];

export const GSC_FILTER_OPERATORS = ["equals", "contains", "notContains", "includingRegex", "excludingRegex"] as const;
export type GscFilterOperator = (typeof GSC_FILTER_OPERATORS)[number];

export type GscDimensionFilter = {
  dimension: GscFilterDimension;
  operator?: GscFilterOperator;
  expression: string;
};

export type GscDimensionFilterGroup = {
  groupType?: "and";
  filters: GscDimensionFilter[];
};

/**
 * Narrow internal request contract for Search Analytics.
 * Callers are server modules only — never accept arbitrary Google URLs/scopes from the client.
 */
export type GscSearchAnalyticsRequest = {
  startDate: string;
  endDate: string;
  dimensions?: GscDimension[];
  dimensionFilterGroups?: GscDimensionFilterGroup[];
  rowLimit?: number;
  startRow?: number;
};

export type GscSearchAnalyticsRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscSearchAnalyticsResult = {
  rows: GscSearchAnalyticsRow[];
  responseAggregationType?: string;
};

export type GscFailure = {
  ok: false;
  code: GscErrorCode;
  message: string;
};

export type GscSuccess<T> = {
  ok: true;
  value: T;
};

export type GscResult<T> = GscSuccess<T> | GscFailure;

/** Safe status for future UI — never includes secrets or property identifiers. */
export type GscConfigStatus = {
  configured: boolean;
};
