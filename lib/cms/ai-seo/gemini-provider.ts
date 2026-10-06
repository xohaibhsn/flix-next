/** Server-only Gemini REST provider for Sidhu AI SEO explain + title/meta draft. */

import {
  getGeminiSeoConfig,
  type GeminiSeoConfig,
} from "@/lib/cms/ai-seo/config";
import {
  buildSeoDraftUserPayload,
  buildSeoExplainUserPayload,
} from "@/lib/cms/ai-seo/provider";
import {
  normalizeSeoDraftResult,
  normalizeSeoExplainResult,
  SEO_DRAFT_JSON_SCHEMA,
  SEO_DRAFT_SYSTEM_INSTRUCTION,
  SEO_EXPLAIN_JSON_SCHEMA,
  SEO_EXPLAIN_SYSTEM_INSTRUCTION,
  type SeoDraftInput,
  type SeoDraftResult,
  type SeoExplainFindingInput,
  type SeoExplainResult,
} from "@/lib/cms/ai-seo/schemas";

export type GeminiProviderErrorCode =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "invalid_response";

export type GeminiExplainProviderResult =
  | { ok: true; explanation: SeoExplainResult; model: string }
  | { ok: false; code: GeminiProviderErrorCode; message: string };

export type GeminiDraftProviderResult =
  | { ok: true; draft: SeoDraftResult; model: string }
  | { ok: false; code: GeminiProviderErrorCode; message: string };

export type GeminiFetch = typeof fetch;

/**
 * Extract text from a Gemini generateContent response without returning raw payloads to callers.
 * Never logs or rethrows provider bodies.
 */
export function extractGeminiGenerateContentText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const root = payload as Record<string, unknown>;
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const chunks: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== "object") continue;
    const parts = Array.isArray((content as Record<string, unknown>).parts)
      ? ((content as Record<string, unknown>).parts as unknown[])
      : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) chunks.push(text.trim());
    }
  }
  return chunks.join("\n").trim();
}

/**
 * Current Gemini REST structured-output shape (non-deprecated):
 * generationConfig.responseFormat.text.{ mimeType, schema }
 * Auth via x-goog-api-key header (never query string).
 */
export function buildGeminiStructuredRequestBody(args: {
  systemInstruction: string;
  userPayload: unknown;
  jsonSchema: object;
  maxOutputTokens: number;
}) {
  return {
    systemInstruction: {
      parts: [{ text: args.systemInstruction }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: JSON.stringify(args.userPayload) }],
      },
    ],
    generationConfig: {
      maxOutputTokens: args.maxOutputTokens,
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema: args.jsonSchema,
        },
      },
    },
  };
}

export function buildGeminiExplainRequestBody(finding: SeoExplainFindingInput, config: GeminiSeoConfig) {
  return buildGeminiStructuredRequestBody({
    systemInstruction: SEO_EXPLAIN_SYSTEM_INSTRUCTION,
    userPayload: buildSeoExplainUserPayload(finding),
    jsonSchema: SEO_EXPLAIN_JSON_SCHEMA,
    maxOutputTokens: config.maxOutputTokens,
  });
}

export function buildGeminiDraftRequestBody(input: SeoDraftInput, config: GeminiSeoConfig) {
  return buildGeminiStructuredRequestBody({
    systemInstruction: SEO_DRAFT_SYSTEM_INSTRUCTION,
    userPayload: buildSeoDraftUserPayload(input),
    jsonSchema: SEO_DRAFT_JSON_SCHEMA,
    maxOutputTokens: config.draftMaxOutputTokens,
  });
}

async function requestGeminiStructuredJson(args: {
  body: object;
  config: GeminiSeoConfig;
  fetchImpl?: GeminiFetch;
  unavailableMessage: string;
  timeoutMessage: string;
}): Promise<
  { ok: true; json: unknown; model: string } | { ok: false; code: GeminiProviderErrorCode; message: string }
> {
  if (!args.config.configured || !args.config.apiKey || !args.config.model || !args.config.endpoint) {
    return {
      ok: false,
      code: "not_configured",
      message: "Sidhu AI SEO Assistant is not configured yet.",
    };
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.config.timeoutMs);

  try {
    const response = await fetchImpl(args.config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": args.config.apiKey,
      },
      body: JSON.stringify(args.body),
      signal: controller.signal,
    });

    if (response.status === 429) {
      return {
        ok: false,
        code: "rate_limited",
        message: "AI request limit reached. Please try again later.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        code: "unavailable",
        message: args.unavailableMessage,
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        ok: false,
        code: "invalid_response",
        message: "AI returned an unusable response. Please try again.",
      };
    }

    const text = extractGeminiGenerateContentText(payload);
    if (!text) {
      return {
        ok: false,
        code: "invalid_response",
        message: "AI returned an unusable response. Please try again.",
      };
    }

    try {
      return { ok: true, json: JSON.parse(text), model: args.config.model };
    } catch {
      return {
        ok: false,
        code: "invalid_response",
        message: "AI returned an unusable response. Please try again.",
      };
    }
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message))) {
      return {
        ok: false,
        code: "timeout",
        message: args.timeoutMessage,
      };
    }
    return {
      ok: false,
      code: "unavailable",
      message: args.unavailableMessage,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function requestGeminiSeoExplanation(
  finding: SeoExplainFindingInput,
  options?: {
    fetchImpl?: GeminiFetch;
    config?: GeminiSeoConfig;
  },
): Promise<GeminiExplainProviderResult> {
  const config = options?.config ?? getGeminiSeoConfig();
  const result = await requestGeminiStructuredJson({
    body: buildGeminiExplainRequestBody(finding, config),
    config,
    fetchImpl: options?.fetchImpl,
    unavailableMessage: "AI explanation is temporarily unavailable.",
    timeoutMessage: "AI explanation took too long. Please try again.",
  });
  if (!result.ok) return result;

  const explanation = normalizeSeoExplainResult(result.json);
  if (!explanation) {
    return {
      ok: false,
      code: "invalid_response",
      message: "AI returned an unusable response. Please try again.",
    };
  }
  return { ok: true, explanation, model: result.model };
}

export async function requestGeminiSeoDraft(
  input: SeoDraftInput,
  options?: {
    fetchImpl?: GeminiFetch;
    config?: GeminiSeoConfig;
  },
): Promise<GeminiDraftProviderResult> {
  const config = options?.config ?? getGeminiSeoConfig();
  const result = await requestGeminiStructuredJson({
    body: buildGeminiDraftRequestBody(input, config),
    config,
    fetchImpl: options?.fetchImpl,
    unavailableMessage: "AI drafting is temporarily unavailable.",
    timeoutMessage: "AI drafting took too long. Please try again.",
  });
  if (!result.ok) return result;

  const draft = normalizeSeoDraftResult(result.json);
  if (!draft) {
    return {
      ok: false,
      code: "invalid_response",
      message: "AI returned an unusable response. Please try again.",
    };
  }
  return { ok: true, draft, model: result.model };
}
