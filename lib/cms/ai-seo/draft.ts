import type { GeminiSeoConfig, OpenAiSeoConfig } from "@/lib/cms/ai-seo/config";
import { requestGeminiSeoDraft } from "@/lib/cms/ai-seo/gemini-provider";
import { isSeoAiProvider, type SeoAiProvider } from "@/lib/cms/ai-seo/provider-type";
import { requestOpenAiSeoDraft } from "@/lib/cms/ai-seo/provider";
import { checkAiSeoExplainRateLimit } from "@/lib/cms/ai-seo/rate-limit";
import {
  parseSeoDraftInput,
  type SeoDraftInput,
  type SeoDraftResult,
} from "@/lib/cms/ai-seo/schemas";

export type DraftSeoTitleMetaSuccess = {
  ok: true;
  draft: SeoDraftResult;
  provider: SeoAiProvider;
};

export type DraftSeoTitleMetaFailure = {
  ok: false;
  error: string;
  code?:
    | "not_configured"
    | "unauthorized"
    | "invalid_input"
    | "invalid_request"
    | "payment_required"
    | "permission_denied"
    | "not_found"
    | "rate_limited"
    | "timeout"
    | "unavailable"
    | "invalid_response";
};

export type DraftSeoTitleMetaResult = DraftSeoTitleMetaSuccess | DraftSeoTitleMetaFailure;

/**
 * Explicit user-triggered title/meta drafting. Does not write CMS or SEO Health state.
 * One deliberate provider per call — never falls back to the other provider.
 */
export async function draftSeoTitleMeta(args: {
  provider: SeoAiProvider;
  rawInput: unknown;
  adminId: string;
  ip: string;
  fetchImpl?: typeof fetch;
  /** OpenAI-only test/config override. Ignored for Gemini. */
  config?: OpenAiSeoConfig;
  /** Gemini-only test/config override. Ignored for OpenAI. */
  geminiConfig?: GeminiSeoConfig;
}): Promise<DraftSeoTitleMetaResult> {
  if (!isSeoAiProvider(args.provider)) {
    return { ok: false, code: "invalid_input", error: "Choose Gemini or OpenAI." };
  }

  const parsed = parseSeoDraftInput(args.rawInput);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_input", error: parsed.error };
  }

  const limited = checkAiSeoExplainRateLimit(args.adminId, args.ip);
  if (!limited.ok) {
    return {
      ok: false,
      code: "rate_limited",
      error: "AI request limit reached. Please try again later.",
    };
  }

  if (args.provider === "gemini") {
    const provider = await requestGeminiSeoDraft(parsed.value, {
      fetchImpl: args.fetchImpl,
      config: args.geminiConfig,
    });
    if (!provider.ok) {
      return { ok: false, code: provider.code, error: provider.message };
    }
    return { ok: true, draft: provider.draft, provider: "gemini" };
  }

  const provider = await requestOpenAiSeoDraft(parsed.value, {
    fetchImpl: args.fetchImpl,
    config: args.config,
  });
  if (!provider.ok) {
    return { ok: false, code: provider.code, error: provider.message };
  }

  return { ok: true, draft: provider.draft, provider: "openai" };
}

export type { SeoDraftInput, SeoDraftResult };
