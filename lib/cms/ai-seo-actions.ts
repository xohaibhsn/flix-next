"use server";

import { headers } from "next/headers";
import { requireAdminActor } from "@/lib/auth/guards";
import { isOpenAiSeoConfigured } from "@/lib/cms/ai-seo/config";
import { explainSeoFinding, type ExplainSeoFindingResult } from "@/lib/cms/ai-seo/explain";

function clientIp(headerStore: Headers) {
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headerStore.get("x-real-ip")?.trim() || "unknown";
}

export type ExplainSeoFindingActionResult = ExplainSeoFindingResult & {
  configured?: boolean;
};

/**
 * Explicit user-triggered Sidhu AI explanation for one SEO Health finding.
 * Does not mutate CMS content or SEO Health issue-memory state.
 */
export async function explainSeoHealthFindingAction(
  rawInput: unknown,
): Promise<ExplainSeoFindingActionResult> {
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return { ok: false, code: "unauthorized", error: actor.error, configured: isOpenAiSeoConfigured() };
  }

  if (!isOpenAiSeoConfigured()) {
    return {
      ok: false,
      code: "not_configured",
      error: "Sidhu AI SEO Assistant is not configured yet.",
      configured: false,
    };
  }

  const headerStore = await headers();
  const result = await explainSeoFinding({
    rawInput,
    adminId: actor.user.id,
    ip: clientIp(headerStore),
  });

  return { ...result, configured: true };
}
