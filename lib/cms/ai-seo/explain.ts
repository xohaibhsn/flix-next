import type { GeminiSeoConfig, OpenAiSeoConfig } from "@/lib/cms/ai-seo/config";
import { requestGeminiSeoExplanation } from "@/lib/cms/ai-seo/gemini-provider";
import { isSeoAiProvider, type SeoAiProvider } from "@/lib/cms/ai-seo/provider-type";
import { requestOpenAiSeoExplanation } from "@/lib/cms/ai-seo/provider";
import { checkAiSeoExplainRateLimit } from "@/lib/cms/ai-seo/rate-limit";
import {
  parseSeoExplainFindingInput,
  type SeoExplainFindingInput,
  type SeoExplainResult,
} from "@/lib/cms/ai-seo/schemas";

export type ExplainSeoFindingSuccess = {
  ok: true;
  explanation: SeoExplainResult;
  provider: SeoAiProvider;
};

export type ExplainSeoFindingFailure = {
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

export type ExplainSeoFindingResult = ExplainSeoFindingSuccess | ExplainSeoFindingFailure;

export async function explainSeoFinding(args: {
  provider: SeoAiProvider;
  rawInput: unknown;
  adminId: string;
  ip: string;
  fetchImpl?: typeof fetch;
  /** OpenAI-only test/config override. Ignored for Gemini. */
  config?: OpenAiSeoConfig;
  /** Gemini-only test/config override. Ignored for OpenAI. */
  geminiConfig?: GeminiSeoConfig;
}): Promise<ExplainSeoFindingResult> {
  if (!isSeoAiProvider(args.provider)) {
    return { ok: false, code: "invalid_input", error: "Choose Gemini or OpenAI." };
  }

  const parsed = parseSeoExplainFindingInput(args.rawInput);
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
    const provider = await requestGeminiSeoExplanation(parsed.value, {
      fetchImpl: args.fetchImpl,
      config: args.geminiConfig,
    });
    if (!provider.ok) {
      return { ok: false, code: provider.code, error: provider.message };
    }
    return { ok: true, explanation: provider.explanation, provider: "gemini" };
  }

  const provider = await requestOpenAiSeoExplanation(parsed.value, {
    fetchImpl: args.fetchImpl,
    config: args.config,
  });
  if (!provider.ok) {
    return { ok: false, code: provider.code, error: provider.message };
  }

  return { ok: true, explanation: provider.explanation, provider: "openai" };
}

export type { SeoExplainFindingInput, SeoExplainResult };
