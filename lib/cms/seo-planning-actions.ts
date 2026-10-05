"use server";

import { requireAdminActor } from "@/lib/auth/guards";
import { cms } from "@/lib/cms/repository";
import {
  proceedSeoOpportunityToPlanningDraft,
  type ProceedSeoPlanningResult,
} from "@/lib/cms/seo-planning/proceed";

export type ProceedSeoOpportunityActionResult = ProceedSeoPlanningResult;

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
