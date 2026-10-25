/**
 * Application-side database mutation fence (new-worker sinks).
 *
 * Extends CMS_WRITE_FREEZE with explicit mutation intents and optional
 * generation enforcement. Does NOT provide old-worker exclusivity, DB-atomic
 * generation fencing, or Hostinger quiescence proof.
 *
 * Generation enforcement is inactive unless CMS_WRITE_GENERATION_ENFORCE is
 * truthy. When inactive, absence of generation env keys must not break normal
 * CMS writes. When armed, missing/invalid/stale generation fails closed.
 */

import {
  assertCmsWritesAllowed,
  CMS_WRITE_FREEZE_CODE,
  CMS_WRITE_FREEZE_MESSAGE,
  CmsWriteFreezeError,
  isCmsWriteFreezeActive,
  isCmsWriteFreezeError,
  type CmsWriteFreezeEnv,
} from "@/lib/cms/write-freeze";

export const CMS_WRITE_GENERATION_ENFORCE_ENV = "CMS_WRITE_GENERATION_ENFORCE" as const;
export const CMS_WRITE_ALLOWED_GENERATION_ENV = "CMS_WRITE_ALLOWED_GENERATION" as const;
export const APP_WRITE_GENERATION_ENV = "APP_WRITE_GENERATION" as const;

export const MUTATION_INTENTS = [
  "CMS_EDITORIAL",
  "CATALOG",
  "PLANNING",
  "LEDGER",
  "SEO_HEALTH",
  "AUTH_ADMIN",
  "AUTH_SIDE_EFFECT",
  "SCHEMA_SEED",
  "CLI_MAINTENANCE",
  "AUTOMATION",
] as const;

export type MutationIntent = (typeof MUTATION_INTENTS)[number];

export type MutationFenceDenyReason =
  | "freeze_active"
  | "invalid_intent"
  | "generation_enforce_misconfigured"
  | "generation_missing"
  | "generation_stale";

const INTENT_SET = new Set<string>(MUTATION_INTENTS);

export function isMutationIntent(value: unknown): value is MutationIntent {
  return typeof value === "string" && INTENT_SET.has(value);
}

export function isWriteGenerationEnforceActive(env: CmsWriteFreezeEnv = process.env): boolean {
  const raw = String(env[CMS_WRITE_GENERATION_ENFORCE_ENV] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function readGenerationToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const token = raw.trim();
  if (!token) return null;
  // Bound length; alphanumeric / _ / - / . only — avoid dumping secrets into compares.
  if (token.length > 128 || !/^[A-Za-z0-9._-]+$/.test(token)) return null;
  return token;
}

/**
 * Evaluate generation gate. Inactive enforce → allow.
 * Armed enforce → both tokens required and equal.
 */
export function evaluateWriteGeneration(
  env: CmsWriteFreezeEnv = process.env,
): { ok: true } | { ok: false; reason: MutationFenceDenyReason } {
  if (!isWriteGenerationEnforceActive(env)) {
    return { ok: true };
  }
  const allowed = readGenerationToken(env[CMS_WRITE_ALLOWED_GENERATION_ENV]);
  const worker = readGenerationToken(env[APP_WRITE_GENERATION_ENV]);
  if (!allowed || !worker) {
    // Enforce armed but tokens missing/malformed → fail closed (misconfigured).
    if (
      !String(env[CMS_WRITE_ALLOWED_GENERATION_ENV] ?? "").trim() ||
      !String(env[APP_WRITE_GENERATION_ENV] ?? "").trim()
    ) {
      return { ok: false, reason: "generation_missing" };
    }
    return { ok: false, reason: "generation_enforce_misconfigured" };
  }
  if (allowed !== worker) {
    return { ok: false, reason: "generation_stale" };
  }
  return { ok: true };
}

export type MutationFenceEvaluation =
  | { allowed: true; intent: MutationIntent }
  | {
      allowed: false;
      intent: MutationIntent | null;
      reason: MutationFenceDenyReason;
      freezeActive: boolean;
    };

/** Pure evaluation — injectable env for tests. Never logs secrets. */
export function evaluateMutationAllowed(
  intent: unknown,
  env: CmsWriteFreezeEnv = process.env,
): MutationFenceEvaluation {
  if (!isMutationIntent(intent)) {
    return {
      allowed: false,
      intent: null,
      reason: "invalid_intent",
      freezeActive: isCmsWriteFreezeActive(env),
    };
  }
  if (isCmsWriteFreezeActive(env)) {
    return {
      allowed: false,
      intent,
      reason: "freeze_active",
      freezeActive: true,
    };
  }
  const generation = evaluateWriteGeneration(env);
  if (!generation.ok) {
    return {
      allowed: false,
      intent,
      reason: generation.reason,
      freezeActive: false,
    };
  }
  return { allowed: true, intent };
}

/**
 * Fail-closed sink/action guard. Throws CmsWriteFreezeError (same code/message
 * contract as assertCmsWritesAllowed) so existing callers keep working.
 */
export function assertMutationAllowed(
  intent: MutationIntent,
  env: CmsWriteFreezeEnv = process.env,
): void {
  const result = evaluateMutationAllowed(intent, env);
  if (result.allowed) return;
  // Keep stable public code/message; reason is for tests/operators via property.
  const error = new CmsWriteFreezeError(CMS_WRITE_FREEZE_MESSAGE);
  Object.assign(error, { fenceReason: result.reason, mutationIntent: result.intent });
  throw error;
}

/** Convenience: freeze-only check used by legacy call sites. */
export function assertCmsWritesAllowedViaFence(env: CmsWriteFreezeEnv = process.env): void {
  assertCmsWritesAllowed(env);
}

export {
  assertCmsWritesAllowed,
  CMS_WRITE_FREEZE_CODE,
  CMS_WRITE_FREEZE_MESSAGE,
  CmsWriteFreezeError,
  isCmsWriteFreezeActive,
  isCmsWriteFreezeError,
};
