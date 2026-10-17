import { ClientError } from "@/lib/security/errors";

export const PAGE_CONFLICT_CODE = "PAGE_CONFLICT" as const;

export const PAGE_CONFLICT_MESSAGE =
  "This page was changed in another session. Your changes were not saved. Reload and review the latest content.";

/**
 * Signed MySQL INT maximum for `pages.content_revision`.
 * Do not use Number.MAX_SAFE_INTEGER — that value cannot be stored in INT.
 */
export const MYSQL_SIGNED_INT_MAX = 2147483647;

/** Valid mutation expected-revision: positive MySQL INT. Missing/invalid → null (must reject Save). */
export function parseExpectedContentRevision(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > MYSQL_SIGNED_INT_MAX) return null;
  return value;
}

/** Seed/read default when a trusted persisted/legacy page lacks a revision. Never use for Save CAS. */
export function defaultContentRevision(value: unknown): number {
  return parseExpectedContentRevision(value) ?? 1;
}

export function parseStoredContentRevision(value: unknown): number {
  const parsed = typeof value === "bigint" ? Number(value) : value;
  const revision = parseExpectedContentRevision(parsed);
  if (revision == null) {
    throw new Error("Invalid stored page content_revision.");
  }
  return revision;
}

export function nextContentRevision(current: number): number {
  if (current >= MYSQL_SIGNED_INT_MAX) {
    throw new Error("Page content_revision overflow.");
  }
  return current + 1;
}

export class PageConflictError extends ClientError {
  readonly code = PAGE_CONFLICT_CODE;

  constructor(message: string = PAGE_CONFLICT_MESSAGE) {
    super(message);
    this.name = "PageConflictError";
  }
}

export function isPageConflictError(error: unknown): error is PageConflictError {
  return (
    error instanceof PageConflictError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === PAGE_CONFLICT_CODE)
  );
}
