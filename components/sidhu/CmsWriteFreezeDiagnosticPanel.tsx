"use client";

import { useActionState } from "react";
import {
  checkCmsWriteFreezeAction,
  type CmsWriteFreezeDiagnosticActionState,
} from "@/lib/cms/cms-write-freeze-diagnostic-action";
import { Banner } from "@/components/sidhu/fields";
import { Button } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

const INITIAL: CmsWriteFreezeDiagnosticActionState = { phase: "idle" };

function ResultBanner({ state }: { state: Extract<CmsWriteFreezeDiagnosticActionState, { phase: "done" }> }) {
  const { result } = state;
  if (result.status === "ACTIVE") {
    return (
      <Banner tone="ok">
        <span className="font-semibold">WRITE_FREEZE_ACTIVE.</span> {result.message}
      </Banner>
    );
  }
  if (result.status === "INACTIVE") {
    return (
      <Banner tone="warning">
        <span className="font-semibold">WRITE_FREEZE_INACTIVE.</span> {result.message}
      </Banner>
    );
  }
  return (
    <Banner tone="error">
      <span className="font-semibold">WRITE_FREEZE_UNKNOWN.</span> {result.error}
    </Banner>
  );
}

/**
 * Intentional click-only freeze diagnostic. Does not run on mount, does not
 * poll, and does not mutate CMS records.
 */
export function CmsWriteFreezeDiagnosticPanel() {
  const [state, action, pending] = useActionState(checkCmsWriteFreezeAction, INITIAL);

  return (
    <SectionCard className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink">CMS write-freeze check</h2>
        <p className="mt-1 text-sm text-muted">
          Asks this server process whether the existing CMS write-freeze guard would reject a
          write right now. Status only — it cannot enable or disable the freeze, and it does not
          prove every worker is frozen.
        </p>
      </div>

      <form action={action}>
        <Button type="submit" variant="secondary" className="min-h-9" disabled={pending}>
          {pending ? "Checking…" : "Check CMS Write Freeze"}
        </Button>
      </form>

      {state.phase === "done" ? <ResultBanner state={state} /> : null}
    </SectionCard>
  );
}
