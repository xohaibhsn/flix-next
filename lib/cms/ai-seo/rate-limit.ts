import { createHash } from "node:crypto";

export type AiSeoRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; scope: "burst" | "daily" };

type WindowState = {
  count: number;
  resetAt: number;
};

const BURST_WINDOW_MS = 60 * 1000;
const BURST_MAX = 5;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const DAILY_MAX = 100;

const burstAttempts = new Map<string, WindowState>();
const dailyAttempts = new Map<string, WindowState>();

function consume(store: Map<string, WindowState>, key: string, max: number, windowMs: number): AiSeoRateLimitResult {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (current.count >= max) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      scope: windowMs === BURST_WINDOW_MS ? "burst" : "daily",
    };
  }
  current.count += 1;
  return { ok: true };
}

export function aiSeoRateLimitKey(adminId: string, ip: string) {
  const material = `${adminId || "unknown"}:${ip || "unknown"}`;
  return createHash("sha256").update(`flix-ai-seo:${material}`).digest("hex");
}

/**
 * In-memory limiter (no DB migration): ~5 requests/minute and ~100/day per admin+IP key.
 * Pattern mirrors lib/auth/rate-limit.ts contact limiter.
 */
export function checkAiSeoExplainRateLimit(adminId: string, ip: string): AiSeoRateLimitResult {
  const key = aiSeoRateLimitKey(adminId, ip);
  const burst = consume(burstAttempts, key, BURST_MAX, BURST_WINDOW_MS);
  if (!burst.ok) return burst;
  const daily = consume(dailyAttempts, key, DAILY_MAX, DAILY_WINDOW_MS);
  if (!daily.ok) return daily;
  return { ok: true };
}

/** Test helper — clears in-memory AI SEO limiter state. */
export function resetAiSeoExplainRateLimitForTests() {
  burstAttempts.clear();
  dailyAttempts.clear();
}

export const AI_SEO_RATE_LIMITS = {
  burstMax: BURST_MAX,
  burstWindowMs: BURST_WINDOW_MS,
  dailyMax: DAILY_MAX,
  dailyWindowMs: DAILY_WINDOW_MS,
} as const;

/** Stricter research limiter — web_search is more expensive than draft/explain. */
const RESEARCH_BURST_MAX = 2;
const RESEARCH_DAILY_MAX = 10;
const researchBurstAttempts = new Map<string, WindowState>();
const researchDailyAttempts = new Map<string, WindowState>();

export function aiSeoResearchRateLimitKey(adminId: string, ip: string) {
  const material = `${adminId || "unknown"}:${ip || "unknown"}`;
  return createHash("sha256").update(`flix-ai-seo-research:${material}`).digest("hex");
}

export function checkAiSeoResearchRateLimit(adminId: string, ip: string): AiSeoRateLimitResult {
  const key = aiSeoResearchRateLimitKey(adminId, ip);
  const burst = consume(researchBurstAttempts, key, RESEARCH_BURST_MAX, BURST_WINDOW_MS);
  if (!burst.ok) return burst;
  const daily = consume(researchDailyAttempts, key, RESEARCH_DAILY_MAX, DAILY_WINDOW_MS);
  if (!daily.ok) return daily;
  return { ok: true };
}

export function resetAiSeoResearchRateLimitForTests() {
  researchBurstAttempts.clear();
  researchDailyAttempts.clear();
}

export const AI_SEO_RESEARCH_RATE_LIMITS = {
  burstMax: RESEARCH_BURST_MAX,
  burstWindowMs: BURST_WINDOW_MS,
  dailyMax: RESEARCH_DAILY_MAX,
  dailyWindowMs: DAILY_WINDOW_MS,
} as const;
