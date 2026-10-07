/**
 * Private provider-specific ChatGPT writing-prompt cache inside Planning payload.
 * No DB migration — optional payload.writingPrompts sibling.
 */

import { SEO_PLANNING_WRITING_BRIEF_SPEC } from "@/lib/cms/seo-planning/writing-brief";
import { CHATGPT_WRITING_PROMPT_MAX_CHARS } from "@/lib/cms/ai-seo/config";

export const WRITING_PROMPT_PROVIDERS = ["gemini", "openai"] as const;
export type WritingPromptProvider = (typeof WRITING_PROMPT_PROVIDERS)[number];

export type WritingPromptCacheEntry = {
  chatgptPrompt: string;
  writingFingerprint: string;
  model: string;
  generatedAt: string;
  briefSpec: string;
};

export type WritingPromptsPayload = {
  gemini?: WritingPromptCacheEntry;
  openai?: WritingPromptCacheEntry;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clip(value: string, max: number) {
  return value.replace(/\0/g, "").trim().slice(0, max);
}

function parseEntry(raw: unknown): WritingPromptCacheEntry | null {
  const row = asRecord(raw);
  if (!row) return null;
  const chatgptPrompt = typeof row.chatgptPrompt === "string" ? clip(row.chatgptPrompt, CHATGPT_WRITING_PROMPT_MAX_CHARS) : "";
  const writingFingerprint = typeof row.writingFingerprint === "string" ? clip(row.writingFingerprint, 128) : "";
  const model = typeof row.model === "string" ? clip(row.model, 120) : "";
  const generatedAt = typeof row.generatedAt === "string" ? clip(row.generatedAt, 40) : "";
  const briefSpec = typeof row.briefSpec === "string" ? clip(row.briefSpec, 40) : "";
  if (!chatgptPrompt || !writingFingerprint || !model || !generatedAt || !briefSpec) return null;
  if (!/^[a-f0-9]{64}$/i.test(writingFingerprint)) return null;
  return { chatgptPrompt, writingFingerprint, model, generatedAt, briefSpec };
}

export function readWritingPromptsPayload(payload: unknown): WritingPromptsPayload {
  const root = asRecord(payload);
  const block = asRecord(root?.writingPrompts);
  if (!block) return {};
  const out: WritingPromptsPayload = {};
  const gemini = parseEntry(block.gemini);
  const openai = parseEntry(block.openai);
  if (gemini) out.gemini = gemini;
  if (openai) out.openai = openai;
  return out;
}

export function readWritingPromptCache(
  payload: unknown,
  provider: WritingPromptProvider,
): WritingPromptCacheEntry | null {
  const block = readWritingPromptsPayload(payload);
  return block[provider] || null;
}

export function readGeminiWritingPromptCache(payload: unknown): WritingPromptCacheEntry | null {
  return readWritingPromptCache(payload, "gemini");
}

export function readOpenAiWritingPromptCache(payload: unknown): WritingPromptCacheEntry | null {
  return readWritingPromptCache(payload, "openai");
}

export type WritingPromptCacheStatus = "none" | "current" | "stale" | "unusable";

export function writingPromptCacheStatus(args: {
  entry: WritingPromptCacheEntry | null;
  currentFingerprint: string;
  providerEligible: boolean;
}): WritingPromptCacheStatus {
  if (!args.entry) return "none";
  if (!args.providerEligible) return "unusable";
  if (args.entry.writingFingerprint === args.currentFingerprint) return "current";
  return "stale";
}

export function geminiWritingPromptCacheStatus(args: {
  entry: WritingPromptCacheEntry | null;
  currentFingerprint: string;
  providerEligible: boolean;
}): WritingPromptCacheStatus {
  return writingPromptCacheStatus(args);
}

export function openAiWritingPromptCacheStatus(args: {
  entry: WritingPromptCacheEntry | null;
  currentFingerprint: string;
  providerEligible: boolean;
}): WritingPromptCacheStatus {
  return writingPromptCacheStatus(args);
}

/**
 * Merge one provider cache into a fresh payload without clobbering other providers or siblings.
 *
 * Write path preserves RAW writingPrompts keys other than the selected provider.
 * Parser-ignored/malformed siblings and unknown future keys must survive an unrelated write.
 */
export function mergeWritingPromptCache(
  payload: Record<string, unknown>,
  provider: WritingPromptProvider,
  entry: WritingPromptCacheEntry,
): Record<string, unknown> {
  const existingBlock = asRecord(asRecord(payload)?.writingPrompts) || {};
  const nextBlock: Record<string, unknown> = { ...existingBlock };
  nextBlock[provider] = {
    chatgptPrompt: entry.chatgptPrompt,
    writingFingerprint: entry.writingFingerprint,
    model: entry.model,
    generatedAt: entry.generatedAt,
    briefSpec: entry.briefSpec || SEO_PLANNING_WRITING_BRIEF_SPEC,
  };
  return {
    ...payload,
    writingPrompts: nextBlock,
  };
}

export function mergeGeminiWritingPromptCache(
  payload: Record<string, unknown>,
  entry: WritingPromptCacheEntry,
): Record<string, unknown> {
  return mergeWritingPromptCache(payload, "gemini", entry);
}

export function mergeOpenAiWritingPromptCache(
  payload: Record<string, unknown>,
  entry: WritingPromptCacheEntry,
): Record<string, unknown> {
  return mergeWritingPromptCache(payload, "openai", entry);
}

export function buildWritingPromptCacheEntry(args: {
  chatgptPrompt: string;
  writingFingerprint: string;
  model: string;
  generatedAt?: string;
}): WritingPromptCacheEntry {
  return {
    chatgptPrompt: args.chatgptPrompt,
    writingFingerprint: args.writingFingerprint,
    model: args.model,
    generatedAt: args.generatedAt || new Date().toISOString(),
    briefSpec: SEO_PLANNING_WRITING_BRIEF_SPEC,
  };
}

export function buildGeminiWritingPromptCacheEntry(args: {
  chatgptPrompt: string;
  writingFingerprint: string;
  model: string;
  generatedAt?: string;
}): WritingPromptCacheEntry {
  return buildWritingPromptCacheEntry(args);
}

export function buildOpenAiWritingPromptCacheEntry(args: {
  chatgptPrompt: string;
  writingFingerprint: string;
  model: string;
  generatedAt?: string;
}): WritingPromptCacheEntry {
  return buildWritingPromptCacheEntry(args);
}

/**
 * Pick which provider's prompt to display on first load when both are current.
 * Prefer newer generatedAt; on invalid/equal timestamps, prefer gemini (deterministic).
 */
export function selectInitialWritingPromptProvider(args: {
  gemini: { entry: WritingPromptCacheEntry | null; status: WritingPromptCacheStatus };
  openai: { entry: WritingPromptCacheEntry | null; status: WritingPromptCacheStatus };
}): WritingPromptProvider | null {
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
