import type { OpenAiSeoConfig } from "@/lib/cms/ai-seo/config";
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
};

export type ExplainSeoFindingFailure = {
  ok: false;
  error: string;
  code?: "not_configured" | "unauthorized" | "invalid_input" | "rate_limited" | "timeout" | "unavailable" | "invalid_response";
};

export type ExplainSeoFindingResult = ExplainSeoFindingSuccess | ExplainSeoFindingFailure;

export async function explainSeoFinding(args: {
  rawInput: unknown;
  adminId: string;
  ip: string;
  fetchImpl?: typeof fetch;
  config?: OpenAiSeoConfig;
}): Promise<ExplainSeoFindingResult> {
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

  const provider = await requestOpenAiSeoExplanation(parsed.value, {
    fetchImpl: args.fetchImpl,
    config: args.config,
  });
  if (!provider.ok) {
    return { ok: false, code: provider.code, error: provider.message };
  }

  return { ok: true, explanation: provider.explanation };
}

export type { SeoExplainFindingInput, SeoExplainResult };
