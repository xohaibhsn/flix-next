"use server";

import {
  runCmsWriteFreezeDiagnostic,
  type CmsWriteFreezeDiagnosticResult,
} from "@/lib/cms/cms-write-freeze-diagnostic";

export type CmsWriteFreezeDiagnosticActionState =
  | { phase: "idle" }
  | { phase: "done"; result: CmsWriteFreezeDiagnosticResult };

/**
 * Explicit click/form submission entry. Does not run on page render.
 * Re-checks SEO admin RBAC before evaluating the existing write-freeze guard.
 */
export async function checkCmsWriteFreezeAction(
  prev: CmsWriteFreezeDiagnosticActionState,
  formData: FormData,
): Promise<CmsWriteFreezeDiagnosticActionState> {
  void prev;
  void formData;
  const result = await runCmsWriteFreezeDiagnostic();
  return { phase: "done", result };
}
