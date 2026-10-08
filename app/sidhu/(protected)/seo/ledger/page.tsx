import type { Metadata } from "next";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import {
  SeoLedgerRunList,
  type SeoLedgerListLoadState,
} from "@/components/sidhu/SeoLedgerRunList";
import { requirePermission } from "@/lib/auth/guards";
import { listSeoResearchRuns } from "@/lib/cms/seo-experiment-ledger/read-mysql";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SidhuSeoLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  await requirePermission("seo");
  const params = await searchParams;
  const cursor = typeof params.cursor === "string" ? params.cursor : null;
  const result = await listSeoResearchRuns({ cursor });

  let state: SeoLedgerListLoadState;
  let nextHref: string | null = null;

  if (!result.ok) {
    if (result.errorCode === "unavailable") state = { kind: "unavailable" };
    else if (result.errorCode === "invalid_cursor") state = { kind: "invalid_cursor" };
    else state = { kind: "error", message: result.errorMessage };
  } else if (!result.runs.length) {
    // A valid cursor with zero rows means the page is exhausted — not an empty Ledger.
    state = cursor ? { kind: "exhausted" } : { kind: "empty" };
  } else {
    state = { kind: "ok", runs: result.runs, nextCursor: result.nextCursor };
    if (result.nextCursor) {
      nextHref = `/sidhu/seo/ledger/?cursor=${encodeURIComponent(result.nextCursor)}`;
    }
  }

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[
        { label: "SEO", href: "/sidhu/seo/" },
        { label: "Experiment Ledger" },
      ]}
    >
      <SeoModuleChrome>
        <SeoLedgerRunList state={state} nextHref={nextHref} />
      </SeoModuleChrome>
    </AdminShell>
  );
}
