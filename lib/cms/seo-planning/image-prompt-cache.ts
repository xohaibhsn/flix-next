/**
 * Private provider-specific ChatGPT image-prompt cache inside Planning payload.
 * No DB migration — optional payload.imagePrompts sibling.
 */

import { CHATGPT_IMAGE_PROMPT_MAX_CHARS } from "@/lib/cms/ai-seo/config";
import { SEO_PLANNING_IMAGE_BRIEF_SPEC } from "@/lib/cms/seo-planning/image-brief";

export const IMAGE_PROMPT_PROVIDERS = ["gemini", "openai"] as const;
export type ImagePromptProvider = (typeof IMAGE_PROMPT_PROVIDERS)[number];

export type ImagePromptCacheEntry = {
  chatgptImagePrompt: string;
  imageFingerprint: string;
  model: string;
  generatedAt: string;
  briefSpec: string;
};

export type ImagePromptsPayload = {
  gemini?: ImagePromptCacheEntry;
  openai?: ImagePromptCacheEntry;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clip(value: string, max: number) {
  return value.replace(/\0/g, "").trim().slice(0, max);
}

function parseEntry(raw: unknown): ImagePromptCacheEntry | null {
  const row = asRecord(raw);
  if (!row) return null;
  const chatgptImagePrompt =
    typeof row.chatgptImagePrompt === "string"
      ? clip(row.chatgptImagePrompt, CHATGPT_IMAGE_PROMPT_MAX_CHARS)
      : "";
  const imageFingerprint = typeof row.imageFingerprint === "string" ? clip(row.imageFingerprint, 128) : "";
  const model = typeof row.model === "string" ? clip(row.model, 120) : "";
  const generatedAt = typeof row.generatedAt === "string" ? clip(row.generatedAt, 40) : "";
  const briefSpec = typeof row.briefSpec === "string" ? clip(row.briefSpec, 40) : "";
  if (!chatgptImagePrompt || !imageFingerprint || !model || !generatedAt || !briefSpec) return null;
  if (!/^[a-f0-9]{64}$/i.test(imageFingerprint)) return null;
  return { chatgptImagePrompt, imageFingerprint, model, generatedAt, briefSpec };
}

export function readImagePromptsPayload(payload: unknown): ImagePromptsPayload {
  const root = asRecord(payload);
  const block = asRecord(root?.imagePrompts);
  if (!block) return {};
  const out: ImagePromptsPayload = {};
  const gemini = parseEntry(block.gemini);
  const openai = parseEntry(block.openai);
  if (gemini) out.gemini = gemini;
  if (openai) out.openai = openai;
  return out;
}

export function readImagePromptCache(
  payload: unknown,
  provider: ImagePromptProvider,
): ImagePromptCacheEntry | null {
  const block = readImagePromptsPayload(payload);
  return block[provider] || null;
}

export function readGeminiImagePromptCache(payload: unknown): ImagePromptCacheEntry | null {
  return readImagePromptCache(payload, "gemini");
}

export function readOpenAiImagePromptCache(payload: unknown): ImagePromptCacheEntry | null {
  return readImagePromptCache(payload, "openai");
}

export type ImagePromptCacheStatus = "none" | "current" | "stale" | "unusable";

export function imagePromptCacheStatus(args: {
  entry: ImagePromptCacheEntry | null;
  currentFingerprint: string;
  providerEligible: boolean;
}): ImagePromptCacheStatus {
  if (!args.entry) return "none";
  if (!args.providerEligible) return "unusable";
  if (args.entry.imageFingerprint === args.currentFingerprint) return "current";
  return "stale";
}

export function geminiImagePromptCacheStatus(args: {
  entry: ImagePromptCacheEntry | null;
  currentFingerprint: string;
  providerEligible: boolean;
}): ImagePromptCacheStatus {
  return imagePromptCacheStatus(args);
}

export function openAiImagePromptCacheStatus(args: {
  entry: ImagePromptCacheEntry | null;
  currentFingerprint: string;
  providerEligible: boolean;
}): ImagePromptCacheStatus {
  return imagePromptCacheStatus(args);
}

/**
 * Merge one provider cache into a fresh payload without clobbering other providers or siblings.
 *
 * Write path preserves RAW imagePrompts keys other than the selected provider.
 * Parser-ignored/malformed siblings and unknown future keys must survive an unrelated write.
 */
export function mergeImagePromptCache(
  payload: Record<string, unknown>,
  provider: ImagePromptProvider,
  entry: ImagePromptCacheEntry,
): Record<string, unknown> {
  const existingBlock = asRecord(asRecord(payload)?.imagePrompts) || {};
  const nextBlock: Record<string, unknown> = { ...existingBlock };
  nextBlock[provider] = {
    chatgptImagePrompt: entry.chatgptImagePrompt,
    imageFingerprint: entry.imageFingerprint,
    model: entry.model,
    generatedAt: entry.generatedAt,
    briefSpec: entry.briefSpec || SEO_PLANNING_IMAGE_BRIEF_SPEC,
  };
  return {
    ...payload,
    imagePrompts: nextBlock,
  };
}

export function mergeGeminiImagePromptCache(
  payload: Record<string, unknown>,
  entry: ImagePromptCacheEntry,
): Record<string, unknown> {
  return mergeImagePromptCache(payload, "gemini", entry);
}

export function mergeOpenAiImagePromptCache(
  payload: Record<string, unknown>,
  entry: ImagePromptCacheEntry,
): Record<string, unknown> {
  return mergeImagePromptCache(payload, "openai", entry);
}

export function buildImagePromptCacheEntry(args: {
  chatgptImagePrompt: string;
  imageFingerprint: string;
  model: string;
  generatedAt?: string;
}): ImagePromptCacheEntry {
  return {
    chatgptImagePrompt: args.chatgptImagePrompt,
    imageFingerprint: args.imageFingerprint,
    model: args.model,
    generatedAt: args.generatedAt || new Date().toISOString(),
    briefSpec: SEO_PLANNING_IMAGE_BRIEF_SPEC,
  };
}

export function buildGeminiImagePromptCacheEntry(args: {
  chatgptImagePrompt: string;
  imageFingerprint: string;
  model: string;
  generatedAt?: string;
}): ImagePromptCacheEntry {
  return buildImagePromptCacheEntry(args);
}

export function buildOpenAiImagePromptCacheEntry(args: {
  chatgptImagePrompt: string;
  imageFingerprint: string;
  model: string;
  generatedAt?: string;
}): ImagePromptCacheEntry {
  return buildImagePromptCacheEntry(args);
}

/**
 * Pick which provider's image prompt to display when both are current.
 * Prefer newer generatedAt; on invalid/equal timestamps, prefer gemini.
 */
export function selectInitialImagePromptProvider(args: {
  gemini: { entry: ImagePromptCacheEntry | null; status: ImagePromptCacheStatus };
  openai: { entry: ImagePromptCacheEntry | null; status: ImagePromptCacheStatus };
}): ImagePromptProvider | null {
  const geminiOk = args.gemini.status === "current" && args.gemini.entry;
  const openaiOk = args.openai.status === "current" && args.openai.entry;
  if (geminiOk && !openaiOk) return "gemini";
  if (openaiOk && !geminiOk) return "openai";
  if (!geminiOk && !openaiOk) {
    if (args.gemini.entry) return "gemini";
    if (args.openai.entry) return "openai";
    return null;
  }
  const gAt = Date.parse(args.gemini.entry!.generatedAt);
  const oAt = Date.parse(args.openai.entry!.generatedAt);
  if (Number.isFinite(gAt) && Number.isFinite(oAt)) {
    if (oAt > gAt) return "openai";
    if (gAt > oAt) return "gemini";
  }
  return "gemini";
}
