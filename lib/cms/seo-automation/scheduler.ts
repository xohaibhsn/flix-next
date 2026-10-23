/**
 * CMS-configurable SEO Automation scheduler — deployed inactive by default.
 *
 * Prefer one bounded, authenticated, externally scheduled invocation.
 * No continuous polling loop. London DST-aware occurrence keys.
 */

import {
  SEO_AUTOMATION_DEFAULT_TIMEZONE,
  assertSeoAutomationPathAllowed,
  readSeoAutomationSwitchBoard,
} from "@/lib/cms/seo-automation/master-control";
import { assertRecurrenceBlocked } from "@/lib/cms/seo-automation/budgets";

export const SEO_AUTOMATION_SCHEDULER_SPEC = "seo-automation-scheduler-v1" as const;

export type SeoAutomationSchedulerConfig = {
  timezone: string;
  /** 0=Sun … 6=Sat — empty means no scheduled days (safe default). */
  daysOfWeek: number[];
  /** Local time HH:mm in configured timezone. */
  dailyTimeHhMm: string;
  perDayPublicationCap: number;
  weeklyPublicationCap: number;
  perRunAiCostBudgetUsd: number | null;
  dailyAiSpendBudgetUsd: number | null;
  monthlyAiSpendBudgetUsd: number | null;
  minimumIntervalMinutes: number;
  retryPolicy: "none";
  manualPaused: boolean;
};

export const SEO_AUTOMATION_SCHEDULER_SAFE_DEFAULTS: SeoAutomationSchedulerConfig = {
  timezone: SEO_AUTOMATION_DEFAULT_TIMEZONE,
  daysOfWeek: [],
  dailyTimeHhMm: "09:00",
  perDayPublicationCap: 0,
  weeklyPublicationCap: 0,
  perRunAiCostBudgetUsd: null,
  dailyAiSpendBudgetUsd: null,
  monthlyAiSpendBudgetUsd: null,
  minimumIntervalMinutes: 1440,
  retryPolicy: "none",
  manualPaused: true,
};

/**
 * Build a DST-safe occurrence key for a UTC instant in the given IANA timezone.
 * Duplicate keys during ambiguous fall-back hours collapse to one execution.
 */
export function buildSchedulerOccurrenceKey(args: {
  utcInstant: Date;
  timezone: string;
  dailyTimeHhMm: string;
}): string {
  const tz = args.timezone || SEO_AUTOMATION_DEFAULT_TIMEZONE;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(args.utcInstant).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const localHm = `${parts.hour}:${parts.minute}`;
  // Occurrence identity is calendar day + configured slot, not wall-clock minute of the tick.
  return `${tz}|${localDate}|${args.dailyTimeHhMm}|slot=${localHm === args.dailyTimeHhMm ? "exact" : "tick"}`;
}

export function isSchedulerDayAllowed(utcInstant: Date, config: SeoAutomationSchedulerConfig): boolean {
  if (!config.daysOfWeek.length) return false;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone || SEO_AUTOMATION_DEFAULT_TIMEZONE,
    weekday: "short",
  }).format(utcInstant);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const n = map[weekday];
  return typeof n === "number" && config.daysOfWeek.includes(n);
}

export type SeoAutomationSchedulerInvokeResult =
  | {
      ok: false;
      spec: typeof SEO_AUTOMATION_SCHEDULER_SPEC;
      code: string;
      error: string;
      occurrenceKey: string | null;
    }
  | {
      ok: true;
      spec: typeof SEO_AUTOMATION_SCHEDULER_SPEC;
      /** Never true while fail-closed — reserved for future activation. */
      executed: false;
      occurrenceKey: string;
      reason: "inactive_deployed";
    };

/**
 * Authenticated schedule tick entry. Always fail-closed while scheduler path is OFF.
 * Does not open DB leases or call providers.
 */
export function evaluateSeoAutomationSchedulerTick(args: {
  utcInstant?: Date;
  config?: SeoAutomationSchedulerConfig;
  signedInvocationValid: boolean;
}): SeoAutomationSchedulerInvokeResult {
  const config = args.config ?? SEO_AUTOMATION_SCHEDULER_SAFE_DEFAULTS;
  const now = args.utcInstant ?? new Date();
  const occurrenceKey = buildSchedulerOccurrenceKey({
    utcInstant: now,
    timezone: config.timezone,
    dailyTimeHhMm: config.dailyTimeHhMm,
  });

  const board = readSeoAutomationSwitchBoard();
  if (board.emergencyKill) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_SCHEDULER_SPEC,
      code: "emergency_off",
      error: "Emergency kill switch blocks scheduler.",
      occurrenceKey,
    };
  }

  const path = assertSeoAutomationPathAllowed("scheduler");
  if (!path.ok) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_SCHEDULER_SPEC,
      code: path.code,
      error: path.error,
      occurrenceKey,
    };
  }

  const recurrence = assertRecurrenceBlocked();
  if (!recurrence.ok) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_SCHEDULER_SPEC,
      code: recurrence.code,
      error: recurrence.error,
      occurrenceKey,
    };
  }

  if (!args.signedInvocationValid) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_SCHEDULER_SPEC,
      code: "unsigned_invocation",
      error: "Scheduler invocation signature invalid.",
      occurrenceKey,
    };
  }

  if (config.manualPaused) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_SCHEDULER_SPEC,
      code: "manual_paused",
      error: "Scheduler is manually paused.",
      occurrenceKey,
    };
  }

  if (!isSchedulerDayAllowed(now, config)) {
    return {
      ok: false,
      spec: SEO_AUTOMATION_SCHEDULER_SPEC,
      code: "day_not_configured",
      error: "No publication day configured for this local weekday (safe default).",
      occurrenceKey,
    };
  }

  // Path would claim a durable lease here after activation — intentionally not executed.
  return {
    ok: true,
    spec: SEO_AUTOMATION_SCHEDULER_SPEC,
    executed: false,
    occurrenceKey,
    reason: "inactive_deployed",
  };
}
