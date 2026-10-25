/**
 * Read-only CMS write-freeze diagnostic.
 *
 * Invokes the EXISTING write-freeze guard for this server execution and returns
 * a sanitized status. Does not persist CMS data, open a database pool, or call paid AI APIs.
 */
import type { requireAdminAction } from "@/lib/auth/guards";
import {
  assertCmsWritesAllowed,
  CMS_WRITE_FREEZE_CODE,
  isCmsWriteFreezeError,
  type CmsWriteFreezeEnv,
} from "@/lib/cms/write-freeze";

export type CmsWriteFreezeDiagnosticStatus = "ACTIVE" | "INACTIVE" | "UNKNOWN";

export const CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES = {
  ACTIVE: "This server request was rejected by the CMS write-freeze guard.",
  INACTIVE: "This server request was not rejected by the CMS write-freeze guard.",
  UNKNOWN: "Could not verify the CMS write-freeze state.",
} as const;

export type CmsWriteFreezeDiagnosticResult =
  | {
      ok: true;
      status: "ACTIVE";
      code: typeof CMS_WRITE_FREEZE_CODE;
      message: (typeof CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES)["ACTIVE"];
    }
  | {
      ok: true;
      status: "INACTIVE";
      message: (typeof CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES)["INACTIVE"];
    }
  | {
      ok: false;
      status: "UNKNOWN";
      code: "unauthorized" | "access_denied" | "unexpected";
      error: (typeof CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES)["UNKNOWN"];
    };

export type CmsWriteFreezeDiagnosticDeps = {
  /** Injected for tests; defaults to live `requireAdminAction`. */
  requireAdmin?: typeof requireAdminAction;
  /** Injected env for tests; defaults to `process.env`. */
  env?: CmsWriteFreezeEnv;
};

/**
 * Evaluate the existing freeze guard without mutating anything.
 * ACTIVE = guard rejected; INACTIVE = guard allowed. Unexpected errors rethrow.
 */
export function evaluateCmsWriteFreezeGuard(
  env: CmsWriteFreezeEnv = process.env,
): "ACTIVE" | "INACTIVE" {
  try {
    assertCmsWritesAllowed(env);
    return "INACTIVE";
  } catch (error) {
    if (isCmsWriteFreezeError(error)) return "ACTIVE";
    throw error;
  }
}

/**
 * Authenticate/authorize, then evaluate the freeze guard for this invocation.
 * Auth failures return UNKNOWN without exposing freeze state.
 */
export async function runCmsWriteFreezeDiagnostic(
  deps: CmsWriteFreezeDiagnosticDeps = {},
): Promise<CmsWriteFreezeDiagnosticResult> {
  const requireAdmin =
    deps.requireAdmin ?? (await import("@/lib/auth/guards")).requireAdminAction;
  const unauthorized = await requireAdmin("seo");
  if (unauthorized) {
    const code = unauthorized.error === "Unauthorized" ? "unauthorized" : "access_denied";
    return {
      ok: false,
      status: "UNKNOWN",
      code,
      error: CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES.UNKNOWN,
    };
  }

  try {
    const status = evaluateCmsWriteFreezeGuard(deps.env ?? process.env);
    if (status === "ACTIVE") {
      return {
        ok: true,
        status: "ACTIVE",
        code: CMS_WRITE_FREEZE_CODE,
        message: CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES.ACTIVE,
      };
    }
    return {
      ok: true,
      status: "INACTIVE",
      message: CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES.INACTIVE,
    };
  } catch {
    return {
      ok: false,
      status: "UNKNOWN",
      code: "unexpected",
      error: CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES.UNKNOWN,
    };
  }
}
