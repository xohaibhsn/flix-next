/** Client-safe GSC probe result contract. No secrets. No server-only imports. */

export const GSC_PROBE_STATUSES = [
  "NOT_CONFIGURED",
  "AUTH_FAILED",
  "PERMISSION_DENIED",
  "PROPERTY_NOT_FOUND",
  "QUOTA_OR_RATE_LIMIT",
  "AVAILABLE",
  "NO_ROWS",
  "UNAVAILABLE",
  "TIMEOUT",
  "INVALID_RESPONSE",
] as const;

export type GscProbeStatus = (typeof GSC_PROBE_STATUSES)[number];

export type GscProbeSampleRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/** Safe boolean-only config checks. Never includes env values. */
export type GscProbeConfigChecks = {
  siteUrlPresent: boolean;
  siteUrlValid: boolean;
  clientEmailPresent: boolean;
  clientEmailValid: boolean;
  privateKeyPresent: boolean;
  privateKeyLooksPem: boolean;
  projectIdPresent: boolean;
};

/** Safe boolean-only auth checks. Never includes key material or provider errors. */
export type GscProbeAuthChecks = {
  privateKeyCryptographicallyValid: boolean;
};

export type GscProbeResult = {
  configured: boolean;
  authOk: boolean;
  analyticsOk: boolean;
  status: GscProbeStatus;
  message: string;
  rowCount: 0 | 1;
  window: {
    start: string;
    end: string;
    reportingLagDays: number;
  };
  country: {
    code: "GB";
    expression: "gbr";
  };
  sample?: GscProbeSampleRow;
  /** Present on NOT_CONFIGURED — booleans only, no env values. */
  configChecks?: GscProbeConfigChecks;
  /** Present on AUTH_FAILED — booleans only, no key/provider details. */
  authChecks?: GscProbeAuthChecks;
};

export const GSC_PROBE_ROW_LIMIT = 1;
