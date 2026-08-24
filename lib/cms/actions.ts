"use server";

import { requireAdminAction } from "@/lib/auth/guards";
import { cms } from "@/lib/cms/repository";
import { revalidateBlog, revalidateCategory, revalidateSidhuCms } from "@/lib/cms/revalidate";
import type {
  BlogCategory,
  BlogPost,
  CmsPage,
  FaqItem,
  PricingPlan,
  RedirectRule,
  SiteSettings,
} from "@/lib/cms/types";
import { isCloudinaryConfigured } from "@/lib/cloudinary";

import { publicErrorMessage } from "@/lib/security/errors";

function fail(error: unknown, fallback: string) {
  return { ok: false as const, error: publicErrorMessage(error, fallback) };
}

export async function savePageAction(page: CmsPage) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    const saved = await cms.savePage(page);
    revalidateSidhuCms();
    return { ok: true as const, page: saved };
  } catch (error) {
    return fail(error, "Could not save page.");
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
    return fail(error, "Could not save settings.");
  }
}

export async function savePlanAction(plan: PricingPlan) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    const saved = await cms.savePlan(plan);
    revalidateSidhuCms();
    return { ok: true as const, plan: saved };
  } catch (error) {
    return fail(error, "Could not save plan.");
  }
}

export async function deletePlanAction(id: string) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    await cms.deletePlan(id);
    revalidateSidhuCms();
    return { ok: true as const };
  } catch (error) {
    return fail(error, "Could not delete plan.");
  }
}

export async function saveFaqAction(item: FaqItem) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    const saved = await cms.saveFaq(item);
    revalidateSidhuCms();
    return { ok: true as const, item: saved };
  } catch (error) {
    return fail(error, "Could not save FAQ.");
  }
}

export async function deleteFaqAction(id: string) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    await cms.deleteFaq(id);
    revalidateSidhuCms();
    return { ok: true as const };
  } catch (error) {
    return fail(error, "Could not delete FAQ.");
  }
}

export async function saveCategoryAction(category: BlogCategory) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    const saved = await cms.saveCategory(category);
    revalidateSidhuCms();
    revalidateCategory(saved.slug);
    return { ok: true as const, category: saved };
  } catch (error) {
    return fail(error, "Could not save category.");
  }
}

export async function deleteCategoryAction(id: string) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    await cms.deleteCategory(id);
    revalidateSidhuCms();
    return { ok: true as const };
  } catch (error) {
    return fail(error, "Could not delete category.");
  }
}

export async function savePostAction(post: BlogPost) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    const saved = await cms.savePost(post);
    revalidateSidhuCms();
    revalidateBlog(saved.slug);
    return { ok: true as const, post: saved };
  } catch (error) {
    return fail(error, "Could not save post.");
  }
}

export async function deletePostAction(id: string) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    await cms.deletePost(id);
    revalidateSidhuCms();
    revalidateBlog();
    return { ok: true as const };
  } catch (error) {
    return fail(error, "Could not delete post.");
  }
}

export async function saveRedirectAction(rule: RedirectRule) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    const saved = await cms.saveRedirect(rule);
    revalidateSidhuCms();
    return { ok: true as const, rule: saved };
  } catch (error) {
    return fail(error, "Could not save redirect.");
  }
}

export async function deleteRedirectAction(id: string) {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  try {
    await cms.deleteRedirect(id);
    revalidateSidhuCms();
    return { ok: true as const };
  } catch (error) {
    return fail(error, "Could not delete redirect.");
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

export async function getSystemStatusAction() {
  const unauthorized = await requireAdminAction();
  if (unauthorized) return unauthorized;
  const { isDatabaseConfigured } = await import("@/lib/db/config");
  const { getAdminAuthConfig } = await import("@/lib/auth/config");
  return {
    ok: true as const,
    database: isDatabaseConfigured(),
    cloudinary: isCloudinaryConfigured(),
    adminAuth: Boolean(getAdminAuthConfig()),
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    version: "0.1.0",
  };
}

export async function submitContactAction(input: {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  company: string;
}) {
  if (input.company?.trim()) {
    return { ok: true as const };
  }
  const { headers } = await import("next/headers");
  const { checkContactRateLimit } = await import("@/lib/auth/rate-limit");
  const { sanitizeMessage } = await import("@/lib/cms/validation");
  const { createId } = await import("@/lib/cms/ids");
  const { revalidatePath } = await import("next/cache");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = checkContactRateLimit(ip);
  if (!limited.ok) {
    return { ok: false as const, error: "Please wait a few minutes before sending another message." };
  }
  const saved = sanitizeMessage({
    id: createId("msg"),
    name: input.name,
    email: input.email,
    phone: input.phone,
    subject: input.subject,
    message: input.message,
    createdAt: new Date().toISOString(),
  });
  if (!saved.name || !saved.email || !saved.subject || !saved.message) {
    return { ok: false as const, error: "Name, email, subject, and message are required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(saved.email)) {
    return { ok: false as const, error: "Enter a valid email address." };
  }
  try {
    await cms.addMessage(saved);
    revalidatePath("/sidhu/messages/");
    return { ok: true as const };
  } catch (error) {
    return fail(error, "Could not send your message.");
  }
}
