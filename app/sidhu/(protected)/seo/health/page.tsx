import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoHealthReport } from "@/components/sidhu/SeoHealthReport";
import { runSeoHealthScan } from "@/lib/cms/seo-health";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string | string[] }>;
}) {
  const params = await searchParams;
  const runRequested = params.run === "1" || (Array.isArray(params.run) && params.run.includes("1"));
  const report = runRequested ? await runSeoHealthScan(cms) : null;

  return (
    <AdminShell
      title="SEO Health"
      subtitle="A manual, read-only overview of the existing SEO diagnostics. Nothing is changed automatically."
    >
      <SeoHealthReport report={report} />
    </AdminShell>
  );
}
