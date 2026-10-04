/**
 * Pure UTC date-window helpers for bounded Search Console evidence packs.
 * No timezone / locale dependency. Safe to unit-test with a fixed "now".
 */

export const GSC_REPORTING_LAG_DAYS = 3;
export const GSC_EVIDENCE_WINDOW_DAYS = 28;

export type GscDateWindow = {
  /** Inclusive YYYY-MM-DD (UTC). */
  start: string;
  /** Inclusive YYYY-MM-DD (UTC). */
  end: string;
};

export type GscEvidenceDateWindows = {
  recent: GscDateWindow;
  previous: GscDateWindow;
  /** Complete days ending at this UTC date (today − lag). */
  lagCutoff: string;
  reportingLagDays: number;
  windowDays: number;
};

function assertUtcDate(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError("GSC date helpers require a valid Date.");
  }
}

/** Format a Date as YYYY-MM-DD using UTC calendar fields only. */
export function formatUtcDate(date: Date): string {
  assertUtcDate(date);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD as UTC midnight. Rejects non-canonical strings. */
export function parseUtcDate(isoDate: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new TypeError(`Invalid UTC date string: ${isoDate}`);
  }
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (formatUtcDate(date) !== isoDate) {
    throw new TypeError(`Invalid UTC calendar date: ${isoDate}`);
  }
  return date;
}

/** Shift a UTC calendar date by whole days (negative = past). */
export function addUtcDays(date: Date, days: number): Date {
  assertUtcDate(date);
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Inclusive day count between two YYYY-MM-DD UTC dates.
 * Example: 2026-01-01 → 2026-01-01 = 1.
 */
export function inclusiveUtcDayCount(start: string, end: string): number {
  const a = parseUtcDate(start).getTime();
  const b = parseUtcDate(end).getTime();
  if (a > b) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

/**
 * Build the fixed V1 evidence windows for a given "now".
 *
 * - lagCutoff = todayUTC − 3 complete days (excludes today's incomplete data)
 * - recent = 28 complete days ending at lagCutoff
 * - previous = the 28 complete days immediately before recent
 */
export function buildGscEvidenceDateWindows(now: Date = new Date()): GscEvidenceDateWindows {
  assertUtcDate(now);

  // Normalize to UTC midnight of "today" so time-of-day never affects windows.
  const todayUtc = parseUtcDate(formatUtcDate(now));
  const lagCutoffDate = addUtcDays(todayUtc, -GSC_REPORTING_LAG_DAYS);
  const recentEnd = lagCutoffDate;
  const recentStart = addUtcDays(recentEnd, -(GSC_EVIDENCE_WINDOW_DAYS - 1));
  const previousEnd = addUtcDays(recentStart, -1);
  const previousStart = addUtcDays(previousEnd, -(GSC_EVIDENCE_WINDOW_DAYS - 1));

  return {
    recent: {
      start: formatUtcDate(recentStart),
      end: formatUtcDate(recentEnd),
    },
    previous: {
      start: formatUtcDate(previousStart),
      end: formatUtcDate(previousEnd),
    },
    lagCutoff: formatUtcDate(lagCutoffDate),
    reportingLagDays: GSC_REPORTING_LAG_DAYS,
    windowDays: GSC_EVIDENCE_WINDOW_DAYS,
  };
}
