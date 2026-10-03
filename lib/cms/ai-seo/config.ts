/** Server-only Sidhu AI SEO Assistant configuration. Never import from client components. */

export const DEFAULT_OPENAI_SEO_MODEL = "gpt-6-luna";
export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
export const OPENAI_SEO_TIMEOUT_MS = 12_000;
export const OPENAI_SEO_MAX_OUTPUT_TOKENS = 500;

export type OpenAiSeoConfig = {
  configured: boolean;
  apiKey: string;
  model: string;
  endpoint: string;
  timeoutMs: number;
  maxOutputTokens: number;
};

export function isOpenAiSeoConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAiSeoConfig(): OpenAiSeoConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  const model = process.env.OPENAI_SEO_MODEL?.trim() || DEFAULT_OPENAI_SEO_MODEL;
  return {
    configured: Boolean(apiKey),
    apiKey,
    model,
    endpoint: OPENAI_RESPONSES_ENDPOINT,
    timeoutMs: OPENAI_SEO_TIMEOUT_MS,
    maxOutputTokens: OPENAI_SEO_MAX_OUTPUT_TOKENS,
  };
}
