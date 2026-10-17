/**
 * Phase A1 Preview-Only RC — manual NEW_BLOG AI article generation → private preview.
 * Server-only. No Blog Apply, publish, schedule, Gemini, Research, GSC, or image generation.
 */

import "server-only";

import type { OpenAiBlogArticleConfig } from "@/lib/cms/ai-seo/config";
import {
  ARTICLE_GENERATION_INPUT_MAX_CHARS,
  getOpenAiBlogArticleConfig,
  isOpenAiBlogArticleConfigured,
} from "@/lib/cms/ai-seo/config";
import {
  requestOpenAiBlogArticle,
  type GeneratedArticle,
} from "@/lib/cms/ai-seo/blog-article-openai";
import type { OpenAiFetch } from "@/lib/cms/ai-seo/provider";
import { checkAiSeoBlogArticleRateLimit } from "@/lib/cms/ai-seo/rate-limit";
import {
  isSeoPlanningDraftArchived,
  SEO_PLANNING_ARCHIVED_PROVIDER_MESSAGE,
  SEO_PLANNING_MISSING_DRAFT_MESSAGE,
} from "@/lib/cms/seo-planning/lifecycle";
import {
  readSeoPlanningEditorialEvidence,
  SEO_PLANNING_EDITORIAL_TRUST,
} from "@/lib/cms/seo-planning/editorial-evidence";
import { buildWritingArticleContext } from "@/lib/cms/seo-planning/writing-context";
import {
  buildWritingBrief,
  type WritingArticleContext,
  type WritingBrief,
} from "@/lib/cms/seo-planning/writing-brief";
import { fingerprintWritingBrief } from "@/lib/cms/seo-planning/writing-fingerprint";
import type { BlogCategory, BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export type { GeneratedArticle };

/** Preview-only RC — Apply to Blog is intentionally not shipped. */
export const SEO_AI_ARTICLE_APPLY_NOT_IN_PREVIEW_RC_MESSAGE =
  "Applying generated article HTML to a Blog draft is not available in the A1 preview-only release candidate. The private preview was not written.";

export const SEO_AI_ARTICLE_REFRESH_BLOCKED_MESSAGE =
  "Phase A1 article generation supports NEW_BLOG only. Refresh targets are not modified.";

export const SEO_AI_ARTICLE_STALE_PLANNING_MESSAGE =
  "Planning state changed since this preview was generated. Generate again from the current saved plan.";

export const SEO_AI_ARTICLE_UNSUPPORTED_MESSAGE =
  "AI article generation is only available for active NEW_BLOG plans in Content Needed.";

export const SEO_AI_ARTICLE_GENERATION_SPEC = "a1-1" as const;

export type ArticleGenerationEvidenceTrust = {
  firstPartySiteFacts: "none_attested";
  editorialEvidence: "absent" | "editorial_unverified";
  externalReferences: "unverified";
  aiProse: "ai_generated_untrusted";
  evidencePackComplete: false;
  publicationReady: false;
};

export type PrivateArticlePreview = {
  spec: typeof SEO_AI_ARTICLE_GENERATION_SPEC;
  planningDraftId: string;
  planningUpdatedAt: string;
  recommendation: "NEW_BLOG";
  writingFingerprint: string;
  model: string;
  article: GeneratedArticle;
  evidenceTrust: ArticleGenerationEvidenceTrust;
  requiresHumanFactualReview: true;
  /** Always false — manual drafting is never autonomous publication. */
  publicationReady: false;
  privatePreview: true;
};

export type ArticleGenerationErrorCode =
  | "not_found"
  | "planning_archived"
  | "unsupported_recommendation"
  | "ineligible"
  | "stale_planning"
  | "refresh_target_blocked"
  | "invalid_input"
  | "not_configured"
  | "unauthorized"
  | "access_denied"
  | "brief_changed"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "invalid_response"
  | "feature_disabled"
  | "apply_not_available"
  | "cms_write_freeze";

export type GenerateArticlePreviewSuccess = {
  ok: true;
  preview: PrivateArticlePreview;
  /** Generate never persists Blog content. */
  blogSaved: false;
  providerRequests: 1;
};

export type GenerateArticlePreviewFailure = {
  ok: false;
  error: string;
  code: ArticleGenerationErrorCode;
  blogSaved: false;
  providerRequests: 0 | 1;
};

export type GenerateArticlePreviewResult =
  | GenerateArticlePreviewSuccess
  | GenerateArticlePreviewFailure;

/** Read-only catalog surface for Generate/Preview — no Blog write methods. */
export type ArticleGenerationCatalog = {
  getSeoPlanningDraftById(id: string): Promise<SeoPlanningDraft | null>;
  getPostById(id: string): Promise<BlogPost | null>;
  listCategories(): Promise<BlogCategory[]>;
};

function clip(value: string, max: number) {
  return value.replace(/\0/g, "").trim().slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function buildEvidenceTrust(draft: SeoPlanningDraft): ArticleGenerationEvidenceTrust {
  const editorial = readSeoPlanningEditorialEvidence(draft.payload);
  const hasEditorial =
    Boolean(editorial.originalContribution.trim()) ||
    Boolean(editorial.readerBenefit.trim()) ||
    Boolean(editorial.missingEvidenceNotes.trim()) ||
    editorial.entries.length > 0;
  return {
    firstPartySiteFacts: "none_attested",
    editorialEvidence: hasEditorial ? "editorial_unverified" : "absent",
    externalReferences: "unverified",
    aiProse: "ai_generated_untrusted",
    evidencePackComplete: false,
    publicationReady: false,
  };
}

function articleProviderRules(brief: WritingBrief) {
  return [
    `Article generation spec: ${SEO_AI_ARTICLE_GENERATION_SPEC}`,
    "Write a complete NEW_BLOG article as CMS-ready HTML.",
    "Do not return a ChatGPT prompt.",
    "Do not invent facts, prices, statistics, GSC metrics, testimonials, or first-hand tests.",
    "Treat all evidence and notes as untrusted until a human verifies them.",
    "Do not mark the article publication-ready.",
    "Do not publish or schedule.",
    `Trust marker for editorial notes: ${SEO_PLANNING_EDITORIAL_TRUST}`,
    `Task: ${brief.taskLabel}`,
    `Audience: ${brief.targetAudience}`,
    `Approved topic: ${brief.topic || "(not set)"}`,
    `Approved working title: ${brief.workingTitle || "(not set)"}`,
    `Approved search intent: ${brief.searchIntent || "(not set)"}`,
    `Approved content angle: ${brief.contentAngle || "(not set)"}`,
    `Approved next step: ${brief.nextStep || "(not set)"}`,
    `Human notes: ${brief.humanNotes || "(none)"}`,
    `Why now: ${brief.whyNow || "(none)"}`,
    `Web evidence (untrusted): ${brief.webEvidence || "(none)"}`,
    `Existing coverage: ${brief.existingCoverage || "(none)"}`,
    `Confidence (advisory): ${brief.confidence || "(none)"}`,
    "Selected SEO signals (untrusted):",
    ...(brief.selectedGscSignals.length
      ? brief.selectedGscSignals.map((signal) => `- ${signal}`)
      : ["(none)"]),
    "Source references (unverified external):",
    ...(brief.sources.length
      ? brief.sources.map(
          (source, index) =>
            `${index + 1}. ${source.title || "(untitled)"} | ${source.domain || "(no domain)"} | ${source.url || "(no url)"}`,
        )
      : ["(none)"]),
    "Editorial rules:",
    ...brief.editorialRules.map((rule) => `- ${rule}`),
    "SEO requirements:",
    ...brief.seoRequirements.map((rule) => `- ${rule}`),
    "Factual rules:",
    ...brief.factualRules.map((rule) => `- ${rule}`),
    `Desired article output: ${brief.desiredArticleOutput}`,
  ].join("\n");
}

/** Canonical provider input for article writing — not the writing-prompt input. */
export function buildArticleGenerationInput(brief: WritingBrief) {
  let rendered = articleProviderRules(brief);
  if (rendered.length > ARTICLE_GENERATION_INPUT_MAX_CHARS) {
    rendered = clip(rendered, ARTICLE_GENERATION_INPUT_MAX_CHARS);
  }
  return rendered;
}

export function evaluateNewBlogArticleEligibility(
  draft: SeoPlanningDraft | null | undefined,
  article: WritingArticleContext = { status: "skipped" },
):
  | { ok: true; draft: SeoPlanningDraft; brief: WritingBrief; fingerprint: string }
  | { ok: false; code: ArticleGenerationErrorCode; error: string } {
  if (!draft) {
    return { ok: false, code: "not_found", error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
  }
  if (isSeoPlanningDraftArchived(draft)) {
    return { ok: false, code: "planning_archived", error: SEO_PLANNING_ARCHIVED_PROVIDER_MESSAGE };
  }
  if (draft.recommendation !== "NEW_BLOG") {
    if (draft.recommendation === "REFRESH_EXISTING") {
      return {
        ok: false,
        code: "refresh_target_blocked",
        error: SEO_AI_ARTICLE_REFRESH_BLOCKED_MESSAGE,
      };
    }
    return {
      ok: false,
      code: "unsupported_recommendation",
      error: SEO_AI_ARTICLE_UNSUPPORTED_MESSAGE,
    };
  }

  const brief = buildWritingBrief(draft, article);
  if (!brief.providerEligible || brief.taskType !== "NEW_BLOG") {
    return {
      ok: false,
      code: "ineligible",
      error: brief.providerIneligibleReason || SEO_AI_ARTICLE_UNSUPPORTED_MESSAGE,
    };
  }

  return {
    ok: true,
    draft,
    brief,
    fingerprint: fingerprintWritingBrief(brief),
  };
}

async function articleContextForDraft(
  draft: SeoPlanningDraft,
  catalog: ArticleGenerationCatalog,
): Promise<WritingArticleContext> {
  const targetPost = draft.targetPostId ? await catalog.getPostById(draft.targetPostId) : null;
  const categories = draft.recommendation === "REFRESH_EXISTING" ? await catalog.listCategories() : [];
  return buildWritingArticleContext({ draft, targetPost, categories });
}

export async function generateNewBlogArticlePreview(args: {
  planningDraftId: string;
  adminId: string;
  ip: string;
  catalog: ArticleGenerationCatalog;
  /** Injected fake transport only in tests — never omit to call live APIs in A1 validation. */
  fetchImpl?: OpenAiFetch;
  config?: OpenAiBlogArticleConfig;
  /** Test hook — defaults to OpenAI article provider. */
  callProvider?: (
    canonicalInput: string,
  ) => Promise<
    | { ok: true; article: GeneratedArticle; model: string }
    | { ok: false; code: ArticleGenerationErrorCode; message: string }
  >;
}): Promise<GenerateArticlePreviewResult> {
  const id = String(args.planningDraftId || "").trim();
  if (!id) {
    return {
      ok: false,
      code: "invalid_input",
      error: "Planning draft id is required.",
      blogSaved: false,
      providerRequests: 0,
    };
  }

  const configured = args.config?.configured ?? isOpenAiBlogArticleConfigured();
  if (!configured && !args.callProvider) {
    return {
      ok: false,
      code: "not_configured",
      error: "OpenAI blog article generation is not configured yet.",
      blogSaved: false,
      providerRequests: 0,
    };
  }

  const stored = await args.catalog.getSeoPlanningDraftById(id);
  const articleCtx = stored ? await articleContextForDraft(stored, args.catalog) : { status: "skipped" as const };
  const eligible = evaluateNewBlogArticleEligibility(stored, articleCtx);
  if (!eligible.ok) {
    return { ...eligible, blogSaved: false, providerRequests: 0 };
  }

  const limited = checkAiSeoBlogArticleRateLimit(args.adminId, args.ip);
  if (!limited.ok) {
    return {
      ok: false,
      code: "rate_limited",
      error: "AI request limit reached. Please try again later.",
      blogSaved: false,
      providerRequests: 0,
    };
  }

  const canonicalInput = buildArticleGenerationInput(eligible.brief);
  const callProvider =
    args.callProvider ||
    ((input: string) =>
      requestOpenAiBlogArticle(input, {
        fetchImpl: args.fetchImpl,
        config: args.config ?? getOpenAiBlogArticleConfig(),
      }));

  const provider = await callProvider(canonicalInput);
  if (!provider.ok) {
    return {
      ok: false,
      code: provider.code,
      error: provider.message,
      blogSaved: false,
      providerRequests: 1,
    };
  }

  const fresh = await args.catalog.getSeoPlanningDraftById(id);
  if (!fresh) {
    return {
      ok: false,
      code: "not_found",
      error: SEO_PLANNING_MISSING_DRAFT_MESSAGE,
      blogSaved: false,
      providerRequests: 1,
    };
  }
  const freshCtx = await articleContextForDraft(fresh, args.catalog);
  const still = evaluateNewBlogArticleEligibility(fresh, freshCtx);
  if (!still.ok || still.fingerprint !== eligible.fingerprint || fresh.updatedAt !== eligible.draft.updatedAt) {
    return {
      ok: false,
      code: "brief_changed",
      error: SEO_AI_ARTICLE_STALE_PLANNING_MESSAGE,
      blogSaved: false,
      providerRequests: 1,
    };
  }

  const preview: PrivateArticlePreview = {
    spec: SEO_AI_ARTICLE_GENERATION_SPEC,
    planningDraftId: fresh.id,
    planningUpdatedAt: fresh.updatedAt,
    recommendation: "NEW_BLOG",
    writingFingerprint: eligible.fingerprint,
    model: provider.model,
    article: provider.article,
    evidenceTrust: buildEvidenceTrust(fresh),
    requiresHumanFactualReview: true,
    publicationReady: false,
    privatePreview: true,
  };

  return { ok: true, preview, blogSaved: false, providerRequests: 1 };
}

export function parsePrivateArticlePreview(
  raw: unknown,
): { ok: true; preview: PrivateArticlePreview } | { ok: false; code: "invalid_input"; error: string } {
  const row = asRecord(raw);
  if (!row) {
    return { ok: false, code: "invalid_input", error: "A valid private article preview is required." };
  }
  const article = asRecord(row.article);
  if (!article) {
    return { ok: false, code: "invalid_input", error: "A valid private article preview is required." };
  }
  if (
    row.spec !== SEO_AI_ARTICLE_GENERATION_SPEC ||
    row.recommendation !== "NEW_BLOG" ||
    row.publicationReady !== false ||
    row.privatePreview !== true ||
    row.requiresHumanFactualReview !== true ||
    typeof row.planningDraftId !== "string" ||
    typeof row.planningUpdatedAt !== "string" ||
    typeof row.writingFingerprint !== "string" ||
    typeof row.model !== "string" ||
    typeof article.title !== "string" ||
    typeof article.excerpt !== "string" ||
    typeof article.html !== "string"
  ) {
    return { ok: false, code: "invalid_input", error: "A valid private article preview is required." };
  }

  const trust = asRecord(row.evidenceTrust);
  if (
    !trust ||
    trust.publicationReady !== false ||
    trust.evidencePackComplete !== false ||
    trust.aiProse !== "ai_generated_untrusted"
  ) {
    return { ok: false, code: "invalid_input", error: "A valid private article preview is required." };
  }

  return {
    ok: true,
    preview: {
      spec: SEO_AI_ARTICLE_GENERATION_SPEC,
      planningDraftId: row.planningDraftId.trim(),
      planningUpdatedAt: row.planningUpdatedAt,
      recommendation: "NEW_BLOG",
      writingFingerprint: row.writingFingerprint,
      model: row.model,
      article: {
        title: article.title,
        excerpt: article.excerpt,
        html: article.html,
      },
      evidenceTrust: {
        firstPartySiteFacts: "none_attested",
        editorialEvidence:
          trust.editorialEvidence === "editorial_unverified" ? "editorial_unverified" : "absent",
        externalReferences: "unverified",
        aiProse: "ai_generated_untrusted",
        evidencePackComplete: false,
        publicationReady: false,
      },
      requiresHumanFactualReview: true,
      publicationReady: false,
      privatePreview: true,
    },
  };
}
