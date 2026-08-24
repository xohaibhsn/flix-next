import { revalidatePath } from "next/cache";

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
];

export function revalidatePublicSite() {
  revalidatePath("/", "layout");
  for (const path of PUBLIC_PATHS) {
    revalidatePath(path);
  }
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

export function revalidateCategory(slug?: string) {
  if (!slug) return;
  revalidatePath(`/category/${slug}`);
  revalidatePath(`/category/${slug}/`);
}
