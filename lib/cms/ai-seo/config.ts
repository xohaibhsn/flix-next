/** Server-only Sidhu AI SEO Assistant configuration. Never import from client components. */

import type { SeoAiProviderAvailability } from "@/lib/cms/ai-seo/provider-type";

export const DEFAULT_OPENAI_SEO_MODEL = "gpt-6-luna";
export const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
export const OPENAI_SEO_TIMEOUT_MS = 12_000;
export const OPENAI_SEO_MAX_OUTPUT_TOKENS = 500;
/** Title/meta drafts need more tokens than explain (3+3 options with short reasons). */
export const OPENAI_SEO_DRAFT_MAX_OUTPUT_TOKENS = 1200;
/** UK opportunity research with web_search needs a longer bounded timeout. */
export const OPENAI_SEO_RESEARCH_TIMEOUT_MS = 30_000;
export const OPENAI_SEO_RESEARCH_MAX_OUTPUT_TOKENS = 2200;

export const GEMINI_GENERATE_CONTENT_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_SEO_TIMEOUT_MS = 12_000;
export const GEMINI_SEO_MAX_OUTPUT_TOKENS = 500;
export const GEMINI_SEO_DRAFT_MAX_OUTPUT_TOKENS = 1200;
/** Phase D2 ChatGPT writing-prompt generation (not SEO explain/draft). */
export const GEMINI_BLOG_PROMPT_TIMEOUT_MS = 30_000;
export const GEMINI_BLOG_PROMPT_MAX_OUTPUT_TOKENS = 3500;
export const CHATGPT_WRITING_PROMPT_MAX_CHARS = 12_000;
/** Phase D3 ChatGPT writing-prompt generation (not SEO explain/draft/research). */
export const OPENAI_BLOG_PROMPT_TIMEOUT_MS = 30_000;
export const OPENAI_BLOG_PROMPT_MAX_OUTPUT_TOKENS = 3500;
/** Phase E2 ChatGPT image-prompt generation (not SEO / writing prompt / image APIs). */
export const GEMINI_IMAGE_PROMPT_TIMEOUT_MS = 30_000;
export const GEMINI_IMAGE_PROMPT_MAX_OUTPUT_TOKENS = 1500;
export const CHATGPT_IMAGE_PROMPT_MAX_CHARS = 4_000;

export type OpenAiSeoConfig = {
  configured: boolean;
  apiKey: string;
  model: string;
  endpoint: string;
  timeoutMs: number;
  maxOutputTokens: number;
};

/** Shared generateContent transport fields (SEO + Blog Prompt). */
export type GeminiGenerateContentConfig = {
  configured: boolean;
  apiKey: string;
  model: string;
  /** Full generateContent URL for the configured model (no API key). */
  endpoint: string;
  timeoutMs: number;
};

export type GeminiSeoConfig = GeminiGenerateContentConfig & {
  maxOutputTokens: number;
  draftMaxOutputTokens: number;
};

export type GeminiBlogPromptConfig = GeminiGenerateContentConfig & {
  maxOutputTokens: number;
};

export type GeminiImagePromptConfig = GeminiGenerateContentConfig & {
  maxOutputTokens: number;
};

/** Same transport shape as OpenAiSeoConfig; model comes only from OPENAI_BLOG_PROMPT_MODEL. */
export type OpenAiBlogPromptConfig = OpenAiSeoConfig;

export function isOpenAiSeoConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Gemini SEO assistant requires both key and an explicit GEMINI_SEO_MODEL (no operational default). */
export function isGeminiSeoConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_SEO_MODEL?.trim());
}

/** Safe booleans only — never expose keys, models, or endpoints to the client via this helper. */
export function getSeoAiProviderAvailability(): SeoAiProviderAvailability {
  return {
    openaiConfigured: isOpenAiSeoConfigured(),
    geminiConfigured: isGeminiSeoConfigured(),
  };
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

/**
 * Research config reuses OPENAI_API_KEY + OPENAI_SEO_MODEL.
 * Optional OPENAI_SEO_RESEARCH_MODEL overrides the model only when set.
 */
export function getOpenAiSeoResearchConfig(): OpenAiSeoConfig {
  const base = getOpenAiSeoConfig();
  const researchModel = process.env.OPENAI_SEO_RESEARCH_MODEL?.trim();
  return {
    ...base,
    model: researchModel || base.model,
    timeoutMs: OPENAI_SEO_RESEARCH_TIMEOUT_MS,
    maxOutputTokens: OPENAI_SEO_RESEARCH_MAX_OUTPUT_TOKENS,
  };
}

export function getGeminiSeoConfig(): GeminiSeoConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const model = process.env.GEMINI_SEO_MODEL?.trim() || "";
  const configured = Boolean(apiKey && model);
  return {
    configured,
    apiKey,
    model,
    endpoint: configured
      ? `${GEMINI_GENERATE_CONTENT_BASE}/${encodeURIComponent(model)}:generateContent`
      : "",
    timeoutMs: GEMINI_SEO_TIMEOUT_MS,
    maxOutputTokens: GEMINI_SEO_MAX_OUTPUT_TOKENS,
    draftMaxOutputTokens: GEMINI_SEO_DRAFT_MAX_OUTPUT_TOKENS,
  };
}

/** Gemini Blog Prompt requires key + explicit GEMINI_BLOG_PROMPT_MODEL (never falls back to GEMINI_SEO_MODEL). */
export function isGeminiBlogPromptConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_BLOG_PROMPT_MODEL?.trim());
}

export function getGeminiBlogPromptConfig(): GeminiBlogPromptConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const model = process.env.GEMINI_BLOG_PROMPT_MODEL?.trim() || "";
  const configured = Boolean(apiKey && model);
  return {
    configured,
    apiKey,
    model,
    endpoint: configured
      ? `${GEMINI_GENERATE_CONTENT_BASE}/${encodeURIComponent(model)}:generateContent`
      : "",
    timeoutMs: GEMINI_BLOG_PROMPT_TIMEOUT_MS,
    maxOutputTokens: GEMINI_BLOG_PROMPT_MAX_OUTPUT_TOKENS,
  };
}

/** OpenAI Blog Prompt requires key + explicit OPENAI_BLOG_PROMPT_MODEL (never falls back to SEO/research models). */
export function isOpenAiBlogPromptConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_BLOG_PROMPT_MODEL?.trim());
}

export function getOpenAiBlogPromptConfig(): OpenAiBlogPromptConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  const model = process.env.OPENAI_BLOG_PROMPT_MODEL?.trim() || "";
  const configured = Boolean(apiKey && model);
  return {
    configured,
    apiKey,
    model,
    endpoint: OPENAI_RESPONSES_ENDPOINT,
    timeoutMs: OPENAI_BLOG_PROMPT_TIMEOUT_MS,
    maxOutputTokens: OPENAI_BLOG_PROMPT_MAX_OUTPUT_TOKENS,
  };
}

/** Gemini Image Prompt requires key + explicit GEMINI_IMAGE_PROMPT_MODEL (never SEO/blog fallback). */
export function isGeminiImagePromptConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_IMAGE_PROMPT_MODEL?.trim());
}

export function getGeminiImagePromptConfig(): GeminiImagePromptConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const model = process.env.GEMINI_IMAGE_PROMPT_MODEL?.trim() || "";
  const configured = Boolean(apiKey && model);
  return {
    configured,
    apiKey,
    model,
    endpoint: configured
      ? `${GEMINI_GENERATE_CONTENT_BASE}/${encodeURIComponent(model)}:generateContent`
      : "",
    timeoutMs: GEMINI_IMAGE_PROMPT_TIMEOUT_MS,
    maxOutputTokens: GEMINI_IMAGE_PROMPT_MAX_OUTPUT_TOKENS,
  };
}
