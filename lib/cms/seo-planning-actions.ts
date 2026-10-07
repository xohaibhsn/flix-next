"use server";

import { headers } from "next/headers";
import { requireAdminActor } from "@/lib/auth/guards";
import { adminHasPermission } from "@/lib/auth/session";
import {
  isGeminiBlogPromptConfigured,
  isGeminiImagePromptConfigured,
  isOpenAiBlogPromptConfigured,
  isOpenAiImagePromptConfigured,
} from "@/lib/cms/ai-seo/config";
import { cms } from "@/lib/cms/repository";
import {
  parseSeoPlanningHandoffInput,
  SEO_PLANNING_HANDOFF_BLOG_PERMISSION_MESSAGE,
  type SeoPlanningHandoffResult,
} from "@/lib/cms/seo-planning/handoff";
import {
  proceedSeoOpportunityToPlanningDraft,
  type ProceedSeoPlanningResult,
} from "@/lib/cms/seo-planning/proceed";
import {
  applySeoPlanningSuggestionCommand,
  parseSeoPlanningSuggestionInput,
} from "@/lib/cms/seo-planning/suggestions";
import {
  generateChatgptImagePromptWithGemini,
  generateChatgptImagePromptWithOpenAi,
  type GenerateChatgptImagePromptResult,
} from "@/lib/cms/seo-planning/image-prompt";
import {
  generateChatgptWritingPromptWithGemini,
  generateChatgptWritingPromptWithOpenAi,
  type GenerateChatgptWritingPromptResult,
} from "@/lib/cms/seo-planning/writing-prompt";
import {
  confirmSeoPlanningPermanentDelete,
  isSeoPlanningArchivedMutationError,
  isSeoPlanningDraftArchived,
  parseSeoPlanningLifecycleId,
  parseSeoPlanningPermanentDeleteInput,
  SEO_PLANNING_ARCHIVED_EDIT_MESSAGE,
  SEO_PLANNING_MISSING_DRAFT_MESSAGE,
} from "@/lib/cms/seo-planning/lifecycle";
import {
  applySeoPlanningWorkspaceUpdate,
  parseSeoPlanningWorkspaceInput,
} from "@/lib/cms/seo-planning/workspace";
import type { SeoPlanningDraft } from "@/lib/cms/types";

function clientIp(headerStore: Headers) {
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headerStore.get("x-real-ip")?.trim() || "unknown";
}

function writingPromptCatalog() {
  return {
    getSeoPlanningDraftById: (id: string) => cms.getSeoPlanningDraftById(id),
    mergeSeoPlanningWritingPromptCache: (
      args: Parameters<typeof cms.mergeSeoPlanningWritingPromptCache>[0],
    ) => cms.mergeSeoPlanningWritingPromptCache(args),
    mergeSeoPlanningGeminiWritingPromptCache: (
      args: Parameters<typeof cms.mergeSeoPlanningGeminiWritingPromptCache>[0],
    ) => cms.mergeSeoPlanningGeminiWritingPromptCache(args),
    getPostById: (id: string) => cms.getPostById(id),
    listCategories: () => cms.listCategories(),
  };
}

function imagePromptCatalog() {
  return {
    getSeoPlanningDraftById: (id: string) => cms.getSeoPlanningDraftById(id),
    mergeSeoPlanningImagePromptCache: (
      args: Parameters<typeof cms.mergeSeoPlanningImagePromptCache>[0],
    ) => cms.mergeSeoPlanningImagePromptCache(args),
    getPostById: (id: string) => cms.getPostById(id),
    listCategories: () => cms.listCategories(),
  };
}

export type ProceedSeoOpportunityActionResult = ProceedSeoPlanningResult;

export type SaveSeoPlanningWorkspaceResult =
  | { ok: true; draft: SeoPlanningDraft }
  | { ok: false; error: string };

export type UpdateSeoPlanningSuggestionResult =
  | { ok: true; draft: SeoPlanningDraft }
  | { ok: false; error: string; needsReplaceConfirmation?: boolean };

/**
 * Create or open a private SEO planning draft from a research opportunity.
 * No OpenAI. No GSC. No BlogPost. No redirects. No publish.
 */
export async function proceedSeoOpportunityToPlanningDraftAction(
  rawInput: unknown,
): Promise<ProceedSeoOpportunityActionResult> {
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return { ok: false, error: actor.error };
  }

  const input =
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>)
      : null;
  if (!input) {
    return { ok: false, error: "Opportunity data is missing." };
  }

  return proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: input.opportunity,
    rawSources: input.sources,
    rawGscMeta: input.gsc,
    adminId: actor.user.id,
    catalog: {
      listPosts: () => cms.listPosts(),
      listPages: () => cms.listPages(),
      listCategories: () => cms.listCategories(),
      listActiveRedirects: () => cms.listActiveRedirects(),
      getSeoPlanningDraftByFingerprint: (fingerprint) =>
        cms.getSeoPlanningDraftByFingerprint(fingerprint),
      saveSeoPlanningDraft: (draft) => cms.saveSeoPlanningDraft(draft),
    },
  });
}

/**
 * Save private planning workspace fields + allowed workflow transition.
 * No OpenAI. No GSC. No BlogPost. No redirects. No publish.
 * Last save wins — no timestamp-based stale guard (DATETIME second precision).
 */
export async function saveSeoPlanningWorkspaceAction(
  rawInput: unknown,
): Promise<SaveSeoPlanningWorkspaceResult> {
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return { ok: false, error: actor.error };
  }

  const parsed = parseSeoPlanningWorkspaceInput(rawInput);
  if (!parsed.ok) return parsed;

  const stored = await cms.getSeoPlanningDraftById(parsed.value.id);
  if (!stored) {
    return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
  }
  if (isSeoPlanningDraftArchived(stored)) {
    return { ok: false, error: SEO_PLANNING_ARCHIVED_EDIT_MESSAGE };
  }

  const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value);
  if (!applied.ok) return applied;

  try {
    const saved = await cms.saveSeoPlanningDraft(applied.draft);
    return { ok: true, draft: saved };
  } catch (error) {
    if (isSeoPlanningArchivedMutationError(error)) {
      return { ok: false, error: SEO_PLANNING_ARCHIVED_EDIT_MESSAGE };
    }
    return { ok: false, error: "Could not save the planning draft. Please try again." };
  }
}

/**
 * Edit, apply, or ignore one private suggestion from the frozen opportunity snapshot.
 * No OpenAI. No GSC. No web research. No BlogPost. No redirects. No publish.
 * A replace that still needs confirmation writes nothing and does not seed.
 */
export async function updateSeoPlanningSuggestionAction(
  rawInput: unknown,
): Promise<UpdateSeoPlanningSuggestionResult> {
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return { ok: false, error: actor.error };
  }

  const parsed = parseSeoPlanningSuggestionInput(rawInput);
  if (!parsed.ok) return parsed;

  try {
    const stored = await cms.getSeoPlanningDraftById(parsed.value.id);
    if (!stored) {
      return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
    }
    if (isSeoPlanningDraftArchived(stored)) {
      return { ok: false, error: SEO_PLANNING_ARCHIVED_EDIT_MESSAGE };
    }

    const applied = applySeoPlanningSuggestionCommand(stored, parsed.value);
    if (!applied.ok) {
      return applied.needsReplaceConfirmation
        ? { ok: false, error: applied.error, needsReplaceConfirmation: true }
        : { ok: false, error: applied.error };
    }
    if (!applied.changed) {
      return { ok: true, draft: stored };
    }

    const saved = await cms.saveSeoPlanningDraft(applied.draft);
    return { ok: true, draft: saved };
  } catch (error) {
    if (isSeoPlanningArchivedMutationError(error)) {
      return { ok: false, error: SEO_PLANNING_ARCHIVED_EDIT_MESSAGE };
    }
    return { ok: false, error: "Could not save the planning draft. Please try again." };
  }
}

export type GenerateChatgptWritingPromptActionResult = GenerateChatgptWritingPromptResult & {
  geminiBlogPromptConfigured?: boolean;
  openaiBlogPromptConfigured?: boolean;
};

/**
 * Explicit Generate with Gemini — creates a private ChatGPT writing prompt from the D1 Writing Brief.
 * Does not write BlogPosts, publish, change Planning workspace fields, call OpenAI, or call GSC.
 * One click = one Gemini request (never a silent cache return).
 */
export async function generateChatgptWritingPromptWithGeminiAction(
  rawInput: unknown,
): Promise<GenerateChatgptWritingPromptActionResult> {
  const geminiBlogPromptConfigured = isGeminiBlogPromptConfigured();
  const openaiBlogPromptConfigured = isOpenAiBlogPromptConfigured();
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return {
      ok: false,
      code: "unauthorized",
      error: actor.error,
      geminiBlogPromptConfigured,
      openaiBlogPromptConfigured,
    };
  }

  const input =
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>)
      : null;
  const planningDraftId = typeof input?.planningDraftId === "string" ? input.planningDraftId.trim() : "";
  if (!planningDraftId || Object.keys(input || {}).some((key) => key !== "planningDraftId")) {
    return {
      ok: false,
      code: "invalid_input",
      error: "Planning draft id is required.",
      geminiBlogPromptConfigured,
      openaiBlogPromptConfigured,
    };
  }

  if (!geminiBlogPromptConfigured) {
    return {
      ok: false,
      code: "not_configured",
      error: "Gemini writing-prompt generation is not configured yet.",
      geminiBlogPromptConfigured,
      openaiBlogPromptConfigured,
    };
  }

  const headerStore = await headers();
  const result = await generateChatgptWritingPromptWithGemini({
    planningDraftId,
    adminId: actor.user.id,
    ip: clientIp(headerStore),
    catalog: writingPromptCatalog(),
  });

  return { ...result, geminiBlogPromptConfigured, openaiBlogPromptConfigured };
}

/**
 * Explicit Generate with OpenAI — creates a private ChatGPT writing prompt from the D1 Writing Brief.
 * Does not write BlogPosts, publish, change Planning workspace fields, call Gemini, or call GSC.
 * One click = one OpenAI request (never a silent cache return). No live web research tools.
 */
export async function generateChatgptWritingPromptWithOpenAiAction(
  rawInput: unknown,
): Promise<GenerateChatgptWritingPromptActionResult> {
  const geminiBlogPromptConfigured = isGeminiBlogPromptConfigured();
  const openaiBlogPromptConfigured = isOpenAiBlogPromptConfigured();
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return {
      ok: false,
      code: "unauthorized",
      error: actor.error,
      geminiBlogPromptConfigured,
      openaiBlogPromptConfigured,
    };
  }

  const input =
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>)
      : null;
  const planningDraftId = typeof input?.planningDraftId === "string" ? input.planningDraftId.trim() : "";
  if (!planningDraftId || Object.keys(input || {}).some((key) => key !== "planningDraftId")) {
    return {
      ok: false,
      code: "invalid_input",
      error: "Planning draft id is required.",
      geminiBlogPromptConfigured,
      openaiBlogPromptConfigured,
    };
  }

  if (!openaiBlogPromptConfigured) {
    return {
      ok: false,
      code: "not_configured",
      error: "OpenAI writing-prompt generation is not configured yet.",
      geminiBlogPromptConfigured,
      openaiBlogPromptConfigured,
    };
  }

  const headerStore = await headers();
  const result = await generateChatgptWritingPromptWithOpenAi({
    planningDraftId,
    adminId: actor.user.id,
    ip: clientIp(headerStore),
    catalog: writingPromptCatalog(),
  });

  return { ...result, geminiBlogPromptConfigured, openaiBlogPromptConfigured };
}

export type GenerateChatgptImagePromptActionResult = GenerateChatgptImagePromptResult & {
  geminiImagePromptConfigured?: boolean;
  openaiImagePromptConfigured?: boolean;
};

/**
 * Explicit Generate with Gemini — creates a private ChatGPT image prompt from the E1 Image Brief.
 * Does not generate images, upload media, modify BlogPosts, call OpenAI, or call GSC.
 * One click = one Gemini request (never a silent cache return).
 */
export async function generateChatgptImagePromptWithGeminiAction(
  rawInput: unknown,
): Promise<GenerateChatgptImagePromptActionResult> {
  const geminiImagePromptConfigured = isGeminiImagePromptConfigured();
  const openaiImagePromptConfigured = isOpenAiImagePromptConfigured();
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return {
      ok: false,
      code: "unauthorized",
      error: actor.error,
      geminiImagePromptConfigured,
      openaiImagePromptConfigured,
    };
  }

  const input =
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>)
      : null;
  const planningDraftId = typeof input?.planningDraftId === "string" ? input.planningDraftId.trim() : "";
  if (!planningDraftId || Object.keys(input || {}).some((key) => key !== "planningDraftId")) {
    return {
      ok: false,
      code: "invalid_input",
      error: "Planning draft id is required.",
      geminiImagePromptConfigured,
      openaiImagePromptConfigured,
    };
  }

  if (!geminiImagePromptConfigured) {
    return {
      ok: false,
      code: "not_configured",
      error: "Gemini image-prompt generation is not configured yet.",
      geminiImagePromptConfigured,
      openaiImagePromptConfigured,
    };
  }

  const headerStore = await headers();
  const result = await generateChatgptImagePromptWithGemini({
    planningDraftId,
    adminId: actor.user.id,
    ip: clientIp(headerStore),
    catalog: imagePromptCatalog(),
  });

  return { ...result, geminiImagePromptConfigured, openaiImagePromptConfigured };
}

/**
 * Explicit Generate with OpenAI — creates a private ChatGPT image prompt from the E1 Image Brief.
 * Does not generate images, upload media, modify BlogPosts, call Gemini, or call GSC.
 * One click = one OpenAI request (never a silent cache return). No tools / web search / image APIs.
 */
export async function generateChatgptImagePromptWithOpenAiAction(
  rawInput: unknown,
): Promise<GenerateChatgptImagePromptActionResult> {
  const geminiImagePromptConfigured = isGeminiImagePromptConfigured();
  const openaiImagePromptConfigured = isOpenAiImagePromptConfigured();
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return {
      ok: false,
      code: "unauthorized",
      error: actor.error,
      geminiImagePromptConfigured,
      openaiImagePromptConfigured,
    };
  }

  const input =
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>)
      : null;
  const planningDraftId = typeof input?.planningDraftId === "string" ? input.planningDraftId.trim() : "";
  if (!planningDraftId || Object.keys(input || {}).some((key) => key !== "planningDraftId")) {
    return {
      ok: false,
      code: "invalid_input",
      error: "Planning draft id is required.",
      geminiImagePromptConfigured,
      openaiImagePromptConfigured,
    };
  }

  if (!openaiImagePromptConfigured) {
    return {
      ok: false,
      code: "not_configured",
      error: "OpenAI image-prompt generation is not configured yet.",
      geminiImagePromptConfigured,
      openaiImagePromptConfigured,
    };
  }

  const headerStore = await headers();
  const result = await generateChatgptImagePromptWithOpenAi({
    planningDraftId,
    adminId: actor.user.id,
    ip: clientIp(headerStore),
    catalog: imagePromptCatalog(),
  });

  return { ...result, geminiImagePromptConfigured, openaiImagePromptConfigured };
}

export type SeoPlanningLifecycleActionResult =
  | { ok: true; draft: SeoPlanningDraft }
  | { ok: false; error: string };

export type SeoPlanningPermanentDeleteActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Archive an active private Planning draft. Keeps payload/caches/evidence.
 * Does not call providers, touch BlogPost/Media, or change public routes.
 */
export async function archiveSeoPlanningDraftAction(
  rawInput: unknown,
): Promise<SeoPlanningLifecycleActionResult> {
  const actor = await requireAdminActor("seo");
  if (!actor.ok) return { ok: false, error: actor.error };

  const parsed = parseSeoPlanningLifecycleId(rawInput);
  if (!parsed.ok) return parsed;

  try {
    return await cms.archiveSeoPlanningDraft(parsed.id);
  } catch {
    return { ok: false, error: "Could not archive the planning draft. Please try again." };
  }
}

/**
 * Restore an archived Planning draft to the Active list (same id).
 * Does not regenerate AI content or touch BlogPost/Media.
 */
export async function restoreSeoPlanningDraftAction(
  rawInput: unknown,
): Promise<SeoPlanningLifecycleActionResult> {
  const actor = await requireAdminActor("seo");
  if (!actor.ok) return { ok: false, error: actor.error };

  const parsed = parseSeoPlanningLifecycleId(rawInput);
  if (!parsed.ok) return parsed;

  try {
    return await cms.restoreSeoPlanningDraft(parsed.id);
  } catch {
    return { ok: false, error: "Could not restore the planning draft. Please try again." };
  }
}

/**
 * Permanently delete an already-archived Planning draft only.
 * Requires confirmation matching working title (or id). Never deletes BlogPost/Media.
 */
export async function deleteSeoPlanningDraftPermanentlyAction(
  rawInput: unknown,
): Promise<SeoPlanningPermanentDeleteActionResult> {
  const actor = await requireAdminActor("seo");
  if (!actor.ok) return { ok: false, error: actor.error };

  const parsed = parseSeoPlanningPermanentDeleteInput(rawInput);
  if (!parsed.ok) return parsed;

  const stored = await cms.getSeoPlanningDraftById(parsed.id);
  if (!stored) return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };

  const confirmed = confirmSeoPlanningPermanentDelete(stored, parsed.confirmation);
  if (!confirmed.ok) return confirmed;

  try {
    return await cms.deleteSeoPlanningDraftPermanently(parsed.id);
  } catch {
    return { ok: false, error: "Could not permanently delete the planning draft. Please try again." };
  }
}

/**
 * Content Handoff V1 — open REFRESH target or create/reopen NEW_BLOG private draft.
 * Requires SEO + Blog permissions. Does not publish, advance workflow, or call providers.
 */
export async function handoffSeoPlanningToBlogAction(
  rawInput: unknown,
): Promise<SeoPlanningHandoffResult> {
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return {
      ok: false,
      error: actor.error,
      code: actor.error === "Unauthorized" ? "unauthorized" : "access_denied",
    };
  }
  if (!adminHasPermission(actor.user, "blog")) {
    return {
      ok: false,
      error: SEO_PLANNING_HANDOFF_BLOG_PERMISSION_MESSAGE,
      code: "blog_permission_required",
    };
  }

  const parsed = parseSeoPlanningHandoffInput(rawInput);
  if (!parsed.ok) return parsed;

  try {
    return await cms.handoffSeoPlanningToBlog(parsed.planningDraftId);
  } catch (error) {
    if (isSeoPlanningArchivedMutationError(error)) {
      return { ok: false, error: SEO_PLANNING_ARCHIVED_EDIT_MESSAGE, code: "planning_archived" };
    }
    return {
      ok: false,
      error: "Could not hand off this planning draft to the Blog editor. Please try again.",
      code: "handoff_conflict",
    };
  }
}
