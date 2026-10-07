/** Server-only Gemini provider for Phase E2 ChatGPT image-prompt generation. */

import {
  CHATGPT_IMAGE_PROMPT_MAX_CHARS,
  getGeminiImagePromptConfig,
  type GeminiImagePromptConfig,
} from "@/lib/cms/ai-seo/config";
import {
  buildGeminiStructuredRequestBody,
  requestGeminiStructuredJson,
  type GeminiFetch,
  type GeminiProviderFailure,
} from "@/lib/cms/ai-seo/gemini-provider";

export const IMAGE_PROMPT_GEMINI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chatgptImagePrompt"],
  properties: {
    chatgptImagePrompt: { type: "string" },
  },
} as const;

export const IMAGE_PROMPT_GEMINI_SYSTEM_INSTRUCTION = `You are Sidhu AI Image Prompt Assistant.

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

export type ChatgptImagePromptResult = {
  chatgptImagePrompt: string;
};

export type GeminiImagePromptProviderResult =
  | { ok: true; prompt: ChatgptImagePromptResult; model: string }
  | GeminiProviderFailure;

export function normalizeChatgptImagePromptResult(raw: unknown): ChatgptImagePromptResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== "chatgptImagePrompt")) return null;
  if (typeof data.chatgptImagePrompt !== "string") return null;
  const chatgptImagePrompt = data.chatgptImagePrompt.replace(/\u0000/g, "").trim();
  if (!chatgptImagePrompt) return null;
  if (chatgptImagePrompt.length > CHATGPT_IMAGE_PROMPT_MAX_CHARS) return null;
  return { chatgptImagePrompt };
}

export function buildGeminiImagePromptRequestBody(
  canonicalImageInput: string,
  config: GeminiImagePromptConfig,
) {
  return buildGeminiStructuredRequestBody({
    systemInstruction: IMAGE_PROMPT_GEMINI_SYSTEM_INSTRUCTION,
    userPayload: {
      imageBriefCanonicalInput: canonicalImageInput,
    },
    jsonSchema: IMAGE_PROMPT_GEMINI_JSON_SCHEMA,
    maxOutputTokens: config.maxOutputTokens,
  });
}

export async function requestGeminiChatgptImagePrompt(
  canonicalImageInput: string,
  options?: {
    fetchImpl?: GeminiFetch;
    config?: GeminiImagePromptConfig;
  },
): Promise<GeminiImagePromptProviderResult> {
  const config = options?.config ?? getGeminiImagePromptConfig();
  const result = await requestGeminiStructuredJson({
    body: buildGeminiImagePromptRequestBody(canonicalImageInput, config),
    config,
    fetchImpl: options?.fetchImpl,
    timeoutMessage: "ChatGPT image prompt generation took too long. Please try again.",
    notConfiguredMessage: "Gemini image-prompt generation is not configured yet.",
  });
  if (!result.ok) return result;

  const prompt = normalizeChatgptImagePromptResult(result.json);
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
