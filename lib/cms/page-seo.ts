import type { SiteSettings } from "@/lib/cms/types";

export const PAGE_SEO_KEYS = ["home", "subscriptions", "contact", "blog"] as const;
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
    publicPaths: ["/iptv-subscriptions-uk", "/iptv-subscriptions-uk/"],
  },
  contact: {
    label: "Contact",
    editorHref: "/sidhu/pages/contact/",
    publicPaths: ["/contact", "/contact/"],
  },
  blog: {
    label: "Blog listing",
    editorHref: "/sidhu/blog/",
    publicPaths: ["/blog", "/blog/"],
  },
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
