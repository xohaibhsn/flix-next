/** Server-only OpenAI provider for Phase D3 ChatGPT writing-prompt generation. */

import {
  CHATGPT_WRITING_PROMPT_MAX_CHARS,
  getOpenAiBlogPromptConfig,
  type OpenAiBlogPromptConfig,
} from "@/lib/cms/ai-seo/config";
import { normalizeChatgptWritingPromptResult } from "@/lib/cms/ai-seo/blog-prompt-gemini";
import {
  buildOpenAiStructuredRequestBody,
  requestOpenAiStructuredJson,
  type OpenAiFetch,
  type OpenAiProviderErrorCode,
} from "@/lib/cms/ai-seo/provider";

export const BLOG_PROMPT_OPENAI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chatgptPrompt"],
  properties: {
    chatgptPrompt: { type: "string" },
  },
} as const;

export const BLOG_PROMPT_OPENAI_SCHEMA_NAME = "sidhu_planning_chatgpt_writing_prompt";

/** Same editorial job as Gemini Blog Prompt — produce a prompt FOR ChatGPT, not the article. */
export const BLOG_PROMPT_OPENAI_SYSTEM_INSTRUCTION = `You are Sidhu AI Writing Prompt Assistant.

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

export type OpenAiBlogPromptProviderResult =
  | { ok: true; prompt: { chatgptPrompt: string }; model: string }
  | { ok: false; code: OpenAiProviderErrorCode; message: string };

export function buildOpenAiBlogPromptRequestBody(
  canonicalWritingInput: string,
  config: OpenAiBlogPromptConfig,
) {
  return buildOpenAiStructuredRequestBody({
    config,
    schemaName: BLOG_PROMPT_OPENAI_SCHEMA_NAME,
    jsonSchema: BLOG_PROMPT_OPENAI_JSON_SCHEMA,
    systemInstruction: BLOG_PROMPT_OPENAI_SYSTEM_INSTRUCTION,
    userPayload: {
      writingBriefCanonicalInput: canonicalWritingInput,
    },
    maxOutputTokens: config.maxOutputTokens,
  });
}

export async function requestOpenAiChatgptWritingPrompt(
  canonicalWritingInput: string,
  options?: {
    fetchImpl?: OpenAiFetch;
    config?: OpenAiBlogPromptConfig;
  },
): Promise<OpenAiBlogPromptProviderResult> {
  const config = options?.config ?? getOpenAiBlogPromptConfig();
  const body = buildOpenAiBlogPromptRequestBody(canonicalWritingInput, config);
  const result = await requestOpenAiStructuredJson({
    body,
    config,
    fetchImpl: options?.fetchImpl,
    notConfiguredMessage: "OpenAI writing-prompt generation is not configured yet.",
    timeoutMessage: "ChatGPT prompt generation took too long. Please try again.",
    unavailableMessage: "ChatGPT prompt generation is temporarily unavailable.",
  });
  if (!result.ok) return result;

  const prompt = normalizeChatgptWritingPromptResult(result.json);
  if (!prompt) {
    return {
      ok: false,
      code: "invalid_response",
      message: "AI returned an unusable response. Please try again.",
    };
  }
  // Defensive: normalize already rejects > max, keep explicit for contract clarity.
  if (prompt.chatgptPrompt.length > CHATGPT_WRITING_PROMPT_MAX_CHARS) {
    return {
      ok: false,
      code: "invalid_response",
      message: "AI returned an unusable response. Please try again.",
    };
  }
  return { ok: true, prompt, model: result.model };
}
