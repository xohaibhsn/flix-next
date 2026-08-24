import type { BlogPost, SiteSettings } from "@/lib/cms/types";

export function referencedMediaIds(settings: SiteSettings, posts: BlogPost[] = []) {
  const ids = [
    settings.branding.logo?.id,
    settings.branding.favicon?.id,
    settings.branding.defaultOgImage?.id,
    ...settings.footerPaymentImages.map((item) => item.id),
    ...Object.values(settings.pageSeo).map((seo) => seo.ogImage?.id),
    ...posts.flatMap((post) => [post.featuredImage?.id, post.ogImage?.id]),
  ].filter((id): id is string => Boolean(id));
  return new Set(ids);
}
