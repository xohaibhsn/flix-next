/**
 * Server-only admin GSC connection probe (acceptance diagnostic).
 *
 * Exactly: 0–1 auth token exchange + 0–1 Search Analytics call.
 * No OpenAI. No persistence. No retries. No pagination.
 * Never returns credentials, tokens, property URL, or raw Google bodies.
 */

import "server-only";

import { getGscAccessToken } from "@/lib/cms/gsc/auth";
import { getGscConfig, type GscConfig } from "@/lib/cms/gsc/config";
import { buildGscEvidenceDateWindows } from "@/lib/cms/gsc/date-windows";
import {
  GSC_PROBE_ROW_LIMIT,
  type GscProbeResult,
  type GscProbeStatus,
} from "@/lib/cms/gsc/probe-types";
import {
  GSC_UK_COUNTRY_CODE,
  GSC_UK_COUNTRY_EXPRESSION,
} from "@/lib/cms/gsc/request-plan";
import {
  querySearchAnalytics,
  type GscFetch,
  type GscTokenGetter,
} from "@/lib/cms/gsc/search-analytics";
import type { GscErrorCode, GscResult, GscSearchAnalyticsRequest } from "@/lib/cms/gsc/types";

export type { GscProbeResult, GscProbeStatus, GscProbeSampleRow } from "@/lib/cms/gsc/probe-types";
export { GSC_PROBE_ROW_LIMIT } from "@/lib/cms/gsc/probe-types";

export type GscProbeAuthFn = (options?: {
  config?: GscConfig;
}) => Promise<GscResult<string>>;

export type GscProbeAnalyticsFn = typeof querySearchAnalytics;

function windowMeta(now: Date) {
  const windows = buildGscEvidenceDateWindows(now);
  return {
    start: windows.recent.start,
    end: windows.recent.end,
    reportingLagDays: windows.reportingLagDays,
  };
}

function countryMeta() {
  return {
    code: GSC_UK_COUNTRY_CODE,
    expression: GSC_UK_COUNTRY_EXPRESSION,
  } as const;
}

function baseResult(
  partial: Omit<GscProbeResult, "window" | "country" | "rowCount"> & {
    rowCount?: 0 | 1;
  },
  now: Date,
): GscProbeResult {
  return {
    window: windowMeta(now),
    country: countryMeta(),
    rowCount: partial.rowCount ?? 0,
    configured: partial.configured,
    authOk: partial.authOk,
    analyticsOk: partial.analyticsOk,
    status: partial.status,
    message: partial.message,
    ...(partial.sample ? { sample: partial.sample } : {}),
  };
}

function mapAnalyticsError(code: GscErrorCode): GscProbeStatus {
  if (code === "AUTH_FAILED") return "AUTH_FAILED";
  if (code === "PERMISSION_DENIED") return "PERMISSION_DENIED";
  if (code === "PROPERTY_NOT_FOUND") return "PROPERTY_NOT_FOUND";
  if (code === "QUOTA_OR_RATE_LIMIT") return "QUOTA_OR_RATE_LIMIT";
  if (code === "TIMEOUT") return "TIMEOUT";
  if (code === "INVALID_RESPONSE") return "INVALID_RESPONSE";
  if (code === "NOT_CONFIGURED") return "NOT_CONFIGURED";
  return "UNAVAILABLE";
}

function sanitizedAnalyticsMessage(status: GscProbeStatus): string {
  if (status === "AUTH_FAILED") {
    return "Google Search Console authentication failed for this probe.";
  }
  if (status === "PERMISSION_DENIED") {
    return "Search Analytics permission was denied for the configured property.";
  }
  if (status === "PROPERTY_NOT_FOUND") {
    return "The configured Search Console property was not found.";
  }
  if (status === "QUOTA_OR_RATE_LIMIT") {
    return "Google Search Console rate limit was reached. Try again later.";
  }
  if (status === "TIMEOUT") {
    return "Google Search Console timed out during this probe.";
  }
  if (status === "INVALID_RESPONSE") {
    return "Google Search Console returned an unusable response.";
  }
  return "Google Search Console is temporarily unavailable.";
}

/**
 * Build the fixed single-call UK query probe request (rowLimit = 1).
 * Reuses evidence date windows + UK country filter constants.
 */
export function buildGscProbeSearchAnalyticsRequest(now: Date = new Date()): GscSearchAnalyticsRequest {
  const windows = buildGscEvidenceDateWindows(now);
  return {
    startDate: windows.recent.start,
    endDate: windows.recent.end,
    dimensions: ["query"],
    rowLimit: GSC_PROBE_ROW_LIMIT,
    startRow: 0,
    dimensionFilterGroups: [
      {
        groupType: "and",
        filters: [
          {
            dimension: "country",
            operator: "equals",
            expression: GSC_UK_COUNTRY_EXPRESSION,
          },
        ],
      },
    ],
  };
}

/**
 * Explicit admin-triggered GSC connection probe.
 * Distinguishes configuration, authentication, and Search Analytics access.
 */
export async function probeGscConnection(options?: {
  now?: Date;
  config?: GscConfig;
  getAccessToken?: GscProbeAuthFn;
  query?: GscProbeAnalyticsFn;
  fetchImpl?: GscFetch;
}): Promise<GscProbeResult> {
  const now = options?.now ?? new Date();
  const config = options?.config ?? getGscConfig();

  if (!config.configured) {
    return baseResult(
      {
        configured: false,
        authOk: false,
        analyticsOk: false,
        status: "NOT_CONFIGURED",
        message: "Google Search Console is not configured yet.",
      },
      now,
    );
  }

  const getAccessToken = options?.getAccessToken ?? getGscAccessToken;
  const auth = await getAccessToken({ config });
  if (!auth.ok) {
    const status =
      auth.code === "TIMEOUT"
        ? "TIMEOUT"
        : auth.code === "NOT_CONFIGURED"
          ? "NOT_CONFIGURED"
          : "AUTH_FAILED";
    return baseResult(
      {
        configured: true,
        authOk: false,
        analyticsOk: false,
        status,
        message:
          status === "TIMEOUT"
            ? "Google Search Console authentication timed out."
            : status === "NOT_CONFIGURED"
              ? "Google Search Console is not configured yet."
              : "Google Search Console authentication failed.",
      },
      now,
    );
  }

  // Reuse the in-memory token for the single analytics call — no second auth exchange.
  const token = auth.value;
  const tokenGetter: GscTokenGetter = async () => ({ ok: true, value: token });

  const query = options?.query ?? querySearchAnalytics;
  const request = buildGscProbeSearchAnalyticsRequest(now);
  const analytics = await query(request, {
    config,
    fetchImpl: options?.fetchImpl,
    getAccessToken: tokenGetter,
  });

  if (!analytics.ok) {
    const status = mapAnalyticsError(analytics.code);
    return baseResult(
      {
        configured: true,
        authOk: true,
        analyticsOk: false,
        status,
        message: sanitizedAnalyticsMessage(status),
      },
      now,
    );
  }

  const rows = analytics.value.rows || [];
  if (!rows.length) {
    return baseResult(
      {
        configured: true,
        authOk: true,
        analyticsOk: true,
        status: "NO_ROWS",
        message:
          "GSC connected — authentication succeeded; no UK rows were returned in this bounded window.",
        rowCount: 0,
      },
      now,
    );
  }

  const row = rows[0]!;
  return baseResult(
    {
      configured: true,
      authOk: true,
      analyticsOk: true,
      status: "AVAILABLE",
      message: "GSC connected — authentication and Search Analytics access verified.",
      rowCount: 1,
      sample: {
        query: row.keys[0] || "",
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      },
    },
    now,
  );
}
