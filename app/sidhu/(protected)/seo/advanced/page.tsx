import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoForm } from "@/components/sidhu/SeoForm";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoAdvancedPage() {
  const settings = await cms.getSettings();

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[{ label: "SEO", href: "/sidhu/seo/" }, { label: "Advanced" }]}
    >
      <SeoModuleChrome>
        <SeoForm settings={settings} />
      </SeoModuleChrome>
    </AdminShell>
  );
}
