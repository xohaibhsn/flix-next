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
  "/sidhu/media",
  "/sidhu/media/",
  "/sidhu/settings",
  "/sidhu/settings/",
];

export function revalidatePublicSite() {
  revalidatePath("/", "layout");
  for (const path of PUBLIC_PATHS) {
    revalidatePath(path);
  }
}

export function revalidateSidhuCms() {
  revalidatePublicSite();
  for (const path of SIDHU_PATHS) {
    revalidatePath(path);
  }
}
