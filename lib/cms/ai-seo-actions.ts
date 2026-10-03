"use server";

import { headers } from "next/headers";
import { requireAdminActor } from "@/lib/auth/guards";
import type { Permission } from "@/lib/auth/permissions";
import { isOpenAiSeoConfigured } from "@/lib/cms/ai-seo/config";
import { draftSeoTitleMeta, type DraftSeoTitleMetaResult } from "@/lib/cms/ai-seo/draft";
import { explainSeoFinding, type ExplainSeoFindingResult } from "@/lib/cms/ai-seo/explain";
import { parseSeoDraftInput } from "@/lib/cms/ai-seo/schemas";

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

export type DraftSeoTitleMetaActionResult = DraftSeoTitleMetaResult & {
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

function permissionForDraftEntity(entityKind: string): Permission {
  return entityKind === "page" ? "seo" : "blog";
}

/**
 * Explicit user-triggered SEO title/meta draft suggestions.
 * Populates editor fields only after the admin chooses an option client-side.
 * Never writes CMS content or SEO Health memory.
 */
export async function draftSeoTitleMetaAction(rawInput: unknown): Promise<DraftSeoTitleMetaActionResult> {
  const parsed = parseSeoDraftInput(rawInput);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_input", error: parsed.error, configured: isOpenAiSeoConfigured() };
  }

  const actor = await requireAdminActor(permissionForDraftEntity(parsed.value.entityKind));
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
  const result = await draftSeoTitleMeta({
    rawInput: parsed.value,
    adminId: actor.user.id,
    ip: clientIp(headerStore),
  });

  return { ...result, configured: true };
}
