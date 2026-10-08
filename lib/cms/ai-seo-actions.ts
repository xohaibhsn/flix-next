"use server";

import { headers } from "next/headers";
import { requireAdminActor } from "@/lib/auth/guards";
import type { Permission } from "@/lib/auth/permissions";
import {
  getSeoAiProviderAvailability,
  isGeminiSeoConfigured,
  isOpenAiSeoConfigured,
} from "@/lib/cms/ai-seo/config";
import { draftSeoTitleMeta, type DraftSeoTitleMetaResult } from "@/lib/cms/ai-seo/draft";
import { explainSeoFinding, type ExplainSeoFindingResult } from "@/lib/cms/ai-seo/explain";
import { parseSeoAiProviderRequest } from "@/lib/cms/ai-seo/provider-type";
import type { ResearchUkOpportunitiesResult } from "@/lib/cms/ai-seo/research";
import { parseSeoDraftInput } from "@/lib/cms/ai-seo/schemas";
import { researchUkContentOpportunitiesWithDecisionPipelineFromCms } from "@/lib/cms/seo-decision-pipeline/research-bridge";
import type { SeoResearchDecisionPipelineAttachment } from "@/lib/cms/seo-decision-pipeline/research-bridge-types";

function clientIp(headerStore: Headers) {
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headerStore.get("x-real-ip")?.trim() || "unknown";
}

export type ExplainSeoFindingActionResult = ExplainSeoFindingResult & {
  openaiConfigured?: boolean;
  geminiConfigured?: boolean;
  /** @deprecated Prefer openaiConfigured / geminiConfigured. */
  configured?: boolean;
};

export type DraftSeoTitleMetaActionResult = DraftSeoTitleMetaResult & {
  openaiConfigured?: boolean;
  geminiConfigured?: boolean;
  /** @deprecated Prefer openaiConfigured / geminiConfigured. */
  configured?: boolean;
};

function availabilityFlags() {
  const availability = getSeoAiProviderAvailability();
  return {
    ...availability,
    configured: availability.openaiConfigured || availability.geminiConfigured,
  };
}

/**
 * Explicit user-triggered Sidhu AI explanation for one SEO Health finding.
 * Does not mutate CMS content or SEO Health issue-memory state.
 * Provider is required and never falls back to the other API.
 */
export async function explainSeoHealthFindingAction(
  rawInput: unknown,
): Promise<ExplainSeoFindingActionResult> {
  const flags = availabilityFlags();
  const actor = await requireAdminActor("seo");
  if (!actor.ok) {
    return { ok: false, code: "unauthorized", error: actor.error, ...flags };
  }

  const parsedRequest = parseSeoAiProviderRequest(rawInput);
  if (!parsedRequest.ok) {
    return { ok: false, code: "invalid_input", error: parsedRequest.error, ...flags };
  }

  const { provider, payload } = parsedRequest;
  const providerConfigured = provider === "gemini" ? isGeminiSeoConfigured() : isOpenAiSeoConfigured();
  if (!providerConfigured) {
    return {
      ok: false,
      code: "not_configured",
      error: "Sidhu AI SEO Assistant is not configured yet.",
      ...flags,
    };
  }

  const headerStore = await headers();
  const result = await explainSeoFinding({
    provider,
    rawInput: payload,
    adminId: actor.user.id,
    ip: clientIp(headerStore),
  });

  return { ...result, ...flags };
}

function permissionForDraftEntity(entityKind: string): Permission {
  return entityKind === "page" ? "seo" : "blog";
}

/**
 * Explicit user-triggered SEO title/meta draft suggestions.
 * Populates editor fields only after the admin chooses an option client-side.
 * Never writes CMS content or SEO Health memory.
 * Provider is required and never falls back to the other API.
 */
export async function draftSeoTitleMetaAction(rawInput: unknown): Promise<DraftSeoTitleMetaActionResult> {
  const flags = availabilityFlags();
  const parsedRequest = parseSeoAiProviderRequest(rawInput);
  if (!parsedRequest.ok) {
    return { ok: false, code: "invalid_input", error: parsedRequest.error, ...flags };
  }

  const { provider, payload } = parsedRequest;
  const parsed = parseSeoDraftInput(payload);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_input", error: parsed.error, ...flags };
  }

  const actor = await requireAdminActor(permissionForDraftEntity(parsed.value.entityKind));
  if (!actor.ok) {
    return { ok: false, code: "unauthorized", error: actor.error, ...flags };
  }

  const providerConfigured = provider === "gemini" ? isGeminiSeoConfigured() : isOpenAiSeoConfigured();
  if (!providerConfigured) {
    return {
      ok: false,
      code: "not_configured",
      error: "Sidhu AI SEO Assistant is not configured yet.",
      ...flags,
    };
  }

  const headerStore = await headers();
  const result = await draftSeoTitleMeta({
    provider,
    rawInput: parsed.value,
    adminId: actor.user.id,
    ip: clientIp(headerStore),
  });

  return { ...result, ...flags };
}

export type ResearchUkOpportunitiesActionResult = ResearchUkOpportunitiesResult & {
  configured?: boolean;
  /** Present on successful Research when Decision Pipeline ran (or CONTEXT_ERROR). */
  decisionPipeline?: SeoResearchDecisionPipelineAttachment;
};

/**
 * Explicit user-triggered UK content opportunity research (web_search).
 * Never creates, edits, saves, or publishes CMS content.
 * OpenAI-only — Gemini is not offered for research.
 * After Research succeeds, evaluates Decision Pipeline (RF→NBA→Priority) once;
 * pipeline context failure still returns Research for manual use.
 */
export async function researchUkContentOpportunitiesAction(): Promise<ResearchUkOpportunitiesActionResult> {
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
  const result = await researchUkContentOpportunitiesWithDecisionPipelineFromCms({
    adminId: actor.user.id,
    ip: clientIp(headerStore),
  });

  return { ...result, configured: true };
}
