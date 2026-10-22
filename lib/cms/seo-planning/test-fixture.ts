/**
 * SEO Editorial Evidence — disposable Planning TEST FIXTURE (local RC).
 *
 * Production default: compile-time OFF. No request/client flag can enable creation.
 * Creates one reserved-fingerprint INTERNAL_LINK_ONLY private draft with honest
 * TEST_FIXTURE provenance (never Research/GSC/Ledger/opportunity payload).
 *
 * Schema v6 compatible — no migration. No Blog / provider / publisher side effects.
 */

import { createId } from "@/lib/cms/ids";
import { SEO_PLANNING_DEFAULT_WORKFLOW, SEO_PLANNING_FIELD_CAPS } from "@/lib/cms/seo-planning/constants";
import {
  confirmSeoPlanningPermanentDelete,
  isSeoPlanningDraftArchived,
  SEO_PLANNING_DELETE_CONFIRM_MISMATCH_MESSAGE,
  SEO_PLANNING_MISSING_DRAFT_MESSAGE,
  SEO_PLANNING_NOT_ARCHIVED_MESSAGE,
} from "@/lib/cms/seo-planning/lifecycle";
import { sanitizeSeoPlanningDraft } from "@/lib/cms/seo-planning/sanitize";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { sanitizeText } from "@/lib/cms/validation";

/**
 * Compile-time production OFF. Future activation = reviewed source change + Professor approval.
 * Typed as boolean (not `as const`) so the gate helper remains a real runtime check.
 */
export const SEO_PLANNING_EDITORIAL_EVIDENCE_TEST_FIXTURE_ENABLED: boolean = false;

export const SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY = "testFixtureV1" as const;
export const SEO_PLANNING_TEST_FIXTURE_KIND = "TEST_FIXTURE" as const;
export const SEO_PLANNING_TEST_FIXTURE_PURPOSE = "seo_editorial_evidence_acceptance" as const;
export const SEO_PLANNING_TEST_FIXTURE_VERSION = 1 as const;

/** Deterministic reserved fingerprint — MySQL UNIQUE enforces one active namespace. */
export const SEO_PLANNING_TEST_FIXTURE_FINGERPRINT =
  "TEST_FIXTURE:seo_editorial_evidence_acceptance:v1" as const;

export const SEO_PLANNING_TEST_FIXTURE_WORKING_TITLE =
  "TEST — SEO Editorial Evidence Acceptance — DO NOT PUBLISH" as const;
export const SEO_PLANNING_TEST_FIXTURE_TOPIC =
  "Internal CMS editorial evidence validation fixture" as const;
export const SEO_PLANNING_TEST_FIXTURE_RECOMMENDATION = "INTERNAL_LINK_ONLY" as const;

export const SEO_PLANNING_TEST_FIXTURE_DISABLED_MESSAGE =
  "Editorial evidence test-fixture creation is disabled." as const;
export const SEO_PLANNING_TEST_FIXTURE_EXISTS_MESSAGE =
  "An editorial evidence test fixture already exists. Archive and permanently delete it before creating another." as const;
export const SEO_PLANNING_TEST_FIXTURE_NOT_FIXTURE_MESSAGE =
  "That planning draft is not an authorized editorial evidence test fixture." as const;
export const SEO_PLANNING_TEST_FIXTURE_IDENTITY_MISMATCH_MESSAGE =
  "Test fixture identity mismatch. Permanent delete was cancelled." as const;
export const SEO_PLANNING_TEST_FIXTURE_LINKED_MESSAGE =
  "This test fixture appears linked or contaminated and cannot be permanently deleted." as const;
export const SEO_PLANNING_TEST_FIXTURE_HANDOFF_MESSAGE =
  "TEST fixtures cannot open or create Blog posts." as const;
export const SEO_PLANNING_TEST_FIXTURE_CREATE_FAILED_MESSAGE =
  "Could not create the editorial evidence test fixture. Please try again." as const;
export const SEO_PLANNING_TEST_FIXTURE_DELETE_FAILED_MESSAGE =
  "Could not permanently delete the editorial evidence test fixture. Please try again." as const;
export const SEO_PLANNING_TEST_FIXTURE_ONESHOT_CONSUMED_MESSAGE =
  "The editorial evidence test-fixture one-shot creation allowance is already consumed. Recreation requires a separately authorized reset." as const;
export const SEO_PLANNING_TEST_FIXTURE_USE_FIXTURE_DELETE_MESSAGE =
  "TEST fixtures must be permanently deleted only through the fixture-specific delete action." as const;
export const SEO_PLANNING_TEST_FIXTURE_SUPER_ADMIN_REQUIRED_MESSAGE =
  "Only Super Admin may create the editorial evidence test fixture." as const;
export const SEO_PLANNING_TEST_FIXTURE_CREATE_CONFIRM_MISMATCH_MESSAGE =
  "Fixture creation confirmation did not match. Creation was cancelled." as const;
export const SEO_PLANNING_TEST_FIXTURE_LINEAGE_UNKNOWN_MESSAGE =
  "Fixture lineage status could not be established. Permanent delete was cancelled." as const;

/** Durable site_settings / JSON flag key — survives workers, restarts, and fixture deletion. */
export const SEO_PLANNING_TEST_FIXTURE_ONESHOT_KEY =
  "seo_editorial_evidence_fixture_oneshot_v1" as const;

/** Exact confirmation phrase required for temporary Super Admin create control. */
export const SEO_PLANNING_TEST_FIXTURE_CREATE_CONFIRM =
  "CREATE SEO EDITORIAL EVIDENCE TEST FIXTURE" as const;

/**
 * Future activation order (documented + tested offline — not executed here):
 * 1) Approved ON release → 2) create one fixture → 3) approved OFF release →
 * 4) verify OFF without mutating create → 5) evidence acceptance on existing ID →
 * 6) archive → 7) fixture-specific permanent delete.
 * Residual ON workers must not recreate after delete because the one-shot latch stays consumed.
 */
export const SEO_PLANNING_TEST_FIXTURE_OFF_BEFORE_CLEANUP_ORDER = [
  "approved_on_release",
  "create_one_fixture",
  "approved_off_release",
  "verify_off_without_mutating_create",
  "evidence_acceptance_on_existing_id",
  "archive_exact_id",
  "fixture_specific_permanent_delete",
] as const;

export type FixtureLineageStatus = "unlinked" | "linked" | "unknown";

export type SeoPlanningTestFixtureOneshotV1 = {
  kind: "TEST_FIXTURE_ONESHOT";
  purpose: typeof SEO_PLANNING_TEST_FIXTURE_PURPOSE;
  version: 1;
  consumedAt: string;
  consumedBy: string;
  planningId: string;
};

export type SeoPlanningTestFixtureV1 = {
  kind: typeof SEO_PLANNING_TEST_FIXTURE_KIND;
  purpose: typeof SEO_PLANNING_TEST_FIXTURE_PURPOSE;
  version: typeof SEO_PLANNING_TEST_FIXTURE_VERSION;
  createdAt: string;
  createdBy: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** True when the compile-time gate allows fixture creation (always false in this RC). */
export function isSeoPlanningEditorialEvidenceTestFixtureCreationEnabled(): boolean {
  return SEO_PLANNING_EDITORIAL_EVIDENCE_TEST_FIXTURE_ENABLED === true;
}

/**
 * Test-only override for offline unit tests. Production actions never pass true.
 * Does not change the compile-time constant; callers must still be offline tests.
 */
export function evaluateTestFixtureCreationGate(args?: {
  /** Offline tests only — ignored unless explicitly true in test harness. */
  testOnlyForceEnabled?: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (args?.testOnlyForceEnabled === true) return { ok: true };
  if (!isSeoPlanningEditorialEvidenceTestFixtureCreationEnabled()) {
    return { ok: false, error: SEO_PLANNING_TEST_FIXTURE_DISABLED_MESSAGE };
  }
  return { ok: true };
}

/** Ignore client claims that attempt to enable the fixture gate or spoof markers. */
export function ignoreClientSuppliedTestFixtureFlags(raw: unknown): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const row = raw as Record<string, unknown>;
  void row.enabled;
  void row.testFixtureEnabled;
  void row.forceEnable;
  void row.testOnlyForceEnabled;
  void row.fixture;
  void row.testFixtureV1;
  void row.fingerprint;
  void row.recommendation;
  void row.id;
}

export function readSeoPlanningTestFixtureMarker(
  payload: unknown,
): SeoPlanningTestFixtureV1 | null {
  const root = asRecord(payload);
  if (!root) return null;
  const raw = asRecord(root[SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY]);
  if (!raw) return null;
  if (raw.kind !== SEO_PLANNING_TEST_FIXTURE_KIND) return null;
  if (raw.purpose !== SEO_PLANNING_TEST_FIXTURE_PURPOSE) return null;
  if (raw.version !== SEO_PLANNING_TEST_FIXTURE_VERSION) return null;
  const createdAt = sanitizeText(raw.createdAt, 40).trim();
  const createdBy = sanitizeText(raw.createdBy, SEO_PLANNING_FIELD_CAPS.createdBy).trim();
  if (!createdAt || !createdBy) return null;
  return {
    kind: SEO_PLANNING_TEST_FIXTURE_KIND,
    purpose: SEO_PLANNING_TEST_FIXTURE_PURPOSE,
    version: SEO_PLANNING_TEST_FIXTURE_VERSION,
    createdAt,
    createdBy,
  };
}

export function isSeoPlanningEditorialEvidenceTestFixture(
  draft: Pick<SeoPlanningDraft, "fingerprint" | "recommendation" | "payload"> | null | undefined,
): boolean {
  if (!draft) return false;
  if (draft.fingerprint !== SEO_PLANNING_TEST_FIXTURE_FINGERPRINT) return false;
  if (draft.recommendation !== SEO_PLANNING_TEST_FIXTURE_RECOMMENDATION) return false;
  return readSeoPlanningTestFixtureMarker(draft.payload) != null;
}

/**
 * Pure server render predicate for the temporary Super Admin create control.
 * Requires BOTH compile-time creationEnabled AND super_admin. Tests inject ON
 * without flipping the production constant.
 */
export function shouldRenderSeoPlanningTestFixtureCreateControl(args: {
  creationEnabled: boolean;
  role: string | null | undefined;
}): boolean {
  return args.creationEnabled === true && args.role === "super_admin";
}

/**
 * True when payload carries the reserved `testFixtureV1` key with any value,
 * including corrupted / partial marker objects. Does not scan free-text notes.
 */
export function hasRecognizableSeoPlanningTestFixtureMarkerEvidence(
  payload: unknown,
): boolean {
  const root = asRecord(payload);
  if (!root) return false;
  if (!Object.prototype.hasOwnProperty.call(root, SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY)) {
    return false;
  }
  const raw = root[SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY];
  // Key present (including null / non-object) ⇒ reserved fixture namespace.
  if (raw === undefined) return false;
  if (readSeoPlanningTestFixtureMarker(payload) != null) return true;
  const rec = asRecord(raw);
  if (!rec) return true;
  if (rec.kind === SEO_PLANNING_TEST_FIXTURE_KIND) return true;
  if (rec.purpose === SEO_PLANNING_TEST_FIXTURE_PURPOSE) return true;
  if (rec.version === SEO_PLANNING_TEST_FIXTURE_VERSION) return true;
  // Any object under the reserved key is fixture-marked territory.
  return true;
}

/**
 * Fail-closed generic-delete fence: reserved fingerprint OR recognizable
 * fixture marker evidence (valid, partial, or corrupt). Does NOT require both.
 * Ordinary drafts that only mention "TEST" in notes are not protected.
 */
export function isReservedOrFixtureMarkedSeoPlanningDraft(
  draft: Pick<SeoPlanningDraft, "fingerprint" | "payload"> | null | undefined,
): boolean {
  if (!draft) return false;
  if (String(draft.fingerprint || "").trim() === SEO_PLANNING_TEST_FIXTURE_FINGERPRINT) {
    return true;
  }
  return hasRecognizableSeoPlanningTestFixtureMarkerEvidence(draft.payload);
}

export function buildSeoPlanningTestFixturePayload(args: {
  adminId: string;
  now?: string;
}): Record<string, unknown> {
  const now = args.now || new Date().toISOString();
  const marker: SeoPlanningTestFixtureV1 = {
    kind: SEO_PLANNING_TEST_FIXTURE_KIND,
    purpose: SEO_PLANNING_TEST_FIXTURE_PURPOSE,
    version: SEO_PLANNING_TEST_FIXTURE_VERSION,
    createdAt: now,
    createdBy: sanitizeText(args.adminId, SEO_PLANNING_FIELD_CAPS.createdBy).trim() || "unknown",
  };
  // Honest TEST provenance only — no opportunity / sources / gsc / lineage.
  return {
    [SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY]: marker,
  };
}

/**
 * Build the single reserved fixture draft. Caller must enforce gate + uniqueness.
 * Never accepts caller-controlled id/fingerprint/recommendation/linkage.
 */
export function buildSeoPlanningEditorialEvidenceTestFixtureDraft(args: {
  adminId: string;
  now?: string;
  createIdFn?: (prefix?: string) => string;
}): SeoPlanningDraft {
  const now = args.now || new Date().toISOString();
  const id = (args.createIdFn || createId)("seoplan");
  return sanitizeSeoPlanningDraft({
    id,
    recommendation: SEO_PLANNING_TEST_FIXTURE_RECOMMENDATION,
    workflowStatus: SEO_PLANNING_DEFAULT_WORKFLOW,
    fingerprint: SEO_PLANNING_TEST_FIXTURE_FINGERPRINT,
    topic: SEO_PLANNING_TEST_FIXTURE_TOPIC,
    workingTitle: SEO_PLANNING_TEST_FIXTURE_WORKING_TITLE,
    proposedSlug: "",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "INFORMATIONAL",
    linkedPostId: null,
    createdBy: sanitizeText(args.adminId, SEO_PLANNING_FIELD_CAPS.createdBy).trim(),
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    payload: buildSeoPlanningTestFixturePayload({ adminId: args.adminId, now }),
  });
}

/**
 * Under ordinary Planning row locks: restore fixture identity + marker from the locked row.
 * Allows workspace humanNotes / editorialEvidenceV1 updates while freezing TEST identity.
 */
export function preserveLockedTestFixtureIdentity(
  locked: SeoPlanningDraft,
  incoming: SeoPlanningDraft,
): SeoPlanningDraft {
  if (!isSeoPlanningEditorialEvidenceTestFixture(locked)) {
    return incoming;
  }
  const lockedPayload =
    locked.payload && typeof locked.payload === "object" && !Array.isArray(locked.payload)
      ? ({ ...(locked.payload as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const incomingPayload =
    incoming.payload && typeof incoming.payload === "object" && !Array.isArray(incoming.payload)
      ? ({ ...(incoming.payload as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  // Preserve fixture marker from locked row (reject client strip/spoof).
  const lockedMarker = lockedPayload[SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY];
  if (lockedMarker !== undefined) {
    incomingPayload[SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY] = lockedMarker;
  } else {
    delete incomingPayload[SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY];
  }
  // Never allow forged Research opportunity on a fixture via ordinary save.
  delete incomingPayload.opportunity;
  delete incomingPayload.sources;
  delete incomingPayload.gsc;

  // Keep workspace notes / other non-identity keys from incoming when present.
  if (Object.prototype.hasOwnProperty.call(incomingPayload, "workspace")) {
    // ok — human notes may update
  } else if (Object.prototype.hasOwnProperty.call(lockedPayload, "workspace")) {
    incomingPayload.workspace = lockedPayload.workspace;
  }

  return sanitizeSeoPlanningDraft({
    ...incoming,
    id: locked.id,
    recommendation: SEO_PLANNING_TEST_FIXTURE_RECOMMENDATION,
    fingerprint: SEO_PLANNING_TEST_FIXTURE_FINGERPRINT,
    topic: SEO_PLANNING_TEST_FIXTURE_TOPIC,
    workingTitle: SEO_PLANNING_TEST_FIXTURE_WORKING_TITLE,
    proposedSlug: "",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    linkedPostId: null,
    createdBy: locked.createdBy,
    createdAt: locked.createdAt,
    workflowStatus: "PLANNING",
    payload: incomingPayload,
    archivedAt: locked.archivedAt ?? null,
  });
}

/**
 * Evidence merge path: keep fixture marker while allowing editorialEvidenceV1 changes.
 */
export function preserveTestFixtureMarkerInEvidencePayload(
  lockedPayload: unknown,
  nextPayload: Record<string, unknown>,
): Record<string, unknown> {
  const locked = asRecord(lockedPayload) || {};
  const out = { ...nextPayload };
  if (Object.prototype.hasOwnProperty.call(locked, SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY)) {
    out[SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY] = locked[SEO_PLANNING_TEST_FIXTURE_PAYLOAD_KEY];
  }
  delete out.opportunity;
  delete out.sources;
  delete out.gsc;
  return out;
}

export type CreateTestFixtureResult =
  | { ok: true; draft: SeoPlanningDraft; created: true }
  | {
      ok: false;
      error: string;
      code?:
        | "disabled"
        | "exists"
        | "oneshot_consumed"
        | "rejected"
        | "unauthorized"
        | "confirm_mismatch"
        | "access_denied";
    };

/**
 * Catalog contract for atomic fixture create (gate + oneshot + UNIQUE insert).
 * Production MySQL implements this under one transaction; JSON under Planning write lock.
 */
export type CreateTestFixtureCatalog = {
  createSeoPlanningEditorialEvidenceTestFixtureAtomic(args: {
    adminId: string;
    now?: string;
    createIdFn?: (prefix?: string) => string;
    /** Offline tests only — production actions never pass true. */
    testOnlyForceEnabled?: boolean;
  }): Promise<CreateTestFixtureResult>;
  isSeoPlanningEditorialEvidenceTestFixtureOneshotConsumed(): Promise<boolean>;
};

/**
 * Orchestration entry — delegates durable oneshot + insert to the catalog adapter.
 * Production server action never passes testOnlyForceEnabled.
 */
export async function createSeoPlanningEditorialEvidenceTestFixture(args: {
  adminId: string;
  catalog: CreateTestFixtureCatalog;
  now?: string;
  createIdFn?: (prefix?: string) => string;
  /** Offline tests only. */
  testOnlyForceEnabled?: boolean;
}): Promise<CreateTestFixtureResult> {
  const gate = evaluateTestFixtureCreationGate({
    testOnlyForceEnabled: args.testOnlyForceEnabled,
  });
  if (!gate.ok) {
    return { ok: false, error: gate.error, code: "disabled" };
  }
  return args.catalog.createSeoPlanningEditorialEvidenceTestFixtureAtomic({
    adminId: args.adminId,
    now: args.now,
    createIdFn: args.createIdFn,
    testOnlyForceEnabled: args.testOnlyForceEnabled,
  });
}

export type FixturePermanentDeleteResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code?:
        | "not_found"
        | "not_fixture"
        | "not_archived"
        | "confirm_mismatch"
        | "linked"
        | "rejected";
    };

/**
 * Catalog contract for lock-scoped fixture permanent delete.
 */
export type DeleteTestFixtureCatalog = {
  deleteSeoPlanningEditorialEvidenceTestFixturePermanentlyAtomic(args: {
    id: string;
    confirmation: string;
  }): Promise<FixturePermanentDeleteResult>;
};

export function parseSeoPlanningTestFixtureOneshot(
  raw: unknown,
): SeoPlanningTestFixtureOneshotV1 | null {
  const row = asRecord(raw);
  if (!row) return null;
  if (row.kind !== "TEST_FIXTURE_ONESHOT") return null;
  if (row.purpose !== SEO_PLANNING_TEST_FIXTURE_PURPOSE) return null;
  if (row.version !== 1) return null;
  const consumedAt = sanitizeText(row.consumedAt, 40).trim();
  const consumedBy = sanitizeText(row.consumedBy, SEO_PLANNING_FIELD_CAPS.createdBy).trim();
  const planningId = sanitizeText(row.planningId, 80).trim();
  if (!consumedAt || !consumedBy || !planningId) return null;
  return {
    kind: "TEST_FIXTURE_ONESHOT",
    purpose: SEO_PLANNING_TEST_FIXTURE_PURPOSE,
    version: 1,
    consumedAt,
    consumedBy,
    planningId,
  };
}

export function isSeoPlanningTestFixtureOneshotConsumed(raw: unknown): boolean {
  return parseSeoPlanningTestFixtureOneshot(raw) != null;
}

export function buildSeoPlanningTestFixtureOneshot(args: {
  adminId: string;
  planningId: string;
  now?: string;
}): SeoPlanningTestFixtureOneshotV1 {
  return {
    kind: "TEST_FIXTURE_ONESHOT",
    purpose: SEO_PLANNING_TEST_FIXTURE_PURPOSE,
    version: 1,
    consumedAt: args.now || new Date().toISOString(),
    consumedBy: sanitizeText(args.adminId, SEO_PLANNING_FIELD_CAPS.createdBy).trim() || "unknown",
    planningId: sanitizeText(args.planningId, 80).trim(),
  };
}

export function confirmSeoPlanningTestFixtureCreate(confirmation: unknown): boolean {
  return String(confirmation || "").trim() === SEO_PLANNING_TEST_FIXTURE_CREATE_CONFIRM;
}

/**
 * Strict fixture-only permanent-delete policy (fail closed).
 * Intended for use under the authoritative row lock after re-read.
 * Does not unlink lineage or cascade. Does not delete non-fixtures.
 */
export function evaluateSeoPlanningTestFixturePermanentDelete(args: {
  draft: SeoPlanningDraft | null;
  confirmation: string;
  /** Authoritative lineage probe — unknown fails closed. */
  lineageStatus: FixtureLineageStatus;
}): FixturePermanentDeleteResult {
  if (!args.draft) {
    return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE, code: "not_found" };
  }
  if (!isSeoPlanningEditorialEvidenceTestFixture(args.draft)) {
    return { ok: false, error: SEO_PLANNING_TEST_FIXTURE_NOT_FIXTURE_MESSAGE, code: "not_fixture" };
  }
  if (args.draft.fingerprint !== SEO_PLANNING_TEST_FIXTURE_FINGERPRINT) {
    return {
      ok: false,
      error: SEO_PLANNING_TEST_FIXTURE_IDENTITY_MISMATCH_MESSAGE,
      code: "not_fixture",
    };
  }
  if (args.draft.recommendation !== SEO_PLANNING_TEST_FIXTURE_RECOMMENDATION) {
    return {
      ok: false,
      error: SEO_PLANNING_TEST_FIXTURE_IDENTITY_MISMATCH_MESSAGE,
      code: "not_fixture",
    };
  }
  const marker = readSeoPlanningTestFixtureMarker(args.draft.payload);
  if (!marker || marker.purpose !== SEO_PLANNING_TEST_FIXTURE_PURPOSE) {
    return {
      ok: false,
      error: SEO_PLANNING_TEST_FIXTURE_IDENTITY_MISMATCH_MESSAGE,
      code: "not_fixture",
    };
  }
  if (
    args.draft.linkedPostId ||
    args.draft.targetPostId ||
    String(args.draft.matchedPublicUrl || "").trim() ||
    String(args.draft.restorePath || "").trim() ||
    String(args.draft.proposedSlug || "").trim()
  ) {
    return { ok: false, error: SEO_PLANNING_TEST_FIXTURE_LINKED_MESSAGE, code: "linked" };
  }
  if (args.lineageStatus === "linked") {
    return { ok: false, error: SEO_PLANNING_TEST_FIXTURE_LINKED_MESSAGE, code: "linked" };
  }
  if (args.lineageStatus === "unknown") {
    return {
      ok: false,
      error: SEO_PLANNING_TEST_FIXTURE_LINEAGE_UNKNOWN_MESSAGE,
      code: "rejected",
    };
  }
  if (!isSeoPlanningDraftArchived(args.draft)) {
    return { ok: false, error: SEO_PLANNING_NOT_ARCHIVED_MESSAGE, code: "not_archived" };
  }
  const confirmed = confirmSeoPlanningPermanentDelete(args.draft, args.confirmation);
  if (!confirmed.ok) {
    return {
      ok: false,
      error: SEO_PLANNING_DELETE_CONFIRM_MISMATCH_MESSAGE,
      code: "confirm_mismatch",
    };
  }
  return { ok: true };
}
