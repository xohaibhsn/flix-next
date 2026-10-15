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
/** Phase E3 ChatGPT image-prompt generation (not SEO / writing prompt / image APIs). */
export const OPENAI_IMAGE_PROMPT_TIMEOUT_MS = 30_000;
export const OPENAI_IMAGE_PROMPT_MAX_OUTPUT_TOKENS = 1500;
export const CHATGPT_IMAGE_PROMPT_MAX_CHARS = 4_000;
/** Phase A1 OpenAI blog article generation (not writing-prompt / SEO / research / image). */
export const OPENAI_BLOG_ARTICLE_TIMEOUT_MS = 45_000;
export const OPENAI_BLOG_ARTICLE_MAX_OUTPUT_TOKENS = 4500;
export const GENERATED_ARTICLE_TITLE_MAX_CHARS = 160;
export const GENERATED_ARTICLE_EXCERPT_MAX_CHARS = 400;
export const GENERATED_ARTICLE_HTML_MAX_CHARS = 48_000;
export const ARTICLE_GENERATION_INPUT_MAX_CHARS = 12_000;
/** Closed-by-default local activation gate — never enable via page render alone. */
export const SEO_AI_ARTICLE_GENERATION_ENV = "SEO_AI_ARTICLE_GENERATION_ENABLED";

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

/** Same transport shape as OpenAiSeoConfig; model comes only from OPENAI_IMAGE_PROMPT_MODEL. */
export type OpenAiImagePromptConfig = OpenAiSeoConfig;

/** Same transport shape as OpenAiSeoConfig; model comes only from OPENAI_BLOG_ARTICLE_MODEL. */
export type OpenAiBlogArticleConfig = OpenAiSeoConfig;

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

/** OpenAI Image Prompt requires key + explicit OPENAI_IMAGE_PROMPT_MODEL (never SEO/blog fallback). */
export function isOpenAiImagePromptConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_IMAGE_PROMPT_MODEL?.trim());
}

export function getOpenAiImagePromptConfig(): OpenAiImagePromptConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  const model = process.env.OPENAI_IMAGE_PROMPT_MODEL?.trim() || "";
  const configured = Boolean(apiKey && model);
  return {
    configured,
    apiKey,
    model,
    endpoint: OPENAI_RESPONSES_ENDPOINT,
    timeoutMs: OPENAI_IMAGE_PROMPT_TIMEOUT_MS,
    maxOutputTokens: OPENAI_IMAGE_PROMPT_MAX_OUTPUT_TOKENS,
  };
}

/**
 * OpenAI Blog Article requires key + explicit OPENAI_BLOG_ARTICLE_MODEL.
 * Never falls back to SEO, research, writing-prompt, or image-prompt models.
 */
export function isOpenAiBlogArticleConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OPENAI_BLOG_ARTICLE_MODEL?.trim());
}

export function getOpenAiBlogArticleConfig(): OpenAiBlogArticleConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  const model = process.env.OPENAI_BLOG_ARTICLE_MODEL?.trim() || "";
  const configured = Boolean(apiKey && model);
  return {
    configured,
    apiKey,
    model,
    endpoint: OPENAI_RESPONSES_ENDPOINT,
    timeoutMs: OPENAI_BLOG_ARTICLE_TIMEOUT_MS,
    maxOutputTokens: OPENAI_BLOG_ARTICLE_MAX_OUTPUT_TOKENS,
  };
}

/** Feature closed unless SEO_AI_ARTICLE_GENERATION_ENABLED=1 (local/dev only). */
export function isSeoAiArticleGenerationEnabled() {
  return process.env[SEO_AI_ARTICLE_GENERATION_ENV]?.trim() === "1";
}
