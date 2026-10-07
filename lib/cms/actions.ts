"use server";

import { requireAdminAction } from "@/lib/auth/guards";
import { cms } from "@/lib/cms/repository";
import {
  revalidateAfterSettingsSave,
  revalidateBlog,
  revalidateCategory,
  revalidatePageSeo,
  revalidatePublicFaqsData,
  revalidatePublicPagesData,
  revalidatePublicPlansData,
  revalidatePublicSlug,
  revalidateSidhuCms,
} from "@/lib/cms/revalidate";
import type {
  BlogCategory,
  BlogPost,
  CmsPage,
  FaqItem,
  PageSeo,
  PricingPlan,
  RedirectRule,
  SiteSettings,
} from "@/lib/cms/types";
import { normalizeJsonLdInput } from "@/lib/cms/json-ld-input";
import { headCodePolicyError, sanitizeCustomHeadCode } from "@/lib/cms/head-code";
import { isPageSeoKey, PAGE_SEO_META } from "@/lib/cms/page-seo";
import { isCloudinaryConfigured } from "@/lib/cloudinary";
import {
  isKnownLocalDestination,
  knownLocalDestinations,
  lockedSlugForPageId,
  pathsForSlug,
  validateCmsPageSlug,
} from "@/lib/cms/page-paths";
import { applyPageSlugChange } from "@/lib/cms/slug-change";
import { isDangerousUrl, isReservedRedirectSource, REDIRECT_ERRORS, withSlash } from "@/lib/cms/redirects";
import {
  evaluateCategorySeoPostSave,
  evaluatePageSeoPostSave,
  evaluatePostSeoPostSave,
  safeSeoPostSaveAdvisory,
  unavailableSeoPostSaveAdvisory,
  type SeoPostSaveAdvisory,
} from "@/lib/cms/seo-post-save-guard";
import {
  evaluatePrePublishQa,
  prePublishBlocksPersist,
} from "@/lib/cms/seo-prepublish-qa";
import type { PrePublishQaResult } from "@/lib/cms/seo-prepublish-qa-types";
import { sanitizePost } from "@/lib/cms/validation";
import { ClientError, publicErrorMessage } from "@/lib/security/errors";

function fail(error: unknown, fallback: string) {
  return { ok: false as const, error: publicErrorMessage(error, fallback) };
}

async function attachSeoAdvisory(
  evaluate: () => ReturnType<typeof evaluatePageSeoPostSave>,
): Promise<SeoPostSaveAdvisory> {
  try {
    return safeSeoPostSaveAdvisory(evaluate);
  } catch {
    return unavailableSeoPostSaveAdvisory();
  }
}

export async function savePageAction(page: CmsPage) {
  const unauthorized = await requireAdminAction("pages");
  if (unauthorized) return unauthorized;
  try {
    const current = await cms.getPageById(page.id);
    if (!current) throw new ClientError("Page not found.");
    const [pages, posts, categories] = await Promise.all([
      cms.listPages(),
      cms.listPosts(),
      cms.listCategories(),
    ]);
    const locked = lockedSlugForPageId(current.id);
    const requestedSlug = locked ?? page.slug;
    const validated = validateCmsPageSlug(requestedSlug, current, pages, posts, categories);
    if (!validated.ok) throw new ClientError(validated.error);
    const nextPage = { ...page, id: current.id, slug: validated.slug };
    const saved = await cms.savePage(nextPage);
    if (withSlash(current.slug) !== withSlash(saved.slug)) {
      await applyPageSlugChange(cms, current, saved);
      for (const path of [...pathsForSlug(current.slug), ...pathsForSlug(saved.slug)]) {
        revalidatePublicSlug(path);
      }
    }
    revalidatePublicPagesData();
    revalidateSidhuCms();
    return { ok: true as const, page: saved };
  } catch (error) {
    return fail(error, "Could not save page.");
  }
}

export async function saveSettingsAction(settings: SiteSettings) {
  const unauthorized = await requireAdminAction("site_settings");
  if (unauthorized) return unauthorized;
  try {
    const current = await cms.getSettings();
    const customHeadCode =
      typeof settings.customHeadCode === "string"
        ? sanitizeCustomHeadCode(settings.customHeadCode)
        : sanitizeCustomHeadCode(current.customHeadCode);
    const headError = headCodePolicyError(customHeadCode);
    if (headError) return { ok: false as const, error: headError };
    const saved = await cms.saveSettings({
      ...settings,
      pageSeo: current.pageSeo,
      siteCustomJsonLd: current.siteCustomJsonLd,
      customHeadCode,
    });
    revalidateAfterSettingsSave();
    return { ok: true as const, settings: saved };
  } catch (error) {
    return fail(error, "Could not save settings.");
  }
}

export async function saveSeoSettingsAction(settings: SiteSettings) {
  const unauthorized = await requireAdminAction("seo");
  if (unauthorized) return unauthorized;
  try {
    const site = normalizeJsonLdInput(settings.siteCustomJsonLd);
    if (!site.ok) return { ok: false as const, error: `Site-wide schema: ${site.error}` };
    const current = await cms.getSettings();
    const saved = await cms.saveSettings({
      ...current,
      siteCustomJsonLd: site.stored,
    });
    revalidateAfterSettingsSave();
    return { ok: true as const, settings: saved };
  } catch (error) {
    return fail(error, "Could not save SEO settings.");
  }
}

export async function savePageSeoAction(key: string, seo: PageSeo) {
  const unauthorized = await requireAdminAction("seo");
  if (unauthorized) return unauthorized;
  if (!isPageSeoKey(key)) return { ok: false as const, error: "Unknown page." };
  try {
    const jsonLd = normalizeJsonLdInput(seo.customJsonLd);
    if (!jsonLd.ok) return { ok: false as const, error: `${PAGE_SEO_META[key].label}: ${jsonLd.error}` };
    const current = await cms.getSettings();
    const saved = await cms.saveSettings({
      ...current,
      pageSeo: {
        ...current.pageSeo,
        [key]: { ...seo, customJsonLd: jsonLd.stored },
      },
    });
    revalidatePageSeo(key);
    const savedSeo = saved.pageSeo[key];
    const seoAdvisory = await attachSeoAdvisory(() =>
      evaluatePageSeoPostSave({
        key,
        seo: savedSeo,
        siteName: saved.siteName,
        siteTagline: saved.tagline,
        fallbackTitle: PAGE_SEO_META[key].label,
      }),
    );
    return { ok: true as const, settings: saved, seoAdvisory };
  } catch (error) {
    return fail(error, "Could not save page SEO.");
  }
}

export async function savePlanAction(plan: PricingPlan) {
  const unauthorized = await requireAdminAction("pricing");
  if (unauthorized) return unauthorized;
  try {
    const saved = await cms.savePlan(plan);
    revalidatePublicPlansData();
    revalidateSidhuCms();
    return { ok: true as const, plan: saved };
  } catch (error) {
    return fail(error, "Could not save plan.");
  }
}

export async function deletePlanAction(id: string) {
  const unauthorized = await requireAdminAction("pricing");
  if (unauthorized) return unauthorized;
  try {
    await cms.deletePlan(id);
    revalidatePublicPlansData();
    revalidateSidhuCms();
    return { ok: true as const };
  } catch (error) {
    return fail(error, "Could not delete plan.");
  }
}

export async function saveFaqAction(item: FaqItem) {
  const unauthorized = await requireAdminAction("faqs");
  if (unauthorized) return unauthorized;
  try {
    const saved = await cms.saveFaq(item);
    revalidatePublicFaqsData();
    revalidateSidhuCms();
    return { ok: true as const, item: saved };
  } catch (error) {
    return fail(error, "Could not save FAQ.");
  }
}

export async function deleteFaqAction(id: string) {
  const unauthorized = await requireAdminAction("faqs");
  if (unauthorized) return unauthorized;
  try {
    await cms.deleteFaq(id);
    revalidatePublicFaqsData();
    revalidateSidhuCms();
    return { ok: true as const };
  } catch (error) {
    return fail(error, "Could not delete FAQ.");
  }
}

export async function saveCategoryAction(category: BlogCategory) {
  const unauthorized = await requireAdminAction("blog");
  if (unauthorized) return unauthorized;
  try {
    const saved = await cms.saveCategory(category);
    revalidateSidhuCms();
    revalidateCategory(saved.slug);
    let seoAdvisory: SeoPostSaveAdvisory;
    try {
      const settings = await cms.getSettings();
      seoAdvisory = await attachSeoAdvisory(() =>
        evaluateCategorySeoPostSave({
          category: saved,
          siteName: settings.siteName,
          siteTagline: settings.tagline,
        }),
      );
    } catch {
      seoAdvisory = unavailableSeoPostSaveAdvisory();
    }
    return { ok: true as const, category: saved, seoAdvisory };
  } catch (error) {
    return fail(error, "Could not save category.");
  }
}

export async function deleteCategoryAction(id: string) {
  const unauthorized = await requireAdminAction("blog");
  if (unauthorized) return unauthorized;
  try {
    await cms.deleteCategory(id);
    revalidateSidhuCms();
    return { ok: true as const };
  } catch (error) {
    return fail(error, "Could not delete category.");
  }
}

export type SavePostActionInput = {
  post: BlogPost;
  /** Server-issued fingerprint from a prior warnings-only Pre-Publish result. */
  prePublishConfirmationFingerprint?: string;
};

export type SavePostActionResult =
  | { ok: true; post: BlogPost; seoAdvisory: SeoPostSaveAdvisory; prePublish?: PrePublishQaResult }
  | {
      ok: false;
      error: string;
      prePublish?: PrePublishQaResult;
    };

export async function savePostAction(
  postOrInput: BlogPost | SavePostActionInput,
): Promise<SavePostActionResult> {
  const unauthorized = await requireAdminAction("blog");
  if (unauthorized) return unauthorized;

  const input: SavePostActionInput =
    postOrInput && typeof postOrInput === "object" && "post" in postOrInput
      ? postOrInput
      : { post: postOrInput as BlogPost };

  try {
    const previous = input.post.id ? await cms.getPostById(input.post.id) : null;
    const candidate = sanitizePost(input.post);
    const [posts, featuredMedia, ogMedia] = await Promise.all([
      cms.listPosts(),
      candidate.featuredImage?.id ? cms.getMediaById(candidate.featuredImage.id) : Promise.resolve(null),
      candidate.ogImage?.id ? cms.getMediaById(candidate.ogImage.id) : Promise.resolve(null),
    ]);

    const prePublish = evaluatePrePublishQa({
      previous,
      raw: input.post,
      candidate,
      posts,
      featuredMedia,
      ogMedia,
      confirmationFingerprint: input.prePublishConfirmationFingerprint || null,
    });

    if (prePublishBlocksPersist(prePublish)) {
      const error =
        prePublish.status === "blocked"
          ? "Pre-Publish SEO QA blocked this save. Fix the blockers and try again."
          : "Pre-Publish SEO QA found warnings. Review them, then confirm Publish Anyway to continue.";
      return { ok: false as const, error, prePublish };
    }

    const saved = await cms.savePost(candidate);
    revalidateSidhuCms();
    revalidateBlog(saved.slug);
    let seoAdvisory: SeoPostSaveAdvisory;
    try {
      const settings = await cms.getSettings();
      const savedFeatured =
        saved.featuredImage?.id ? await cms.getMediaById(saved.featuredImage.id) : null;
      seoAdvisory = await attachSeoAdvisory(() =>
        evaluatePostSeoPostSave({
          post: saved,
          siteName: settings.siteName,
          siteTagline: settings.tagline,
          featuredMedia: savedFeatured,
        }),
      );
    } catch {
      seoAdvisory = unavailableSeoPostSaveAdvisory();
    }
    return { ok: true as const, post: saved, seoAdvisory, prePublish };
  } catch (error) {
    return fail(error, "Could not save post.");
  }
}

export async function deletePostAction(id: string) {
  const unauthorized = await requireAdminAction("blog");
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
  const unauthorized = await requireAdminAction("redirects");
  if (unauthorized) return unauthorized;
  try {
    const source = (rule.sourcePath || "").trim();
    const destination = (rule.destinationPath || "").trim();
    if (!source || !destination) throw new ClientError(REDIRECT_ERRORS.empty);
    if (isDangerousUrl(destination) || destination.startsWith("//")) {
      throw new ClientError(REDIRECT_ERRORS.unsafe);
    }
    if (isReservedRedirectSource(source)) throw new ClientError(REDIRECT_ERRORS.reserved);
    if (!destination.startsWith("/") && !/^https?:\/\//i.test(destination)) {
      throw new ClientError(REDIRECT_ERRORS.unsafe);
    }
    if (rule.active && destination.startsWith("/") && !destination.startsWith("//")) {
      const [pages, posts, categories] = await Promise.all([
        cms.listPages(),
        cms.listPosts(),
        cms.listCategories(),
      ]);
      const known = knownLocalDestinations(pages, posts, categories);
      if (!isKnownLocalDestination(destination, known)) {
        throw new ClientError(REDIRECT_ERRORS.unknownDest);
      }
    }
    const saved = await cms.saveRedirect(rule);
    revalidateSidhuCms();
    return { ok: true as const, rule: saved };
  } catch (error) {
    return fail(error, "Could not save redirect.");
  }
}

export async function deleteRedirectAction(id: string) {
  const unauthorized = await requireAdminAction("redirects");
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
  const unauthorized = await requireAdminAction("dashboard");
  if (unauthorized) return unauthorized;
  const { isDatabaseConfigured } = await import("@/lib/db/config");
  const { getSessionSecret } = await import("@/lib/auth/config");
  return {
    ok: true as const,
    database: isDatabaseConfigured(),
    cloudinary: isCloudinaryConfigured(),
    adminAuth: Boolean(getSessionSecret()),
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
