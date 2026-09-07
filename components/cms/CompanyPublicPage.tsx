import { CmsPageView } from "@/components/cms/CmsPageView";
import { SiteShell } from "@/components/layout/SiteShell";
import { companyPageBySeoKey, type CompanyPageSeoKey } from "@/lib/cms/company-pages";
import { pageSeoMetadata } from "@/lib/metadata";

export function companyPageMetadata(seoKey: CompanyPageSeoKey) {
  const page = companyPageBySeoKey(seoKey);
  if (!page) {
    return pageSeoMetadata(seoKey, "Flix IPTV", "", "/");
  }
  return pageSeoMetadata(seoKey, page.seoTitle, page.seoDescription, page.slug);
}

export function CompanyPublicPage({ seoKey }: { seoKey: CompanyPageSeoKey }) {
  const page = companyPageBySeoKey(seoKey);
  if (!page) return null;
  return (
    <SiteShell pageSeoKey={seoKey}>
      <div className="pb-16">
        <CmsPageView slug={page.slug} />
      </div>
    </SiteShell>
  );
}
