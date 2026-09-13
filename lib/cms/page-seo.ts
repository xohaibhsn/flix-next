import { COMPANY_PAGE_SEO_KEYS, companyPageSeoMeta } from "@/lib/cms/company-pages";
import { SUBSCRIPTION_SLUG, SUBSCRIPTION_SLUG_LEGACY, pathsForSlug } from "@/lib/cms/page-paths";
import type { SiteSettings } from "@/lib/cms/types";

export const PAGE_SEO_KEYS = ["home", "subscriptions", "contact", "blog", ...COMPANY_PAGE_SEO_KEYS] as const;
export type PageSeoKey = (typeof PAGE_SEO_KEYS)[number];

export const PAGE_SEO_META: Record<
  PageSeoKey,
  { label: string; editorHref: string; publicPaths: string[] }
> = {
  home: {
    label: "Welcome / Home",
    editorHref: "/sidhu/pages/home/",
    publicPaths: ["/", "/welcome", "/welcome/"],
  },
  subscriptions: {
    label: "IPTV Subscription",
    editorHref: "/sidhu/pages/subscriptions/",
    publicPaths: [...pathsForSlug(SUBSCRIPTION_SLUG), ...pathsForSlug(SUBSCRIPTION_SLUG_LEGACY)],
  },
  contact: {
    label: "Contact",
    editorHref: "/sidhu/pages/contact/",
    publicPaths: ["/contact", "/contact/"],
  },
  blog: {
    label: "Blog listing",
    editorHref: "/sidhu/blog/",
    publicPaths: ["/blogs", "/blogs/", "/blog", "/blog/"],
  },
  ...companyPageSeoMeta(),
};

export function isPageSeoKey(value: string): value is PageSeoKey {
  return (PAGE_SEO_KEYS as readonly string[]).includes(value);
}

export function pageSeoSummary(settings: SiteSettings, key: PageSeoKey) {
  const seo = settings.pageSeo[key];
  return {
    title: seo.title,
    description: seo.description,
  };
}
