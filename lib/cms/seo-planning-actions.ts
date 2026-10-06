"use server";

import { headers } from "next/headers";
import { requireAdminActor } from "@/lib/auth/guards";
import { isGeminiBlogPromptConfigured } from "@/lib/cms/ai-seo/config";
import { cms } from "@/lib/cms/repository";
import {
  proceedSeoOpportunityToPlanningDraft,
  type ProceedSeoPlanningResult,
} from "@/lib/cms/seo-planning/proceed";
import {
  applySeoPlanningSuggestionCommand,
  parseSeoPlanningSuggestionInput,
} from "@/lib/cms/seo-planning/suggestions";
import {
  generateChatgptWritingPromptWithGemini,
  type GenerateChatgptWritingPromptResult,
} from "@/lib/cms/seo-planning/writing-prompt";
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
    return { ok: false, error: "That planning draft could not be found." };
  }

  const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value);
  if (!applied.ok) return applied;

  try {
    const saved = await cms.saveSeoPlanningDraft(applied.draft);
    return { ok: true, draft: saved };
  } catch {
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
      return { ok: false, error: "That planning draft could not be found." };
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
  } catch {
    return { ok: false, error: "Could not save the planning draft. Please try again." };
  }
}

export type GenerateChatgptWritingPromptActionResult = GenerateChatgptWritingPromptResult & {
  geminiBlogPromptConfigured?: boolean;
};

/**
 * Explicit Generate with Gemini — creates a private ChatGPT writing prompt from the D1 Writing Brief.
 * Does not write BlogPosts, publish, change Planning workspace fields, call OpenAI, or call GSC.
 * One click = one Gemini request (never a silent cache return).
 */
export async function generateChatgptWritingPromptWithGeminiAction(
  rawInput: unknown,
): Promise<GenerateChatgptWritingPromptActionResult> {
  const configured = isGeminiBlogPromptConfigured();
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return { ok: false, code: "unauthorized", error: actor.error, geminiBlogPromptConfigured: configured };
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
      geminiBlogPromptConfigured: configured,
    };
  }

  if (!configured) {
    return {
      ok: false,
      code: "not_configured",
      error: "Gemini writing-prompt generation is not configured yet.",
      geminiBlogPromptConfigured: configured,
    };
  }

  const headerStore = await headers();
  const result = await generateChatgptWritingPromptWithGemini({
    planningDraftId,
    adminId: actor.user.id,
    ip: clientIp(headerStore),
    catalog: {
      getSeoPlanningDraftById: (id) => cms.getSeoPlanningDraftById(id),
      mergeSeoPlanningGeminiWritingPromptCache: (args) =>
        cms.mergeSeoPlanningGeminiWritingPromptCache(args),
      getPostById: (id) => cms.getPostById(id),
      listCategories: () => cms.listCategories(),
    },
  });

  return { ...result, geminiBlogPromptConfigured: configured };
}
