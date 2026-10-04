/**
 * Deterministic raw-URL page comparison for GSC-2.
 * Matches exact Search Analytics page keys only — no URL normalization (GSC-3).
 */

import type { GscSearchAnalyticsRow } from "@/lib/cms/gsc/types";

export type GscMetricDirection = "UP" | "DOWN" | "FLAT";

export type GscPageMetricComparison = {
  /** Exact raw page URL used for the match attempt. */
  pageUrl: string;
  matched: boolean;
  recent: GscSearchAnalyticsRow | null;
  previous: GscSearchAnalyticsRow | null;
  clickDelta: number | null;
  impressionDelta: number | null;
  ctrDelta: number | null;
  positionDelta: number | null;
  clicksDirection: GscMetricDirection | null;
  impressionsDirection: GscMetricDirection | null;
  ctrDirection: GscMetricDirection | null;
  /**
   * Average position direction: lower numeric position is an improvement → UP.
   * Higher numeric position is worse → DOWN.
   */
  positionDirection: GscMetricDirection | null;
};

function pageKey(row: GscSearchAnalyticsRow): string | null {
  const key = row.keys?.[0];
  return typeof key === "string" && key.length ? key : null;
}

function directionHigherIsBetter(delta: number): GscMetricDirection {
  if (delta > 0) return "UP";
  if (delta < 0) return "DOWN";
  return "FLAT";
}

/** For average position, a negative delta (rank moved toward 1) is improvement. */
function directionLowerPositionIsBetter(delta: number): GscMetricDirection {
  if (delta < 0) return "UP";
  if (delta > 0) return "DOWN";
  return "FLAT";
}

/**
 * Compare one recent page row to previous-period rows by exact raw page URL.
 *
 * Absence from either bounded result means "not present in this bounded result",
 * not "no search demand". Unmatched comparisons return null deltas/directions.
 */
export function compareGscPageByExactUrl(
  recentRow: GscSearchAnalyticsRow,
  previousPages: readonly GscSearchAnalyticsRow[],
): GscPageMetricComparison {
  const pageUrl = pageKey(recentRow) || "";
  const previous =
    pageUrl.length > 0
      ? previousPages.find((row) => pageKey(row) === pageUrl) || null
      : null;

  if (!pageUrl || !previous) {
    return {
      pageUrl,
      matched: false,
      recent: recentRow,
      previous,
      clickDelta: null,
      impressionDelta: null,
      ctrDelta: null,
      positionDelta: null,
      clicksDirection: null,
      impressionsDirection: null,
      ctrDirection: null,
      positionDirection: null,
    };
  }

  const clickDelta = recentRow.clicks - previous.clicks;
  const impressionDelta = recentRow.impressions - previous.impressions;
  const ctrDelta = recentRow.ctr - previous.ctr;
  const positionDelta = recentRow.position - previous.position;

  return {
    pageUrl,
    matched: true,
    recent: recentRow,
    previous,
    clickDelta,
    impressionDelta,
    ctrDelta,
    positionDelta,
    clicksDirection: directionHigherIsBetter(clickDelta),
    impressionsDirection: directionHigherIsBetter(impressionDelta),
    ctrDirection: directionHigherIsBetter(ctrDelta),
    positionDirection: directionLowerPositionIsBetter(positionDelta),
  };
}

/**
 * Index previous page rows by exact raw URL for repeated comparisons.
 * First occurrence wins if duplicates appear in the bounded result.
 */
export function indexGscPagesByExactUrl(
  pages: readonly GscSearchAnalyticsRow[],
): Map<string, GscSearchAnalyticsRow> {
  const map = new Map<string, GscSearchAnalyticsRow>();
  for (const row of pages) {
    const key = pageKey(row);
    if (!key || map.has(key)) continue;
    map.set(key, row);
  }
  return map;
}
