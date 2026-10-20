/**
 * L4B Planning write-fence — inert shared constants only.
 *
 * Safe for Sidhu error-mapping / production-visible import graphs.
 * Contains NO DDL SQL strings and performs NO database execution.
 *
 * Distinguish from planning-write-fence-ddl.ts (source-controlled DDL text,
 * still unregistered with ensure and never auto-executed in production).
 */

export const L4B_PLANNING_WRITE_FENCE_CODES_VERSION = "l4b-fence-codes-v1" as const;

export const SEO_PLANNING_WRITE_FENCE_TABLE = "seo_planning_write_fence" as const;
export const L4B_PLANNING_AUTH_SESSION_VAR = "@flix_l4b_planning_auth" as const;

export const L4B_FENCE_TRIGGER_INSERT = "trg_l4b_fence_planning_ins" as const;
export const L4B_FENCE_TRIGGER_DELETE = "trg_l4b_fence_planning_del" as const;

export const L4B_FENCE_ERROR_CODES = {
  METADATA_MISSING: "PLANNING_FENCE_METADATA_MISSING",
  WRITE_FENCED: "PLANNING_WRITE_FENCED",
  DELETE_FENCED: "PLANNING_DELETE_FENCED",
  ARM_IN_FLIGHT: "PLANNING_FENCE_ARM_BLOCKED_IN_FLIGHT",
} as const;
