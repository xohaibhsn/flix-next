"use server";

import {
  runDbIdentityDiagnostic,
  type DbIdentityDiagnosticResult,
  type DbIdentityDiagnosticSnapshot,
} from "@/lib/cms/seo-experiment-ledger/db-identity-diagnostic";

export type DbIdentityDiagnosticActionState =
  | { status: "idle" }
  | { status: "error"; errorMessage: string; errorCode: string }
  | { status: "ok"; snapshot: DbIdentityDiagnosticSnapshot };

function toActionState(result: DbIdentityDiagnosticResult): DbIdentityDiagnosticActionState {
  if (result.ok) {
    return { status: "ok", snapshot: result.snapshot };
  }
  return {
    status: "error",
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
  };
}

/**
 * Explicit form submission entry. Re-checks feature flag + super_admin before
 * any diagnostic SELECT. Does not run on page render.
 */
export async function runDbIdentityDiagnosticAction(
  prev: DbIdentityDiagnosticActionState,
  formData: FormData,
): Promise<DbIdentityDiagnosticActionState> {
  void prev;
  void formData;
  const result = await runDbIdentityDiagnostic();
  return toActionState(result);
}
