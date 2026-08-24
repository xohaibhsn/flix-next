"use server";

import { requireAdminAction } from "@/lib/auth/guards";
import { cms } from "@/lib/cms/repository";
import { revalidateSidhuCms } from "@/lib/cms/revalidate";
import type { CmsPage, SiteSettings } from "@/lib/cms/types";
import { isCloudinaryConfigured } from "@/lib/cloudinary";

export async function savePageAction(page: CmsPage) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    const saved = await cms.savePage(page);
    revalidateSidhuCms();
    return { ok: true as const, page: saved };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not save page.",
    };
  }
}

export async function saveSettingsAction(settings: SiteSettings) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    const saved = await cms.saveSettings(settings);
    revalidateSidhuCms();
    return { ok: true as const, settings: saved };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not save settings.",
    };
  }
}

export async function getCloudinaryStatusAction() {
  const unauthorized = await requireAdminAction();
  if (unauthorized) {
    return { configured: false, cloudName: "" };
  }
  const { getCloudinaryConfig } = await import("@/lib/cloudinary");
  const { cloudName } = getCloudinaryConfig();
  return {
    configured: isCloudinaryConfigured(),
    cloudName,
  };
}
