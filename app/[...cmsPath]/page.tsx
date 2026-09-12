import { notFound } from "next/navigation";
import { CmsPageView } from "@/components/cms/CmsPageView";
import { SiteShell } from "@/components/layout/SiteShell";
import { isCompanyPageId } from "@/lib/cms/company-pages";
import { isReservedPageSlug, seoKeyForPageId } from "@/lib/cms/page-paths";
import { withSlash } from "@/lib/cms/redirects";
import { cms } from "@/lib/cms/repository";
import { pageMetadata, pageSeoMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ cmsPath: string[] }> };

function slugFromSegments(segments: string[]) {
  if (!segments?.length) return "";
  return withSlash(`/${segments.join("/")}/`.replace(/\/{2,}/g, "/").toLowerCase());
}

export async function generateMetadata({ params }: Props) {
  const { cmsPath } = await params;
  const slug = slugFromSegments(cmsPath);
  if (!slug || isReservedPageSlug(slug) || slug === "/" || slug === "/contact/") notFound();
  const page = await cms.getPageBySlug(slug);
  if (!page || page.status !== "published" || page.id === "page-home" || page.id === "page-contact") {
    notFound();
  }
  const key = seoKeyForPageId(page.id);
  if (key) return pageSeoMetadata(key, page.name, "", page.slug);
  return pageMetadata(page.name, "", page.slug);
}

export default async function CmsCatchAllPage({ params }: Props) {
  const { cmsPath } = await params;
  const slug = slugFromSegments(cmsPath);
  if (!slug || isReservedPageSlug(slug) || slug === "/" || slug === "/contact/") notFound();

  const page = await cms.getPageBySlug(slug);
  if (!page || page.status !== "published" || page.id === "page-home" || page.id === "page-contact") {
    notFound();
  }

  const key = seoKeyForPageId(page.id);
  const company = isCompanyPageId(page.id);

  return (
    <SiteShell pageSeoKey={key ?? undefined} publicPath={page.slug} pageTitle={page.name}>
      <div className={company ? "pb-16" : undefined}>
        <CmsPageView slug={page.slug} />
      </div>
    </SiteShell>
  );
}
