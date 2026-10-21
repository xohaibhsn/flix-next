import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { DbIdentityDiagnosticPanel } from "@/components/sidhu/DbIdentityDiagnosticPanel";
import { requireAdminSession } from "@/lib/auth/guards";
import { isDbIdentityDiagnosticEnabled } from "@/lib/cms/seo-experiment-ledger/db-identity-diagnostic";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Super-admin-only shell for the on-demand DB identity diagnostic.
 * Opening this page never borrows a pool connection or runs the diagnostic SELECT.
 */
export default async function SidhuSeoLedgerDbIdentityPage() {
  const session = await requireAdminSession();
  if (session.role !== "super_admin") {
    redirect("/sidhu/access-denied/");
  }

  const enabled = isDbIdentityDiagnosticEnabled();

  return (
    <AdminShell
      title="SEO"
      subtitle="Database identity sample for Experiment Ledger."
      breadcrumbs={[
        { label: "SEO", href: "/sidhu/seo/" },
        { label: "Experiment Ledger", href: "/sidhu/seo/ledger/" },
        { label: "DB identity" },
      ]}
    >
      <SeoModuleChrome>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">Database identity diagnostic</h2>
          <p className="text-sm text-muted">
            On-demand sample of the MariaDB endpoint behind this serving app&apos;s existing pool.
            No Research records, credentials, or customer data are shown.
          </p>
          <DbIdentityDiagnosticPanel enabled={enabled} />
        </div>
      </SeoModuleChrome>
    </AdminShell>
  );
}
