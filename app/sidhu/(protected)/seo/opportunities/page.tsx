import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoOpportunitiesPanel } from "@/components/sidhu/SeoOpportunitiesPanel";
import { researchUkContentOpportunitiesAction } from "@/lib/cms/ai-seo-actions";
import { isOpenAiSeoConfigured } from "@/lib/cms/ai-seo/config";

export const dynamic = "force-dynamic";

export default async function SidhuSeoOpportunitiesPage() {
  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[{ label: "SEO", href: "/sidhu/seo/" }, { label: "Opportunities" }]}
    >
      <SeoModuleChrome>
        <SeoOpportunitiesPanel
          researchAction={researchUkContentOpportunitiesAction}
          aiConfigured={isOpenAiSeoConfigured()}
        />
      </SeoModuleChrome>
    </AdminShell>
  );
}
