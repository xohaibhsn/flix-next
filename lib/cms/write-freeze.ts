import { ClientError } from "@/lib/security/errors";

/**
 * CMS write-freeze for concurrency v6 cutover.
 *
 * NEW-worker guard only: honors process env CMS_WRITE_FREEZE.
 * Already-running v5 workers ignore this module until they are stopped or
 * replaced. Production cutover MUST stop Hostinger Node (or revoke DB writes)
 * before overlapping old/new workers can accept mutations.
 *
 * Env truthy values: 1 | true | yes | on (case-insensitive).
 */
export const CMS_WRITE_FREEZE_ENV = "CMS_WRITE_FREEZE" as const;
/** Stable action/API error code (snake_case, matches AI SEO / Planning result unions). */
export const CMS_WRITE_FREEZE_CODE = "cms_write_freeze" as const;
export type CmsWriteFreezeCode = typeof CMS_WRITE_FREEZE_CODE;
export const CMS_WRITE_FREEZE_MESSAGE =
  "CMS writes are temporarily frozen for a schema cutover. Try again after the freeze is lifted.";

export type CmsWriteFreezeEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function isCmsWriteFreezeActive(env: CmsWriteFreezeEnv = process.env): boolean {
  const raw = String(env[CMS_WRITE_FREEZE_ENV] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export class CmsWriteFreezeError extends ClientError {
  readonly code = CMS_WRITE_FREEZE_CODE;

  constructor(message: string = CMS_WRITE_FREEZE_MESSAGE) {
    super(message);
    this.name = "CmsWriteFreezeError";
  }
}

export function isCmsWriteFreezeError(error: unknown): error is CmsWriteFreezeError {
  return (
    error instanceof CmsWriteFreezeError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === CMS_WRITE_FREEZE_CODE)
  );
}

/** Throw when freeze is active. Call at the start of mutating Server Actions. */
export function assertCmsWritesAllowed(env: CmsWriteFreezeEnv = process.env): void {
  if (isCmsWriteFreezeActive(env)) {
    throw new CmsWriteFreezeError();
  }
}

export function cmsWriteFreezeBlockedResult() {
  return {
    ok: false as const,
    code: CMS_WRITE_FREEZE_CODE,
    error: CMS_WRITE_FREEZE_MESSAGE,
  };
}
