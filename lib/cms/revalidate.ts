import { revalidatePath } from "next/cache";
import { PAGE_SEO_META, type PageSeoKey } from "@/lib/cms/page-seo";
import { COMPANY_PAGES } from "@/lib/cms/company-pages";

const PUBLIC_PATHS = [
  "/",
  "/welcome",
  "/welcome/",
  "/contact",
  "/contact/",
  "/blog",
  "/blog/",
  "/iptv-subscriptions-uk",
  "/iptv-subscriptions-uk/",
  ...COMPANY_PAGES.flatMap((page) => [page.slug.replace(/\/$/, ""), page.slug]),
];

const SIDHU_PATHS = [
  "/sidhu",
  "/sidhu/",
  "/sidhu/pages",
  "/sidhu/pages/",
  "/sidhu/pages/home",
  "/sidhu/pages/home/",
  "/sidhu/pages/subscriptions",
  "/sidhu/pages/subscriptions/",
  "/sidhu/pages/contact",
  "/sidhu/pages/contact/",
  ...COMPANY_PAGES.flatMap((page) => [
    `/sidhu/pages/${page.adminParam}`,
    `/sidhu/pages/${page.adminParam}/`,
  ]),
  "/sidhu/blog",
  "/sidhu/blog/",
  "/sidhu/pricing",
  "/sidhu/pricing/",
  "/sidhu/faqs",
  "/sidhu/faqs/",
  "/sidhu/seo",
  "/sidhu/seo/",
  "/sidhu/media",
  "/sidhu/media/",
  "/sidhu/redirects",
  "/sidhu/redirects/",
  "/sidhu/settings",
  "/sidhu/settings/",
  "/sidhu/messages",
  "/sidhu/messages/",
  "/sidhu/users",
  "/sidhu/users/",
  "/sidhu/account",
  "/sidhu/account/",
];

export function revalidatePublicSite() {
  revalidatePath("/", "layout");
  for (const path of PUBLIC_PATHS) {
    revalidatePath(path);
  }
  revalidatePath("/icon");
  revalidatePath("/favicon.ico");
  revalidatePath("/sitemap.xml");
  revalidatePath("/robots.txt");
}

export function revalidateAfterSettingsSave() {
  revalidatePath("/", "layout");
  for (const path of PUBLIC_PATHS) {
    revalidatePath(path);
  }
  revalidatePath("/icon");
  revalidatePath("/favicon.ico");
  revalidatePath("/sitemap.xml");
  revalidatePath("/robots.txt");
}

export function revalidateSidhuCms() {
  revalidatePublicSite();
  for (const path of SIDHU_PATHS) {
    revalidatePath(path);
  }
}

export function revalidateBlog(slug?: string) {
  revalidatePath("/blog");
  revalidatePath("/blog/");
  revalidatePath("/category", "layout");
  if (slug) {
    revalidatePath(`/blog/${slug}`);
    revalidatePath(`/blog/${slug}/`);
  }
  revalidatePath("/sitemap.xml");
}

export function revalidatePageSeo(key: PageSeoKey) {
  revalidatePath("/", "layout");
  const meta = PAGE_SEO_META[key];
  for (const path of meta.publicPaths) revalidatePath(path);
  revalidatePath(meta.editorHref);
  revalidatePath("/sitemap.xml");
  revalidatePath("/sidhu/seo");
  revalidatePath("/sidhu/seo/");
}

export function revalidateCategory(slug?: string) {
  if (!slug) return;
  revalidatePath(`/category/${slug}`);
  revalidatePath(`/category/${slug}/`);
}
