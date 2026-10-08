import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoLedgerRunDetail } from "@/components/sidhu/SeoLedgerRunDetail";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { requirePermission } from "@/lib/auth/guards";
import { isValidLedgerRunId } from "@/lib/cms/seo-experiment-ledger/read-cursor";
import { getSeoResearchRunDetail } from "@/lib/cms/seo-experiment-ledger/read-mysql";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SidhuSeoLedgerRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  await requirePermission("seo");
  const { runId: rawId } = await params;
  const runId = decodeURIComponent(rawId || "");

  if (!isValidLedgerRunId(runId)) notFound();

  const result = await getSeoResearchRunDetail({ runId });

  if (!result.ok) {
    if (result.errorCode === "not_found" || result.errorCode === "invalid_id") {
      notFound();
    }

    return (
      <AdminShell
        title="SEO"
        subtitle="Search visibility, metadata and technical diagnostics."
        breadcrumbs={[
          { label: "SEO", href: "/sidhu/seo/" },
          { label: "Experiment Ledger", href: "/sidhu/seo/ledger/" },
          { label: "Run" },
        ]}
      >
        <SeoModuleChrome>
          <SectionCard padding="sm">
            <p className="text-sm text-muted">
              {result.errorCode === "unavailable"
                ? "Ledger database unavailable."
                : "Unable to load Ledger history."}
            </p>
          </SectionCard>
        </SeoModuleChrome>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[
        { label: "SEO", href: "/sidhu/seo/" },
        { label: "Experiment Ledger", href: "/sidhu/seo/ledger/" },
        { label: "Run" },
      ]}
    >
      <SeoModuleChrome>
        <SeoLedgerRunDetail
          run={result.run}
          decisions={result.decisions}
          decisionOverflow={result.decisionOverflow}
        />
      </SeoModuleChrome>
    </AdminShell>
  );
}
