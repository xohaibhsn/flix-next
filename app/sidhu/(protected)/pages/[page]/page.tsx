import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { HomeBuilder } from "@/components/sidhu/HomeBuilder";
import { PageSeoPanel } from "@/components/sidhu/PageSeoPanel";
import { requireAdminSession } from "@/lib/auth/guards";
import { adminHasPermission } from "@/lib/auth/session";
import { companyPageByAdminParam } from "@/lib/cms/company-pages";
import { defaultPages } from "@/lib/cms/defaults";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuCompanyPageBuilder({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const user = await requireAdminSession();
  const { page: adminParam } = await params;
  const definition = companyPageByAdminParam(adminParam);
  if (!definition) notFound();

  const [page, faqs, assets, settings, cloud] = await Promise.all([
    cms.getPageBySlug(definition.slug),
    cms.listFaqs(),
    cms.listMedia(),
    cms.getSettings(),
    getCloudinaryStatusAction(),
  ]);
  const resolved = page ?? defaultPages().find((item) => item.slug === definition.slug);
  if (!resolved) notFound();

  return (
    <AdminShell
      title={definition.name}
      subtitle={`Section builder for ${definition.slug}. SEO settings are on this page when you have SEO access.`}
    >
      <div className="space-y-6">
        <HomeBuilder
          page={resolved}
          title={`${definition.name} page builder`}
          hint={`Saving updates the live ${definition.name} page at ${definition.slug} after a refresh.`}
          faqs={faqs}
          assets={assets}
        />
        {adminHasPermission(user, "seo") ? (
          <PageSeoPanel
            pageKey={definition.seoKey}
            seo={settings.pageSeo[definition.seoKey]}
            assets={assets}
            configured={cloud.configured}
          />
        ) : null}
      </div>
    </AdminShell>
  );
}
