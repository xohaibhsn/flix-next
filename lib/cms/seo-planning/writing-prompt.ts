/**
 * Phase D2 — generate a private ChatGPT writing prompt with Gemini.
 * One deliberate call; no OpenAI; no CMS article writes.
 */

import "server-only";

import type { GeminiBlogPromptConfig } from "@/lib/cms/ai-seo/config";
import { getGeminiBlogPromptConfig, isGeminiBlogPromptConfigured } from "@/lib/cms/ai-seo/config";
import { requestGeminiChatgptWritingPrompt } from "@/lib/cms/ai-seo/blog-prompt-gemini";
import type { GeminiFetch } from "@/lib/cms/ai-seo/gemini-provider";
import { checkAiSeoBlogPromptRateLimit } from "@/lib/cms/ai-seo/rate-limit";
import type { MergeSeoPlanningGeminiWritingPromptResult } from "@/lib/cms/catalog";
import { buildWritingArticleContext } from "@/lib/cms/seo-planning/writing-context";
import {
  buildWritingBrief,
  buildWritingPromptInput,
  type WritingArticleContext,
} from "@/lib/cms/seo-planning/writing-brief";
import { fingerprintWritingBrief } from "@/lib/cms/seo-planning/writing-fingerprint";
import {
  buildGeminiWritingPromptCacheEntry,
  type WritingPromptCacheEntry,
} from "@/lib/cms/seo-planning/writing-prompt-cache";
import type { BlogCategory, BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export type GenerateChatgptWritingPromptSuccess = {
  ok: true;
  draft: SeoPlanningDraft;
  cache: WritingPromptCacheEntry;
  provider: "gemini";
};

export type GenerateChatgptWritingPromptFailure = {
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

export type GenerateChatgptWritingPromptResult =
  | GenerateChatgptWritingPromptSuccess
  | GenerateChatgptWritingPromptFailure;

export type WritingPromptCatalog = {
  getSeoPlanningDraftById(id: string): Promise<SeoPlanningDraft | null>;
  mergeSeoPlanningGeminiWritingPromptCache(args: {
    id: string;
    entry: WritingPromptCacheEntry;
    acceptLatest?: (latest: SeoPlanningDraft) => boolean | Promise<boolean>;
  }): Promise<MergeSeoPlanningGeminiWritingPromptResult>;
  getPostById(id: string): Promise<BlogPost | null>;
  listCategories(): Promise<BlogCategory[]>;
};

async function articleContextForDraft(
  draft: SeoPlanningDraft,
  catalog: WritingPromptCatalog,
): Promise<WritingArticleContext> {
  const targetPost = draft.targetPostId ? await catalog.getPostById(draft.targetPostId) : null;
  const categories = draft.recommendation === "REFRESH_EXISTING" ? await catalog.listCategories() : [];
  return buildWritingArticleContext({ draft, targetPost, categories });
}

async function briefStillMatchesFingerprint(
  draft: SeoPlanningDraft,
  expectedFingerprint: string,
  catalog: WritingPromptCatalog,
): Promise<boolean> {
  const article = await articleContextForDraft(draft, catalog);
  const brief = buildWritingBrief(draft, article);
  if (!brief.providerEligible) return false;
  return fingerprintWritingBrief(brief) === expectedFingerprint;
}

export async function generateChatgptWritingPromptWithGemini(args: {
  planningDraftId: string;
  adminId: string;
  ip: string;
  catalog: WritingPromptCatalog;
  fetchImpl?: GeminiFetch;
  config?: GeminiBlogPromptConfig;
}): Promise<GenerateChatgptWritingPromptResult> {
  const id = String(args.planningDraftId || "").trim();
  if (!id) {
    return { ok: false, code: "invalid_input", error: "Planning draft id is required." };
  }

  if (!isGeminiBlogPromptConfigured() && !args.config?.configured) {
    return {
      ok: false,
      code: "not_configured",
      error: "Gemini writing-prompt generation is not configured yet.",
    };
  }

  const stored = await args.catalog.getSeoPlanningDraftById(id);
  if (!stored) {
    return { ok: false, code: "not_found", error: "That planning draft could not be found." };
  }

  const article = await articleContextForDraft(stored, args.catalog);
  const brief = buildWritingBrief(stored, article);
  if (!brief.providerEligible) {
    return {
      ok: false,
      code: "ineligible",
      error: brief.providerIneligibleReason || "This planning draft cannot generate a writing prompt.",
    };
  }

  const fingerprintF1 = fingerprintWritingBrief(brief);
  const canonicalInput = buildWritingPromptInput(brief);

  const limited = checkAiSeoBlogPromptRateLimit(args.adminId, args.ip);
  if (!limited.ok) {
    return {
      ok: false,
      code: "rate_limited",
      error: "AI request limit reached. Please try again later.",
    };
  }

  const provider = await requestGeminiChatgptWritingPrompt(canonicalInput, {
    fetchImpl: args.fetchImpl,
    config: args.config ?? getGeminiBlogPromptConfig(),
  });
  if (!provider.ok) {
    return { ok: false, code: provider.code, error: provider.message };
  }

  // Lost-update protection: re-read authoritative draft after the provider call.
  const fresh = await args.catalog.getSeoPlanningDraftById(id);
  if (!fresh) {
    return { ok: false, code: "not_found", error: "That planning draft could not be found." };
  }
  const stillMatches = await briefStillMatchesFingerprint(fresh, fingerprintF1, args.catalog);
  if (!stillMatches) {
    return {
      ok: false,
      code: "brief_changed",
      error:
        "The Writing Brief changed while the prompt was being generated. Generate again from the current saved brief.",
    };
  }

  const cache = buildGeminiWritingPromptCacheEntry({
    chatgptPrompt: provider.prompt.chatgptPrompt,
    writingFingerprint: fingerprintF1,
    model: provider.model,
  });

  try {
    // Atomic write-boundary merge: re-read under catalog lock/transaction,
    // revalidate fingerprint again, change ONLY payload.writingPrompts.gemini.
    const merged = await args.catalog.mergeSeoPlanningGeminiWritingPromptCache({
      id,
      entry: cache,
      acceptLatest: (latest) => briefStillMatchesFingerprint(latest, fingerprintF1, args.catalog),
    });
    if (!merged.ok) {
      if (merged.reason === "not_found") {
        return { ok: false, code: "not_found", error: "That planning draft could not be found." };
      }
      return {
        ok: false,
        code: "brief_changed",
        error:
          "The Writing Brief changed while the prompt was being generated. Generate again from the current saved brief.",
      };
    }
    return { ok: true, draft: merged.draft, cache, provider: "gemini" };
  } catch {
    return { ok: false, code: "unavailable", error: "Could not save the writing prompt. Please try again." };
  }
}
