/**
 * Article image + on-page SEO preparation for the automation pathway.
 * Prefer existing Cloudinary inventory. Paid image generation remains gated.
 */

import { authorizePilotSpend, emptyPilotUsage, requireBoundedCostEstimate } from "@/lib/cms/seo-automation/budgets";
import { assertSeoAutomationPathAllowed } from "@/lib/cms/seo-automation/master-control";

export const SEO_AUTOMATION_IMAGE_SEO_SPEC = "seo-automation-image-seo-v1" as const;

export type SeoAutomationImagePlan = {
  maxImages: 1 | 2;
  preferExistingLicensedAssets: true;
  generateOriginalOnlyViaApprovedAdapter: true;
  requireAltFromActualVisualContent: true;
  recordCloudinaryAssetIdentity: true;
  preventDuplicateUploads: true;
  avoidOrphanMediaOnFailedApply: true;
};

export type SeoAutomationOnPageSeoPlan = {
  seoTitle: boolean;
  metaDescription: boolean;
  canonicalUrl: boolean;
  slugValidation: boolean;
  headingStructure: boolean;
  internalLinks: boolean;
  featuredImage: boolean;
  imageAlt: boolean;
  structuredData: boolean;
  duplicateCannibalizationChecks: boolean;
  /** Must not alter sitewide SEO settings. */
  preserveSitewideSeoSettings: true;
};

export const SEO_AUTOMATION_IMAGE_PLAN: SeoAutomationImagePlan = {
  maxImages: 2,
  preferExistingLicensedAssets: true,
  generateOriginalOnlyViaApprovedAdapter: true,
  requireAltFromActualVisualContent: true,
  recordCloudinaryAssetIdentity: true,
  preventDuplicateUploads: true,
  avoidOrphanMediaOnFailedApply: true,
};

export const SEO_AUTOMATION_ONPAGE_SEO_PLAN: SeoAutomationOnPageSeoPlan = {
  seoTitle: true,
  metaDescription: true,
  canonicalUrl: true,
  slugValidation: true,
  headingStructure: true,
  internalLinks: true,
  featuredImage: true,
  imageAlt: true,
  structuredData: true,
  duplicateCannibalizationChecks: true,
  preserveSitewideSeoSettings: true,
};

export type SeoAutomationImageGenerationDecision =
  | {
      ok: false;
      code: string;
      error: string;
      executePaidImageApi: false;
    }
  | {
      ok: true;
      executePaidImageApi: false;
      reuseExistingAssetIds: string[];
      message: string;
    };

/**
 * Decide image sourcing. Never calls a paid image API from this helper.
 */
export function planArticleImages(args: {
  existingSuitableAssetIds: string[];
  requestedCount: number;
  paidImageProviderConfigured: boolean;
  paidImageModelAllowlisted: boolean;
  estimatedCostUsd: number | null;
  imagesAlreadyUsedInPilot: number;
}): SeoAutomationImageGenerationDecision {
  const genPath = assertSeoAutomationPathAllowed("generation");
  if (!genPath.ok) {
    // Image reuse from inventory is still allowed as a planning result without generation path.
  }

  const count = Math.min(Math.max(0, args.requestedCount), SEO_AUTOMATION_IMAGE_PLAN.maxImages);
  const reuse = args.existingSuitableAssetIds.slice(0, count);
  if (reuse.length >= count && count > 0) {
    return {
      ok: true,
      executePaidImageApi: false,
      reuseExistingAssetIds: reuse,
      message: "Reuse existing licensed Cloudinary assets; no paid image generation.",
    };
  }

  if (!args.paidImageProviderConfigured || !args.paidImageModelAllowlisted) {
    return {
      ok: false,
      code: "image_provider_not_ready",
      error: "Paid image provider/model not verified; generation skipped.",
      executePaidImageApi: false,
    };
  }

  const cost = requireBoundedCostEstimate(args.estimatedCostUsd);
  if (!cost.ok) {
    return {
      ok: false,
      code: cost.code,
      error: cost.error,
      executePaidImageApi: false,
    };
  }

  const need = count - reuse.length;
  const spend = authorizePilotSpend(
    { ...emptyPilotUsage(), images: args.imagesAlreadyUsedInPilot },
    "images",
    need,
  );
  if (!spend.ok) {
    return {
      ok: false,
      code: spend.code,
      error: spend.error,
      executePaidImageApi: false,
    };
  }

  return {
    ok: true,
    executePaidImageApi: false,
    reuseExistingAssetIds: reuse,
    message:
      "Image generation bounds validated but paid API remains unexecuted without operation-specific authority.",
  };
}

export type SeoOnPageAutomationCheck = {
  ok: boolean;
  blockers: string[];
};

/**
 * Lightweight on-page SEO checklist for automation (deterministic, no AI bypass).
 */
export function evaluateAutomationOnPageSeo(args: {
  seoTitle: string;
  metaDescription: string;
  slug: string;
  canonicalUrl: string;
  h1Count: number;
  internalLinkCount: number;
  featuredImagePresent: boolean;
  featuredImageAlt: string;
}): SeoOnPageAutomationCheck {
  const blockers: string[] = [];
  if (!String(args.seoTitle || "").trim()) blockers.push("seo_title_missing");
  if (!String(args.metaDescription || "").trim()) blockers.push("meta_description_missing");
  if (!String(args.slug || "").trim()) blockers.push("slug_missing");
  if (!String(args.canonicalUrl || "").trim()) blockers.push("canonical_missing");
  if (args.h1Count !== 1) blockers.push("h1_count_invalid");
  if (args.internalLinkCount < 1) blockers.push("internal_links_missing");
  if (!args.featuredImagePresent) blockers.push("featured_image_missing");
  if (args.featuredImagePresent && !String(args.featuredImageAlt || "").trim()) {
    blockers.push("featured_image_alt_missing");
  }
  return { ok: blockers.length === 0, blockers };
}
