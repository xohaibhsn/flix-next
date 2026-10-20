/**
 * Sidhu-facing Planning write-fence error mapping.
 *
 * Maps MySQL SIGNAL messages to sanitized operator text. Never returns SQL,
 * session tokens, or stack internals. Pure — safe for proceed/dispatch paths.
 *
 * Compatibility fence only: rejects unmodified legacy writers under an armed
 * fence; not a security identity against arbitrary SQL under a shared principal.
 */

import { L4B_FENCE_ERROR_CODES } from "@/lib/cms/seo-planning-lineage/planning-write-fence-codes";

export const L4B_PLANNING_WRITE_FENCE_ERRORS_VERSION = "l4b-fence-errors-v1" as const;

export const PLANNING_FENCE_SIDHU_CODES = {
  WRITE_FENCED: "PLANNING_WRITE_FENCED",
  DELETE_FENCED: "PLANNING_DELETE_FENCED",
  METADATA_MISSING: "PLANNING_FENCE_METADATA_MISSING",
  ARM_BLOCKED: "PLANNING_FENCE_ARM_BLOCKED_IN_FLIGHT",
} as const;

export type PlanningFenceSidhuCode =
  (typeof PLANNING_FENCE_SIDHU_CODES)[keyof typeof PLANNING_FENCE_SIDHU_CODES];

/** User-facing copy — temporary unavailability, no SQL/token leakage. */
export const PLANNING_FENCE_SIDHU_MESSAGES = {
  WRITE_FENCED:
    "Planning create is temporarily unavailable while a database write fence is active. Please try again later or contact an administrator.",
  DELETE_FENCED:
    "Permanent delete is temporarily unavailable while a database write fence is active. Please try again later or contact an administrator.",
  METADATA_MISSING:
    "Planning writes are temporarily unavailable due to incomplete fence configuration. Please contact an administrator.",
  ARM_BLOCKED:
    "Planning write-fence activation could not complete because another write is still in progress. Please retry shortly.",
} as const;

function errorText(error: unknown): string {
  // mysql2 errors are Error instances with sqlMessage; always merge both.
  if (error && typeof error === "object") {
    const row = error as { message?: unknown; sqlMessage?: unknown; code?: unknown };
    const parts = [row.sqlMessage, row.message, row.code]
      .filter((v) => typeof v === "string" && v.trim())
      .map((v) => String(v));
    if (parts.length) return parts.join(" ");
  }
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

/**
 * Detect fence SIGNAL / documented codes in a thrown MySQL or wrapped error.
 * Returns null when the error is unrelated (caller keeps existing handling).
 */
export function classifyPlanningFenceError(error: unknown): {
  code: PlanningFenceSidhuCode;
  message: string;
} | null {
  const text = errorText(error);
  if (!text) return null;

  if (
    text.includes(L4B_FENCE_ERROR_CODES.WRITE_FENCED) ||
    text.includes(PLANNING_FENCE_SIDHU_CODES.WRITE_FENCED)
  ) {
    return {
      code: PLANNING_FENCE_SIDHU_CODES.WRITE_FENCED,
      message: PLANNING_FENCE_SIDHU_MESSAGES.WRITE_FENCED,
    };
  }
  if (
    text.includes(L4B_FENCE_ERROR_CODES.DELETE_FENCED) ||
    text.includes(PLANNING_FENCE_SIDHU_CODES.DELETE_FENCED)
  ) {
    return {
      code: PLANNING_FENCE_SIDHU_CODES.DELETE_FENCED,
      message: PLANNING_FENCE_SIDHU_MESSAGES.DELETE_FENCED,
    };
  }
  if (
    text.includes(L4B_FENCE_ERROR_CODES.METADATA_MISSING) ||
    text.includes(PLANNING_FENCE_SIDHU_CODES.METADATA_MISSING)
  ) {
    return {
      code: PLANNING_FENCE_SIDHU_CODES.METADATA_MISSING,
      message: PLANNING_FENCE_SIDHU_MESSAGES.METADATA_MISSING,
    };
  }
  if (
    text.includes(L4B_FENCE_ERROR_CODES.ARM_IN_FLIGHT) ||
    text.includes(PLANNING_FENCE_SIDHU_CODES.ARM_BLOCKED) ||
    /Fence arm blocked by in-flight/i.test(text)
  ) {
    return {
      code: PLANNING_FENCE_SIDHU_CODES.ARM_BLOCKED,
      message: PLANNING_FENCE_SIDHU_MESSAGES.ARM_BLOCKED,
    };
  }
  return null;
}

/** True when error text looks like raw SQL / token leakage we must never surface. */
export function planningFenceMessageLooksUnsafe(message: string): boolean {
  return (
    /@flix_l4b_planning_auth|VARBINARY|FOR UPDATE|sqlMessage|ER_SIGNAL|errno\s*\d+/i.test(
      message,
    ) || /fence_bridge_token|expected_token/i.test(message)
  );
}
