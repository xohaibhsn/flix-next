import type { OpenAiSeoConfig } from "@/lib/cms/ai-seo/config";
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
};

export type DraftSeoTitleMetaFailure = {
  ok: false;
  error: string;
  code?: "not_configured" | "unauthorized" | "invalid_input" | "rate_limited" | "timeout" | "unavailable" | "invalid_response";
};

export type DraftSeoTitleMetaResult = DraftSeoTitleMetaSuccess | DraftSeoTitleMetaFailure;

/**
 * Explicit user-triggered title/meta drafting. Does not write CMS or SEO Health state.
 */
export async function draftSeoTitleMeta(args: {
  rawInput: unknown;
  adminId: string;
  ip: string;
  fetchImpl?: typeof fetch;
  config?: OpenAiSeoConfig;
}): Promise<DraftSeoTitleMetaResult> {
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

  const provider = await requestOpenAiSeoDraft(parsed.value, {
    fetchImpl: args.fetchImpl,
    config: args.config,
  });
  if (!provider.ok) {
    return { ok: false, code: provider.code, error: provider.message };
  }

  return { ok: true, draft: provider.draft };
}

export type { SeoDraftInput, SeoDraftResult };
