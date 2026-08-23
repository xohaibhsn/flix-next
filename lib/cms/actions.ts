"use server";

import { revalidatePath } from "next/cache";
import { cms } from "@/lib/cms/repository";
import type { CmsPage, SiteSettings } from "@/lib/cms/types";
import { isCloudinaryConfigured } from "@/lib/cloudinary";

function revalidatePublic() {
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/welcome");
  revalidatePath("/contact");
  revalidatePath("/blog");
  revalidatePath("/iptv-subscriptions-uk");
  revalidatePath("/sidhu");
  revalidatePath("/sidhu/pages");
  revalidatePath("/sidhu/pages/home");
  revalidatePath("/sidhu/media");
  revalidatePath("/sidhu/settings");
}

export async function savePageAction(page: CmsPage) {
  try {
    const saved = await cms.savePage(page);
    revalidatePublic();
    return { ok: true as const, page: saved };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not save page.",
    };
  }
}

export async function saveSettingsAction(settings: SiteSettings) {
  try {
    const saved = await cms.saveSettings(settings);
    revalidatePublic();
    return { ok: true as const, settings: saved };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not save settings.",
    };
  }
}

export async function getCloudinaryStatusAction() {
  const { getCloudinaryConfig } = await import("@/lib/cloudinary");
  const { cloudName } = getCloudinaryConfig();
  return {
    configured: isCloudinaryConfigured(),
    cloudName,
  };
}
