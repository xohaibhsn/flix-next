/**
 * Server-only UK Search Console evidence-pack builder (GSC-2).
 *
 * Deterministic bounded Google evidence preparation only.
 * No Opportunities fusion, no AI provider calls, no CMS reads, no persistence, no retries.
 */

import "server-only";

import { getGscConfig, type GscConfig } from "@/lib/cms/gsc/config";
import {
  GSC_EVIDENCE_PREVIOUS_PAGES_LIMIT,
  GSC_EVIDENCE_RECENT_PAGES_LIMIT,
  GSC_EVIDENCE_RECENT_QUERIES_LIMIT,
  GSC_EVIDENCE_RECENT_QUERY_PAGES_LIMIT,
  GSC_EVIDENCE_MAX_GOOGLE_CALLS,
  buildGscEvidenceRequestPlan,
  type GscEvidenceCallId,
  type GscEvidenceRequestPlan,
} from "@/lib/cms/gsc/request-plan";
import {
  querySearchAnalytics,
  type GscFetch,
  type GscTokenGetter,
} from "@/lib/cms/gsc/search-analytics";
import type {
  GscResult,
  GscSearchAnalyticsRequest,
  GscSearchAnalyticsResult,
  GscSearchAnalyticsRow,
} from "@/lib/cms/gsc/types";
import type { GscUkEvidencePack } from "@/lib/cms/gsc/evidence-types";

export type GscSearchAnalyticsQuerier = (
  request: GscSearchAnalyticsRequest,
  options?: {
    config?: GscConfig;
    fetchImpl?: GscFetch;
    getAccessToken?: GscTokenGetter;
  },
) => Promise<GscResult<GscSearchAnalyticsResult>>;

const EMPTY_ROWS: GscSearchAnalyticsRow[] = [];

const DATASET_LIMITS: Record<GscEvidenceCallId, number> = {
  RECENT_QUERIES: GSC_EVIDENCE_RECENT_QUERIES_LIMIT,
  RECENT_PAGES: GSC_EVIDENCE_RECENT_PAGES_LIMIT,
  RECENT_QUERY_PAGES: GSC_EVIDENCE_RECENT_QUERY_PAGES_LIMIT,
  PREVIOUS_PAGES: GSC_EVIDENCE_PREVIOUS_PAGES_LIMIT,
};

function windowMeta(plan: GscEvidenceRequestPlan): GscUkEvidencePack["window"] {
  return {
    recentStart: plan.windows.recent.start,
    recentEnd: plan.windows.recent.end,
    previousStart: plan.windows.previous.start,
    previousEnd: plan.windows.previous.end,
    reportingLagDays: plan.windows.reportingLagDays,
  };
}

function emptyPack(
  status: GscUkEvidencePack["status"],
  plan: GscEvidenceRequestPlan,
  message?: string,
): GscUkEvidencePack {
  return {
    status,
    window: windowMeta(plan),
    country: {
      code: plan.country.code,
      expression: plan.country.expression,
    },
    recentQueries: EMPTY_ROWS,
    recentPages: EMPTY_ROWS,
    recentQueryPages: EMPTY_ROWS,
    previousPages: EMPTY_ROWS,
    ...(message ? { message } : {}),
  };
}

/** Hard-cap rows at the evidence-builder layer (in addition to request rowLimit). */
function boundRows(rows: GscSearchAnalyticsRow[], limit: number): GscSearchAnalyticsRow[] {
  return rows.slice(0, limit);
}

function hasAnyRows(datasets: GscSearchAnalyticsRow[][]): boolean {
  return datasets.some((rows) => rows.length > 0);
}

/**
 * Build the transient UK Search Console evidence pack.
 *
 * Conservative partial-failure rule: if any of the four required calls fails,
 * return UNAVAILABLE (do not mix partial datasets as a complete pack).
 */
export async function buildUkGscEvidencePack(options?: {
  now?: Date;
  config?: GscConfig;
  query?: GscSearchAnalyticsQuerier;
  fetchImpl?: GscFetch;
  getAccessToken?: GscTokenGetter;
}): Promise<GscUkEvidencePack> {
  const now = options?.now ?? new Date();
  const plan = buildGscEvidenceRequestPlan(now);
  const config = options?.config ?? getGscConfig();

  if (!config.configured) {
    return emptyPack(
      "NOT_CONFIGURED",
      plan,
      "Google Search Console is not configured yet.",
    );
  }

  if (plan.calls.length !== GSC_EVIDENCE_MAX_GOOGLE_CALLS) {
    return emptyPack(
      "UNAVAILABLE",
      plan,
      "Google Search Console evidence plan is invalid.",
    );
  }

  const query = options?.query ?? querySearchAnalytics;
  const byId: Partial<Record<GscEvidenceCallId, GscSearchAnalyticsRow[]>> = {};

  for (const planned of plan.calls) {
    const result = await query(planned.request, {
      config,
      fetchImpl: options?.fetchImpl,
      getAccessToken: options?.getAccessToken,
    });

    if (!result.ok) {
      // Conservative: any single failure makes the whole pack UNAVAILABLE.
      // Do not leak raw Google/auth error text beyond the sanitized client message.
      return emptyPack(
        "UNAVAILABLE",
        plan,
        result.message || "Google Search Console is temporarily unavailable.",
      );
    }

    byId[planned.id] = boundRows(result.value.rows, DATASET_LIMITS[planned.id]);
  }

  const recentQueries = byId.RECENT_QUERIES || EMPTY_ROWS;
  const recentPages = byId.RECENT_PAGES || EMPTY_ROWS;
  const recentQueryPages = byId.RECENT_QUERY_PAGES || EMPTY_ROWS;
  const previousPages = byId.PREVIOUS_PAGES || EMPTY_ROWS;

  const status = hasAnyRows([recentQueries, recentPages, recentQueryPages, previousPages])
    ? "AVAILABLE"
    : "NO_ROWS";

  return {
    status,
    window: windowMeta(plan),
    country: {
      code: plan.country.code,
      expression: plan.country.expression,
    },
    recentQueries,
    recentPages,
    recentQueryPages,
    previousPages,
    ...(status === "NO_ROWS"
      ? {
          message:
            "Google Search Console returned no rows for this bounded UK evidence window.",
        }
      : {}),
  };
}
