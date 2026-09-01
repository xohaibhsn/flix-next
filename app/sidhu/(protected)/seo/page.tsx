import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoForm } from "@/components/sidhu/SeoForm";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoPage() {
  const settings = await cms.getSettings();
  return (
    <AdminShell
      title="SEO"
      subtitle="Overview of page metadata plus site-wide custom JSON-LD. Edit page SEO inside each page editor. Blog posts have their own SEO panel."
    >
      <SeoForm settings={settings} />
    </AdminShell>
  );
}
