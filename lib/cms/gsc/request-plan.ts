/**
 * Fixed bounded UK Search Analytics request plan for GSC-2 evidence packs.
 * Server-defined only — never accept dimensions/limits/country from clients.
 */

import {
  buildGscEvidenceDateWindows,
  type GscEvidenceDateWindows,
} from "@/lib/cms/gsc/date-windows";
import type { GscSearchAnalyticsRequest } from "@/lib/cms/gsc/types";

/** ISO-3166-1 alpha-3 expression used by Search Console country filter. */
export const GSC_UK_COUNTRY_EXPRESSION = "gbr" as const;
export const GSC_UK_COUNTRY_CODE = "GB" as const;

export const GSC_EVIDENCE_RECENT_QUERIES_LIMIT = 50;
export const GSC_EVIDENCE_RECENT_PAGES_LIMIT = 50;
export const GSC_EVIDENCE_RECENT_QUERY_PAGES_LIMIT = 100;
export const GSC_EVIDENCE_PREVIOUS_PAGES_LIMIT = 50;

/** Maximum Google Search Analytics calls per evidence-pack build. */
export const GSC_EVIDENCE_MAX_GOOGLE_CALLS = 4;

export type GscEvidenceCallId =
  | "RECENT_QUERIES"
  | "RECENT_PAGES"
  | "RECENT_QUERY_PAGES"
  | "PREVIOUS_PAGES";

export type GscEvidencePlannedCall = {
  id: GscEvidenceCallId;
  request: GscSearchAnalyticsRequest;
};

export type GscEvidenceRequestPlan = {
  windows: GscEvidenceDateWindows;
  country: {
    code: typeof GSC_UK_COUNTRY_CODE;
    expression: typeof GSC_UK_COUNTRY_EXPRESSION;
  };
  calls: GscEvidencePlannedCall[];
};

function ukCountryFilterGroups(): GscSearchAnalyticsRequest["dimensionFilterGroups"] {
  return [
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
  ];
}

function call(
  id: GscEvidenceCallId,
  startDate: string,
  endDate: string,
  dimensions: GscSearchAnalyticsRequest["dimensions"],
  rowLimit: number,
): GscEvidencePlannedCall {
  return {
    id,
    request: {
      startDate,
      endDate,
      dimensions,
      rowLimit,
      // Explicit startRow 0 — no pagination / continuation in V1.
      startRow: 0,
      dimensionFilterGroups: ukCountryFilterGroups(),
    },
  };
}

/**
 * Build the exact four-call UK evidence plan for a given "now".
 * Call order is fixed and intentional.
 */
export function buildGscEvidenceRequestPlan(now: Date = new Date()): GscEvidenceRequestPlan {
  const windows = buildGscEvidenceDateWindows(now);
  const { recent, previous } = windows;

  return {
    windows,
    country: {
      code: GSC_UK_COUNTRY_CODE,
      expression: GSC_UK_COUNTRY_EXPRESSION,
    },
    calls: [
      call(
        "RECENT_QUERIES",
        recent.start,
        recent.end,
        ["query"],
        GSC_EVIDENCE_RECENT_QUERIES_LIMIT,
      ),
      call(
        "RECENT_PAGES",
        recent.start,
        recent.end,
        ["page"],
        GSC_EVIDENCE_RECENT_PAGES_LIMIT,
      ),
      call(
        "RECENT_QUERY_PAGES",
        recent.start,
        recent.end,
        ["query", "page"],
        GSC_EVIDENCE_RECENT_QUERY_PAGES_LIMIT,
      ),
      call(
        "PREVIOUS_PAGES",
        previous.start,
        previous.end,
        ["page"],
        GSC_EVIDENCE_PREVIOUS_PAGES_LIMIT,
      ),
    ],
  };
}
