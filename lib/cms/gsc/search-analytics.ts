/**
 * Server-only read-only Search Console Search Analytics client.
 * Uses native fetch + server-side bearer token. Never import from client components.
 */

import "server-only";

import { getGscAccessToken } from "@/lib/cms/gsc/auth";
import {
  GSC_MAX_ROW_LIMIT,
  getGscConfig,
  type GscConfig,
} from "@/lib/cms/gsc/config";
import {
  GSC_DIMENSIONS,
  GSC_FILTER_DIMENSIONS,
  GSC_FILTER_OPERATORS,
  GSC_SEARCH_ANALYTICS_ENDPOINT_PREFIX,
  type GscDimension,
  type GscDimensionFilterGroup,
  type GscErrorCode,
  type GscFailure,
  type GscResult,
  type GscSearchAnalyticsRequest,
  type GscSearchAnalyticsResult,
  type GscSearchAnalyticsRow,
} from "@/lib/cms/gsc/types";

export type GscFetch = typeof fetch;

export type GscTokenGetter = () => Promise<GscResult<string>>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(code: GscErrorCode, message: string): GscFailure {
  return { ok: false, code, message };
}

function isDimension(value: string): value is GscDimension {
  return (GSC_DIMENSIONS as readonly string[]).includes(value);
}

function sanitizeFilterGroups(groups: GscDimensionFilterGroup[] | undefined) {
  if (!groups?.length) return undefined;
  const out: GscDimensionFilterGroup[] = [];
  for (const group of groups.slice(0, 5)) {
    if (!group || !Array.isArray(group.filters) || !group.filters.length) continue;
    const filters = [];
    for (const filter of group.filters.slice(0, 10)) {
      if (!filter || typeof filter.expression !== "string") continue;
      const expression = filter.expression.trim().slice(0, 500);
      if (!expression) continue;
      if (!(GSC_FILTER_DIMENSIONS as readonly string[]).includes(filter.dimension)) continue;
      const operator = filter.operator || "equals";
      if (!(GSC_FILTER_OPERATORS as readonly string[]).includes(operator)) continue;
      filters.push({
        dimension: filter.dimension,
        operator,
        expression,
      });
    }
    if (filters.length) {
      out.push({ groupType: "and", filters });
    }
  }
  return out.length ? out : undefined;
}

/** Build the bounded Google request body from the internal contract. */
export function buildSearchAnalyticsBody(request: GscSearchAnalyticsRequest) {
  if (!DATE_RE.test(request.startDate) || !DATE_RE.test(request.endDate)) {
    return null;
  }
  if (request.startDate > request.endDate) return null;

  const dimensions = (request.dimensions || []).filter(isDimension).slice(0, 5);
  const rowLimit = Math.min(
    Math.max(1, Math.floor(Number(request.rowLimit) || 25)),
    GSC_MAX_ROW_LIMIT,
  );
  const startRow = Math.max(0, Math.floor(Number(request.startRow) || 0));
  const dimensionFilterGroups = sanitizeFilterGroups(request.dimensionFilterGroups);

  const body: Record<string, unknown> = {
    startDate: request.startDate,
    endDate: request.endDate,
    rowLimit,
    startRow,
  };
  if (dimensions.length) body.dimensions = dimensions;
  if (dimensionFilterGroups) body.dimensionFilterGroups = dimensionFilterGroups;
  return body;
}

export function buildSearchAnalyticsUrl(siteUrl: string) {
  return `${GSC_SEARCH_ANALYTICS_ENDPOINT_PREFIX}${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
}

function asFiniteNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Map Google rows without inventing metrics. Invalid numeric rows are skipped. */
export function mapSearchAnalyticsRows(payload: unknown): GscSearchAnalyticsResult | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const rawRows = root.rows;
  if (rawRows == null) {
    return {
      rows: [],
      responseAggregationType:
        typeof root.responseAggregationType === "string" ? root.responseAggregationType : undefined,
    };
  }
  if (!Array.isArray(rawRows)) return null;

  const rows: GscSearchAnalyticsRow[] = [];
  for (const item of rawRows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const clicks = asFiniteNumber(row.clicks);
    const impressions = asFiniteNumber(row.impressions);
    const ctr = asFiniteNumber(row.ctr);
    const position = asFiniteNumber(row.position);
    if (clicks == null || impressions == null || ctr == null || position == null) continue;
    const keys = Array.isArray(row.keys)
      ? row.keys.filter((key): key is string => typeof key === "string").map((key) => key.slice(0, 500))
      : [];
    rows.push({ keys, clicks, impressions, ctr, position });
  }

  return {
    rows,
    responseAggregationType:
      typeof root.responseAggregationType === "string" ? root.responseAggregationType : undefined,
  };
}

function normalizeHttpError(status: number): GscFailure {
  if (status === 401) {
    return fail("AUTH_FAILED", "Google Search Console authentication failed.");
  }
  if (status === 403) {
    return fail("PERMISSION_DENIED", "Google Search Console permission denied for this property.");
  }
  if (status === 404) {
    return fail("PROPERTY_NOT_FOUND", "Google Search Console property was not found.");
  }
  if (status === 429) {
    return fail("QUOTA_OR_RATE_LIMIT", "Google Search Console rate limit reached. Please try again later.");
  }
  return fail("GOOGLE_UNAVAILABLE", "Google Search Console is temporarily unavailable.");
}

/**
 * Query Search Analytics for the server-configured property only.
 * No retries. No client-supplied property/endpoint/scope.
 */
export async function querySearchAnalytics(
  request: GscSearchAnalyticsRequest,
  options?: {
    config?: GscConfig;
    fetchImpl?: GscFetch;
    getAccessToken?: GscTokenGetter;
  },
): Promise<GscResult<GscSearchAnalyticsResult>> {
  const config = options?.config ?? getGscConfig();
  if (!config.configured) {
    return fail("NOT_CONFIGURED", "Google Search Console is not configured yet.");
  }

  const body = buildSearchAnalyticsBody(request);
  if (!body) {
    return fail("INVALID_RESPONSE", "Search Analytics request was invalid.");
  }

  const tokenResult = options?.getAccessToken
    ? await options.getAccessToken()
    : await getGscAccessToken({ config });
  if (!tokenResult.ok) return tokenResult;

  const fetchImpl = options?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const endpoint = buildSearchAnalyticsUrl(config.siteUrl);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenResult.value}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return normalizeHttpError(response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return fail("INVALID_RESPONSE", "Google Search Console returned an unusable response.");
    }

    const mapped = mapSearchAnalyticsRows(payload);
    if (!mapped) {
      return fail("INVALID_RESPONSE", "Google Search Console returned an unusable response.");
    }

    return { ok: true, value: mapped };
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message))) {
      return fail("TIMEOUT", "Google Search Console request timed out.");
    }
    return fail("GOOGLE_UNAVAILABLE", "Google Search Console is temporarily unavailable.");
  } finally {
    clearTimeout(timer);
  }
}
