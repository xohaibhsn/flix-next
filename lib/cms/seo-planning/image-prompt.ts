/**
 * Phase E2/E3 — generate a private ChatGPT image prompt with Gemini or OpenAI.
 * One deliberate click = one provider call; no media / BlogPost / image API writes.
 */

import "server-only";

import type { GeminiImagePromptConfig, OpenAiImagePromptConfig } from "@/lib/cms/ai-seo/config";
import {
  getGeminiImagePromptConfig,
  getOpenAiImagePromptConfig,
  isGeminiImagePromptConfigured,
  isOpenAiImagePromptConfigured,
} from "@/lib/cms/ai-seo/config";
import { requestGeminiChatgptImagePrompt } from "@/lib/cms/ai-seo/image-prompt-gemini";
import { requestOpenAiChatgptImagePrompt } from "@/lib/cms/ai-seo/image-prompt-openai";
import type { GeminiFetch } from "@/lib/cms/ai-seo/gemini-provider";
import type { OpenAiFetch } from "@/lib/cms/ai-seo/provider";
import { checkAiSeoImagePromptRateLimit } from "@/lib/cms/ai-seo/rate-limit";
import type {
  MergeSeoPlanningImagePromptResult,
  SeoPlanningImagePromptAcceptReaders,
} from "@/lib/cms/catalog";
import {
  buildImageBrief,
  buildImagePromptInput,
  type ImageBrief,
} from "@/lib/cms/seo-planning/image-brief";
import { fingerprintImageBrief } from "@/lib/cms/seo-planning/image-fingerprint";
import {
  buildImagePromptCacheEntry,
  type ImagePromptCacheEntry,
  type ImagePromptProvider,
} from "@/lib/cms/seo-planning/image-prompt-cache";
import { buildWritingArticleContext } from "@/lib/cms/seo-planning/writing-context";
import type { WritingArticleContext } from "@/lib/cms/seo-planning/writing-brief";
import type { BlogCategory, BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export type GenerateChatgptImagePromptSuccess = {
  ok: true;
  draft: SeoPlanningDraft;
  cache: ImagePromptCacheEntry;
  provider: ImagePromptProvider;
};

export type GenerateChatgptImagePromptFailure = {
  ok: false;
  error: string;
  code?:
    | "not_configured"
    | "unauthorized"
    | "invalid_input"
    | "not_found"
    | "ineligible"
    | "brief_changed"
    | "rate_limited"
    | "timeout"
    | "invalid_request"
    | "failed_precondition"
    | "payment_required"
    | "permission_denied"
    | "unavailable"
    | "invalid_response";
};

export type GenerateChatgptImagePromptResult =
  | GenerateChatgptImagePromptSuccess
  | GenerateChatgptImagePromptFailure;

export type ImagePromptArticleReaders = SeoPlanningImagePromptAcceptReaders;

export type ImagePromptCatalog = {
  getSeoPlanningDraftById(id: string): Promise<SeoPlanningDraft | null>;
  mergeSeoPlanningImagePromptCache(args: {
    id: string;
    provider: ImagePromptProvider;
    entry: ImagePromptCacheEntry;
    acceptLatest?: (
      latest: SeoPlanningDraft,
      readers: ImagePromptArticleReaders,
    ) => boolean | Promise<boolean>;
  }): Promise<MergeSeoPlanningImagePromptResult>;
  getPostById(id: string): Promise<BlogPost | null>;
  listCategories(): Promise<BlogCategory[]>;
};

async function articleContextForDraft(
  draft: SeoPlanningDraft,
  readers: ImagePromptArticleReaders,
): Promise<WritingArticleContext> {
  const targetPost = draft.targetPostId ? await readers.getPostById(draft.targetPostId) : null;
  const categories = draft.recommendation === "REFRESH_EXISTING" ? await readers.listCategories() : [];
  return buildWritingArticleContext({ draft, targetPost, categories });
}

function briefForDraft(draft: SeoPlanningDraft, article: WritingArticleContext): ImageBrief {
  return buildImageBrief(draft, article);
}

async function briefStillMatchesFingerprint(
  draft: SeoPlanningDraft,
  expectedFingerprint: string,
  readers: ImagePromptArticleReaders,
): Promise<boolean> {
  const article = await articleContextForDraft(draft, readers);
  const brief = briefForDraft(draft, article);
  if (!brief.providerEligible) return false;
  return fingerprintImageBrief(brief) === expectedFingerprint;
}

async function generateChatgptImagePrompt(args: {
  planningDraftId: string;
  adminId: string;
  ip: string;
  catalog: ImagePromptCatalog;
  provider: ImagePromptProvider;
  callProvider: (
    canonicalInput: string,
  ) => Promise<
    | { ok: true; prompt: { chatgptImagePrompt: string }; model: string }
    | { ok: false; code: NonNullable<GenerateChatgptImagePromptFailure["code"]>; message: string }
  >;
}): Promise<GenerateChatgptImagePromptResult> {
  const id = String(args.planningDraftId || "").trim();
  if (!id) {
    return { ok: false, code: "invalid_input", error: "Planning draft id is required." };
  }

  const stored = await args.catalog.getSeoPlanningDraftById(id);
  if (!stored) {
    return { ok: false, code: "not_found", error: "That planning draft could not be found." };
  }

  const f1Readers: ImagePromptArticleReaders = args.catalog;
  const article = await articleContextForDraft(stored, f1Readers);
  const brief = briefForDraft(stored, article);
  if (!brief.providerEligible) {
    return {
      ok: false,
      code: "ineligible",
      error: brief.providerIneligibleReason || "This planning draft cannot generate an image prompt.",
    };
  }

  const fingerprintF1 = fingerprintImageBrief(brief);
  let canonicalInput: string;
  try {
    canonicalInput = buildImagePromptInput(brief);
  } catch {
    return {
      ok: false,
      code: "failed_precondition",
      error: "This image brief cannot be prepared for generation. Please simplify the planning notes and try again.",
    };
  }

  const limited = checkAiSeoImagePromptRateLimit(args.adminId, args.ip);
  if (!limited.ok) {
    return {
      ok: false,
      code: "rate_limited",
      error: "AI request limit reached. Please try again later.",
    };
  }

  const provider = await args.callProvider(canonicalInput);
  if (!provider.ok) {
    return { ok: false, code: provider.code, error: provider.message };
  }

  const fresh = await args.catalog.getSeoPlanningDraftById(id);
  if (!fresh) {
    return { ok: false, code: "not_found", error: "That planning draft could not be found." };
  }
  const stillMatches = await briefStillMatchesFingerprint(fresh, fingerprintF1, f1Readers);
  if (!stillMatches) {
    return {
      ok: false,
      code: "brief_changed",
      error:
        "The Image Brief changed while the prompt was being generated. Generate again from the current saved brief.",
    };
  }

  const cache = buildImagePromptCacheEntry({
    chatgptImagePrompt: provider.prompt.chatgptImagePrompt,
    imageFingerprint: fingerprintF1,
    model: provider.model,
  });

  try {
    const merged = await args.catalog.mergeSeoPlanningImagePromptCache({
      id,
      provider: args.provider,
      entry: cache,
      // Write-boundary MUST use transaction/lock-scoped readers from the catalog merge,
      // not the ambient pool/catalog connection (REFRESH article TOCTOU).
      acceptLatest: (latest, readers) =>
        briefStillMatchesFingerprint(latest, fingerprintF1, readers),
    });
    if (!merged.ok) {
      if (merged.reason === "not_found") {
        return { ok: false, code: "not_found", error: "That planning draft could not be found." };
      }
      return {
        ok: false,
        code: "brief_changed",
        error:
          "The Image Brief changed while the prompt was being generated. Generate again from the current saved brief.",
      };
    }
    return { ok: true, draft: merged.draft, cache, provider: args.provider };
  } catch {
    return { ok: false, code: "unavailable", error: "Could not save the image prompt. Please try again." };
  }
}

export async function generateChatgptImagePromptWithGemini(args: {
  planningDraftId: string;
  adminId: string;
  ip: string;
  catalog: ImagePromptCatalog;
  fetchImpl?: GeminiFetch;
  config?: GeminiImagePromptConfig;
}): Promise<GenerateChatgptImagePromptResult> {
  if (!isGeminiImagePromptConfigured() && !args.config?.configured) {
    return {
      ok: false,
      code: "not_configured",
      error: "Gemini image-prompt generation is not configured yet.",
    };
  }

  return generateChatgptImagePrompt({
    planningDraftId: args.planningDraftId,
    adminId: args.adminId,
    ip: args.ip,
    catalog: args.catalog,
    provider: "gemini",
    callProvider: (canonicalInput) =>
      requestGeminiChatgptImagePrompt(canonicalInput, {
        fetchImpl: args.fetchImpl,
        config: args.config ?? getGeminiImagePromptConfig(),
      }),
  });
}

export async function generateChatgptImagePromptWithOpenAi(args: {
  planningDraftId: string;
  adminId: string;
  ip: string;
  catalog: ImagePromptCatalog;
  fetchImpl?: OpenAiFetch;
  config?: OpenAiImagePromptConfig;
}): Promise<GenerateChatgptImagePromptResult> {
  if (!isOpenAiImagePromptConfigured() && !args.config?.configured) {
    return {
      ok: false,
      code: "not_configured",
      error: "OpenAI image-prompt generation is not configured yet.",
    };
  }

  return generateChatgptImagePrompt({
    planningDraftId: args.planningDraftId,
    adminId: args.adminId,
    ip: args.ip,
    catalog: args.catalog,
    provider: "openai",
    callProvider: (canonicalInput) =>
      requestOpenAiChatgptImagePrompt(canonicalInput, {
        fetchImpl: args.fetchImpl,
        config: args.config ?? getOpenAiImagePromptConfig(),
      }),
  });
}
