/** Server-only OpenAI provider for Phase E3 ChatGPT image-prompt generation. */

import {
  CHATGPT_IMAGE_PROMPT_MAX_CHARS,
  getOpenAiImagePromptConfig,
  type OpenAiImagePromptConfig,
} from "@/lib/cms/ai-seo/config";
import { normalizeChatgptImagePromptResult } from "@/lib/cms/ai-seo/image-prompt-gemini";
import {
  buildOpenAiStructuredRequestBody,
  requestOpenAiStructuredJson,
  type OpenAiFetch,
  type OpenAiProviderErrorCode,
} from "@/lib/cms/ai-seo/provider";

export const IMAGE_PROMPT_OPENAI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chatgptImagePrompt"],
  properties: {
    chatgptImagePrompt: { type: "string" },
  },
} as const;

export const IMAGE_PROMPT_OPENAI_SCHEMA_NAME = "sidhu_planning_chatgpt_image_prompt";

/** Same editorial job as Gemini Image Prompt — produce a prompt FOR ChatGPT image generation. */
export const IMAGE_PROMPT_OPENAI_SYSTEM_INSTRUCTION = `You are Sidhu AI Image Prompt Assistant.

Your only job is to turn the supplied approved Image Brief into a high-quality prompt that an administrator can paste into normal ChatGPT image generation.

DO NOT generate an image yourself.
DO NOT return base64, binary, or media metadata.
DO NOT write a blog article or CMS HTML.
DO NOT produce an alt-text bundle as the product.
DO NOT upload, publish, or claim anything was published.
Return JSON only with a chatgptImagePrompt string.

The ChatGPT image prompt you produce must instruct ChatGPT to create:
- ONE featured blog image
- a 16:9 composition suitable for a 1280×720 source
- an editorial technology style matching the Image Brief visual subject and concept
- crop-safe central composition because social reuse may crop toward 1200×630
- no baked-in article title, working title, or URL text
- no fake IPTV app/player UI or fabricated screenshots
- no fake logos, partnerships, or trademark endorsement
- no invented prices, statistics, performance claims, or search/GSC metrics
- no unsupported device-compatibility claims
- no fabricated user information
- a result that still requires human editorial review before CMS use

"The Flix IPTV" is editorial context only. Do not instruct ChatGPT to render brand names, logos, watermark text, or trademark marks unless the Image Brief explicitly requires visible brand marking.

Return only the ChatGPT image-generation prompt text inside chatgptImagePrompt.`;

export type OpenAiImagePromptProviderResult =
  | { ok: true; prompt: { chatgptImagePrompt: string }; model: string }
  | { ok: false; code: OpenAiProviderErrorCode; message: string };

export function buildOpenAiImagePromptRequestBody(
  canonicalImageInput: string,
  config: OpenAiImagePromptConfig,
) {
  return buildOpenAiStructuredRequestBody({
    config,
    schemaName: IMAGE_PROMPT_OPENAI_SCHEMA_NAME,
    jsonSchema: IMAGE_PROMPT_OPENAI_JSON_SCHEMA,
    systemInstruction: IMAGE_PROMPT_OPENAI_SYSTEM_INSTRUCTION,
    userPayload: {
      imageBriefCanonicalInput: canonicalImageInput,
    },
    maxOutputTokens: config.maxOutputTokens,
  });
}

export async function requestOpenAiChatgptImagePrompt(
  canonicalImageInput: string,
  options?: {
    fetchImpl?: OpenAiFetch;
    config?: OpenAiImagePromptConfig;
  },
): Promise<OpenAiImagePromptProviderResult> {
  const config = options?.config ?? getOpenAiImagePromptConfig();
  const body = buildOpenAiImagePromptRequestBody(canonicalImageInput, config);
  const result = await requestOpenAiStructuredJson({
    body,
    config,
    fetchImpl: options?.fetchImpl,
    notConfiguredMessage: "OpenAI image-prompt generation is not configured yet.",
    timeoutMessage: "ChatGPT image prompt generation took too long. Please try again.",
    unavailableMessage: "ChatGPT image prompt generation is temporarily unavailable.",
  });
  if (!result.ok) return result;

  const prompt = normalizeChatgptImagePromptResult(result.json);
  if (!prompt) {
    return {
      ok: false,
      code: "invalid_response",
      message: "AI returned an unusable response. Please try again.",
    };
  }
  // Defensive: normalize already rejects > max, keep explicit for contract clarity.
  if (prompt.chatgptImagePrompt.length > CHATGPT_IMAGE_PROMPT_MAX_CHARS) {
    return {
      ok: false,
      code: "invalid_response",
      message: "AI returned an unusable response. Please try again.",
    };
  }
  return { ok: true, prompt, model: result.model };
}
