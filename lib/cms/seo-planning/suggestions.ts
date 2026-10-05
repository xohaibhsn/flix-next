/**
 * Phase C — private suggestions seeded from the frozen opportunity snapshot.
 * No OpenAI. No GSC. No web research. No BlogPost. No redirects. No publish.
 * Opening a draft does not write. The first successful Edit / Apply / Ignore
 * persists the full allowed set and performs that operation in the same save.
 */

import { SEO_RESEARCH_INTENTS, type SeoResearchIntent } from "@/lib/cms/ai-seo/research-schemas";
import { SEO_PLANNING_FIELD_CAPS, isSeoPlanningActionableRecommendation } from "@/lib/cms/seo-planning/constants";
import { sanitizeSeoPlanningDraft } from "@/lib/cms/seo-planning/sanitize";
import {
  isContentPlanningRecommendation,
  isInternalLinkPlanningRecommendation,
} from "@/lib/cms/seo-planning/workspace";
import type { SeoPlanningDraft } from "@/lib/cms/types";

export const SEO_PLANNING_SUGGESTION_KEYS = [
  "workingTitle",
  "topic",
  "searchIntent",
  "contentAngle",
  "nextStep",
] as const;

export type SeoPlanningSuggestionKey = (typeof SEO_PLANNING_SUGGESTION_KEYS)[number];

export const SEO_PLANNING_SUGGESTION_STATUSES = ["PENDING", "APPLIED", "IGNORED"] as const;

export type SeoPlanningSuggestionStatus = (typeof SEO_PLANNING_SUGGESTION_STATUSES)[number];

export type SeoPlanningSuggestion = {
  originalValue: string;
  value: string;
  status: SeoPlanningSuggestionStatus;
};

export type SeoPlanningSuggestionMap = Partial<
  Record<SeoPlanningSuggestionKey, SeoPlanningSuggestion>
>;

export const SEO_PLANNING_SUGGESTION_OPERATIONS = ["APPLY", "EDIT", "IGNORE"] as const;

export type SeoPlanningSuggestionOperation = (typeof SEO_PLANNING_SUGGESTION_OPERATIONS)[number];

export type SeoPlanningSuggestionCommand = {
  id: string;
  key: SeoPlanningSuggestionKey;
  operation: SeoPlanningSuggestionOperation;
  /** EDIT only. APPLY never trusts a browser candidate. */
  value?: string;
  /** APPLY only. True solely after an explicit replace confirmation. */
  acknowledgeReplace?: boolean;
};

export const SEO_PLANNING_SUGGESTION_REPLACE_MESSAGE =
  "This will replace the current planning value.";

export const SEO_PLANNING_SUGGESTION_READY_APPLY_MESSAGE =
  "Move this plan back to SEO Review before applying a suggestion.";

export const SEO_PLANNING_SUGGESTION_DIRTY_MESSAGE =
  "Save your planning changes before updating suggestions.";

export const SEO_PLANNING_SUGGESTION_DRIFT_MESSAGE =
  "Current planning value changed after this suggestion was applied.";

const CONTENT_SUGGESTION_KEYS = SEO_PLANNING_SUGGESTION_KEYS;

const INTERNAL_LINK_SUGGESTION_KEYS = ["contentAngle", "nextStep"] as const satisfies readonly SeoPlanningSuggestionKey[];

const SUGGESTION_KEY_SET = new Set<string>(SEO_PLANNING_SUGGESTION_KEYS);

export type SeoPlanningSuggestionMutationResult =
  | { ok: true; draft: SeoPlanningDraft; changed: boolean }
  | { ok: false; error: string; needsReplaceConfirmation?: boolean };

export type SeoPlanningSuggestionParseResult =
  | { ok: true; value: SeoPlanningSuggestionCommand }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const text = typeof value === "string" ? value.trim() : "";
  return (allowed as readonly string[]).includes(text) ? (text as T) : null;
}

function capFor(key: SeoPlanningSuggestionKey): number {
  if (key === "workingTitle") return SEO_PLANNING_FIELD_CAPS.workingTitle;
  if (key === "topic") return SEO_PLANNING_FIELD_CAPS.topic;
  if (key === "contentAngle") return SEO_PLANNING_FIELD_CAPS.suggestedAngle;
  if (key === "nextStep") return SEO_PLANNING_FIELD_CAPS.nextStep;
  return SEO_PLANNING_FIELD_CAPS.searchIntent;
}

function labelFor(key: SeoPlanningSuggestionKey): string {
  if (key === "workingTitle") return "Working title";
  if (key === "topic") return "Topic";
  if (key === "contentAngle") return "Content angle";
  if (key === "nextStep") return "Next step";
  return "Search intent";
}

export function allowedSeoPlanningSuggestionKeys(
  recommendation: string,
): readonly SeoPlanningSuggestionKey[] {
  if (isContentPlanningRecommendation(recommendation)) return CONTENT_SUGGESTION_KEYS;
  if (isInternalLinkPlanningRecommendation(recommendation)) return INTERNAL_LINK_SUGGESTION_KEYS;
  return [];
}

function sourceText(opportunity: Record<string, unknown>, key: SeoPlanningSuggestionKey): string | null {
  const raw =
    key === "contentAngle"
      ? opportunity.suggestedAngle
      : key === "nextStep"
        ? opportunity.nextStep
        : opportunity[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\0/g, "").trim();
  if (!trimmed || trimmed.length > capFor(key)) return null;
  if (key === "searchIntent" && !oneOf(trimmed, SEO_RESEARCH_INTENTS)) return null;
  return trimmed;
}

function orderedMap(map: SeoPlanningSuggestionMap): SeoPlanningSuggestionMap {
  const out: SeoPlanningSuggestionMap = {};
  for (const key of SEO_PLANNING_SUGGESTION_KEYS) {
    const row = map[key];
    if (!row) continue;
    out[key] = {
      originalValue: row.originalValue,
      value: row.value,
      status: row.status,
    };
  }
  return out;
}

function normalizeStoredSuggestion(raw: unknown): SeoPlanningSuggestion | null {
  const row = asRecord(raw);
  if (!row) return null;
  if (typeof row.originalValue !== "string" || !row.originalValue.trim()) return null;
  if (typeof row.value !== "string") return null;
  const status = oneOf(row.status, SEO_PLANNING_SUGGESTION_STATUSES);
  if (!status) return null;
  return {
    originalValue: row.originalValue,
    value: row.value,
    status,
  };
}

/**
 * Null when `payload.workspace.suggestions` is absent.
 * An existing map is returned as stored and is never refilled from the snapshot.
 */
export function readPersistedSeoPlanningSuggestions(payload: unknown): SeoPlanningSuggestionMap | null {
  const root = asRecord(payload);
  if (!root) return null;
  const workspace = asRecord(root.workspace);
  if (!workspace || !Object.prototype.hasOwnProperty.call(workspace, "suggestions")) return null;
  const record = asRecord(workspace.suggestions);
  if (!record) return null;
  const out: SeoPlanningSuggestionMap = {};
  for (const key of SEO_PLANNING_SUGGESTION_KEYS) {
    const row = normalizeStoredSuggestion(record[key]);
    if (row) out[key] = row;
  }
  return out;
}

/** In-memory PENDING cards from the frozen opportunity. Does not write. */
export function deriveSeoPlanningSuggestions(draft: SeoPlanningDraft): SeoPlanningSuggestionMap {
  const opportunity = asRecord(asRecord(draft.payload)?.opportunity) || {};
  const allowed = new Set(allowedSeoPlanningSuggestionKeys(draft.recommendation));
  const out: SeoPlanningSuggestionMap = {};
  for (const key of SEO_PLANNING_SUGGESTION_KEYS) {
    if (!allowed.has(key)) continue;
    const text = sourceText(opportunity, key);
    if (!text) continue;
    out[key] = { originalValue: text, value: text, status: "PENDING" };
  }
  return out;
}

/**
 * Persisted suggestions when present; otherwise the same derivation the first
 * successful mutation will seed. Safe to call while rendering.
 */
export function seoPlanningSuggestionsForDisplay(draft: SeoPlanningDraft): SeoPlanningSuggestionMap {
  const persisted = readPersistedSeoPlanningSuggestions(draft.payload);
  if (!persisted) return deriveSeoPlanningSuggestions(draft);
  const allowed = new Set(allowedSeoPlanningSuggestionKeys(draft.recommendation));
  const out: SeoPlanningSuggestionMap = {};
  for (const key of SEO_PLANNING_SUGGESTION_KEYS) {
    if (!allowed.has(key)) continue;
    const row = persisted[key];
    if (row) out[key] = row;
  }
  return out;
}

export function currentSeoPlanningSuggestionValue(
  draft: SeoPlanningDraft,
  key: SeoPlanningSuggestionKey,
): string {
  if (key === "workingTitle") return draft.workingTitle;
  if (key === "topic") return draft.topic;
  if (key === "searchIntent") return draft.searchIntent;
  const workspace = asRecord(asRecord(draft.payload)?.workspace);
  if (!workspace) return "";
  if (key === "contentAngle") {
    return typeof workspace.contentAngle === "string" ? workspace.contentAngle : "";
  }
  return typeof workspace.nextStep === "string" ? workspace.nextStep : "";
}

export function seoPlanningSuggestionDrift(
  draft: SeoPlanningDraft,
  key: SeoPlanningSuggestionKey,
  suggestion: SeoPlanningSuggestion,
): boolean {
  return (
    suggestion.status === "APPLIED" &&
    currentSeoPlanningSuggestionValue(draft, key) !== suggestion.value
  );
}

function validateSuggestionValue(
  key: SeoPlanningSuggestionKey,
  raw: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (key === "searchIntent") {
    const intent = oneOf(raw, SEO_RESEARCH_INTENTS);
    if (!intent) return { ok: false, error: "Choose a valid search intent." };
    return { ok: true, value: intent };
  }
  const label = labelFor(key);
  if (typeof raw !== "string") return { ok: false, error: `${label} is required.` };
  const trimmed = raw.replace(/\0/g, "").trim();
  if (!trimmed) return { ok: false, error: `${label} is required.` };
  if (trimmed.length > capFor(key)) return { ok: false, error: `${label} is too long.` };
  return { ok: true, value: trimmed };
}

export function parseSeoPlanningSuggestionInput(raw: unknown): SeoPlanningSuggestionParseResult {
  const row = asRecord(raw);
  if (!row) return { ok: false, error: "Suggestion data is missing." };

  const id = typeof row.id === "string" ? row.id.replace(/\0/g, "").trim() : "";
  if (!id || id.length > SEO_PLANNING_FIELD_CAPS.id) {
    return { ok: false, error: "Planning draft id is required." };
  }

  const keyText = typeof row.key === "string" ? row.key.trim() : "";
  if (!SUGGESTION_KEY_SET.has(keyText)) {
    return { ok: false, error: "That suggestion is not available." };
  }
  const key = keyText as SeoPlanningSuggestionKey;

  const operation = oneOf(row.operation, SEO_PLANNING_SUGGESTION_OPERATIONS);
  if (!operation) return { ok: false, error: "That suggestion action is not available." };

  const command: SeoPlanningSuggestionCommand = { id, key, operation };
  if (operation === "EDIT") {
    if (typeof row.value !== "string") {
      return { ok: false, error: `${labelFor(key)} is required.` };
    }
    command.value = row.value;
  }
  if (operation === "APPLY") {
    command.acknowledgeReplace = row.acknowledgeReplace === true;
  }
  return { ok: true, value: command };
}

function workspaceRecord(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...(asRecord(payload.workspace) || {}) };
}

/**
 * Mutate one suggestion on a stored draft.
 * A rejected confirmation or validation returns no draft and does not seed.
 */
export function applySeoPlanningSuggestionCommand(
  stored: SeoPlanningDraft,
  command: SeoPlanningSuggestionCommand,
  now?: string,
): SeoPlanningSuggestionMutationResult {
  if (command.id !== stored.id) {
    return { ok: false, error: "Planning draft id does not match." };
  }
  if (!isSeoPlanningActionableRecommendation(stored.recommendation)) {
    return { ok: false, error: "This planning draft cannot be edited." };
  }

  const allowed = allowedSeoPlanningSuggestionKeys(stored.recommendation);
  if (!allowed.includes(command.key)) {
    return { ok: false, error: "That suggestion is not available for this plan." };
  }

  if (command.operation === "APPLY" && stored.workflowStatus === "READY_TO_PUBLISH") {
    return { ok: false, error: SEO_PLANNING_SUGGESTION_READY_APPLY_MESSAGE };
  }

  const persisted = readPersistedSeoPlanningSuggestions(stored.payload);
  const base = persisted ? seoPlanningSuggestionsForDisplay(stored) : deriveSeoPlanningSuggestions(stored);
  const currentRow = base[command.key];
  if (!currentRow) {
    return { ok: false, error: "That suggestion is not available." };
  }

  if (command.operation === "EDIT" && currentRow.status === "IGNORED") {
    return { ok: false, error: "Ignored suggestions stay as they are." };
  }
  if (command.operation === "APPLY" && currentRow.status === "IGNORED") {
    return { ok: false, error: "Ignored suggestions cannot be applied." };
  }

  let nextValue = currentRow.value;
  if (command.operation === "EDIT") {
    const validated = validateSuggestionValue(command.key, command.value);
    if (!validated.ok) return validated;
    nextValue = validated.value;
  } else if (command.operation === "APPLY") {
    const validated = validateSuggestionValue(command.key, currentRow.value);
    if (!validated.ok) {
      return { ok: false, error: "That suggestion cannot be applied." };
    }
    nextValue = validated.value;
  }

  if (command.operation === "APPLY") {
    const currentPlanning = currentSeoPlanningSuggestionValue(stored, command.key);
    if (currentPlanning !== nextValue && command.acknowledgeReplace !== true) {
      return {
        ok: false,
        error: SEO_PLANNING_SUGGESTION_REPLACE_MESSAGE,
        needsReplaceConfirmation: true,
      };
    }
    if (currentRow.status === "APPLIED" && currentPlanning === nextValue && persisted) {
      return { ok: true, draft: stored, changed: false };
    }
  }

  if (command.operation === "IGNORE" && currentRow.status === "IGNORED" && persisted) {
    return { ok: true, draft: stored, changed: false };
  }

  const nextStatus: SeoPlanningSuggestionStatus =
    command.operation === "APPLY" ? "APPLIED" : command.operation === "IGNORE" ? "IGNORED" : "PENDING";

  const nextSuggestions = orderedMap({
    ...base,
    [command.key]: {
      originalValue: currentRow.originalValue,
      value: nextValue,
      status: nextStatus,
    },
  });

  const storedPayload = asRecord(stored.payload) ? { ...(stored.payload as Record<string, unknown>) } : {};
  const nextWorkspace = workspaceRecord(storedPayload);
  nextWorkspace.suggestions = nextSuggestions;
  if (command.operation === "APPLY" && command.key === "contentAngle") {
    nextWorkspace.contentAngle = nextValue;
  }
  if (command.operation === "APPLY" && command.key === "nextStep") {
    nextWorkspace.nextStep = nextValue;
  }
  storedPayload.workspace = nextWorkspace;

  const updatedAt = now || new Date().toISOString();
  const next = sanitizeSeoPlanningDraft({
    ...stored,
    id: stored.id,
    recommendation: stored.recommendation,
    fingerprint: stored.fingerprint,
    proposedSlug: stored.proposedSlug,
    targetPostId: stored.targetPostId,
    matchedPublicUrl: stored.matchedPublicUrl,
    restorePath: stored.restorePath,
    linkedPostId: stored.linkedPostId,
    createdBy: stored.createdBy,
    createdAt: stored.createdAt,
    workflowStatus: stored.workflowStatus,
    topic: command.operation === "APPLY" && command.key === "topic" ? nextValue : stored.topic,
    workingTitle:
      command.operation === "APPLY" && command.key === "workingTitle" ? nextValue : stored.workingTitle,
    searchIntent:
      command.operation === "APPLY" && command.key === "searchIntent"
        ? (nextValue as SeoResearchIntent)
        : stored.searchIntent,
    updatedAt,
    payload: storedPayload,
  });

  return { ok: true, draft: next, changed: true };
}
