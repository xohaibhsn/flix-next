/** Server-only Gemini provider for Phase D2 ChatGPT writing-prompt generation. */

import {
  CHATGPT_WRITING_PROMPT_MAX_CHARS,
  getGeminiBlogPromptConfig,
  type GeminiBlogPromptConfig,
} from "@/lib/cms/ai-seo/config";
import {
  buildGeminiStructuredRequestBody,
  requestGeminiStructuredJson,
  type GeminiFetch,
  type GeminiProviderFailure,
} from "@/lib/cms/ai-seo/gemini-provider";

export const BLOG_PROMPT_GEMINI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chatgptPrompt"],
  properties: {
    chatgptPrompt: { type: "string" },
  },
} as const;

export const BLOG_PROMPT_GEMINI_SYSTEM_INSTRUCTION = `You are Sidhu AI Writing Prompt Assistant.

Your only job is to turn the supplied approved Writing Brief into a high-quality prompt that an administrator can paste into normal ChatGPT.

DO NOT write the blog article yourself.
DO NOT return CMS HTML article body as the product.
Return JSON only with a chatgptPrompt string.

The ChatGPT prompt you produce must instruct ChatGPT to:
- write or refresh the article according to the Writing Brief task
- follow the approved topic, working title, search intent, content angle, and next step
- respect human notes when supplied
- use supplied evidence and sources carefully without inventing facts
- for refresh tasks, preserve useful existing content and the existing public URL
- avoid fabricating business claims, prices, features, statistics, backlinks, GSC data, or search performance
- avoid keyword stuffing
- orient toward UK readers only when that is supported by the Writing Brief
- produce CMS-ready article HTML suitable for a Visual | HTML Source editor later
- require human editorial review before publication
- not publish anything
- not claim guaranteed rankings

Return only the ChatGPT prompt text inside chatgptPrompt.`;

export type ChatgptWritingPromptResult = {
  chatgptPrompt: string;
};

export type GeminiBlogPromptProviderResult =
  | { ok: true; prompt: ChatgptWritingPromptResult; model: string }
  | GeminiProviderFailure;

export function normalizeChatgptWritingPromptResult(raw: unknown): ChatgptWritingPromptResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== "chatgptPrompt")) return null;
  if (typeof data.chatgptPrompt !== "string") return null;
  const chatgptPrompt = data.chatgptPrompt.replace(/\u0000/g, "").trim();
  if (!chatgptPrompt) return null;
  if (chatgptPrompt.length > CHATGPT_WRITING_PROMPT_MAX_CHARS) return null;
  return { chatgptPrompt };
}

export function buildGeminiBlogPromptRequestBody(canonicalWritingInput: string, config: GeminiBlogPromptConfig) {
  return buildGeminiStructuredRequestBody({
    systemInstruction: BLOG_PROMPT_GEMINI_SYSTEM_INSTRUCTION,
    userPayload: {
      writingBriefCanonicalInput: canonicalWritingInput,
    },
    jsonSchema: BLOG_PROMPT_GEMINI_JSON_SCHEMA,
    maxOutputTokens: config.maxOutputTokens,
  });
}

export async function requestGeminiChatgptWritingPrompt(
  canonicalWritingInput: string,
  options?: {
    fetchImpl?: GeminiFetch;
    config?: GeminiBlogPromptConfig;
  },
): Promise<GeminiBlogPromptProviderResult> {
  const config = options?.config ?? getGeminiBlogPromptConfig();
  const result = await requestGeminiStructuredJson({
    body: buildGeminiBlogPromptRequestBody(canonicalWritingInput, config),
    config,
    fetchImpl: options?.fetchImpl,
    timeoutMessage: "ChatGPT prompt generation took too long. Please try again.",
    notConfiguredMessage: "Gemini writing-prompt generation is not configured yet.",
  });
  if (!result.ok) return result;

  const prompt = normalizeChatgptWritingPromptResult(result.json);
  if (!prompt) {
    return {
      ok: false,
      code: "invalid_response",
      message: "AI returned an unusable response. Please try again.",
      diagnostic: "INVALID_RESPONSE",
    };
  }
  return { ok: true, prompt, model: result.model };
}
