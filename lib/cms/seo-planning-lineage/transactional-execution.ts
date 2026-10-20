/**
 * L4B-6 — Pure transactional Proceed→Ledger linking & protected permanent delete.
 *
 * Server-only execution surface with no production write-activation gate.
 * Live CMS actions must not import this module; production entrypoints live in
 * transactional-integration.ts and remain closed by default.
 * Disposable MySQL tests reach this logic only via tools/seo-planning-lineage-test-harness.
 */

import "server-only";

import type { PoolConnection } from "mysql2/promise";
import { createId } from "@/lib/cms/ids";
import { toMysqlDateTime } from "@/lib/cms/mysql-migrate";
import {
  isSeoPlanningActionableRecommendation,
  SEO_PLANNING_DEFAULT_WORKFLOW,
} from "@/lib/cms/seo-planning/constants";
import {
  SEO_PLANNING_ARCHIVED_PROCEED_MESSAGE,
  isSeoPlanningDraftArchived,
} from "@/lib/cms/seo-planning/lifecycle";
import {
  validateProceedTarget,
  type SeoPlanningCatalog,
} from "@/lib/cms/seo-planning/proceed";
import {
  buildPlanningPayload,
  parseProceedOpportunityInput,
  sanitizeProceedGscMeta,
  sanitizeProceedSources,
} from "@/lib/cms/seo-planning/sanitize";
import {
  evaluatePlanningPermanentDeletePolicy,
  SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
} from "@/lib/cms/seo-planning-lineage/delete-policy";
import {
  createMysqlPlanningLineageStoreOnConnection,
  deleteSeoPlanningDraftOnConnection,
  getSeoPlanningDraftByFingerprintOnConnection,
  getSeoPlanningDraftByIdForUpdateOnConnection,
  insertSeoPlanningDraftOnConnection,
  isMysqlForeignKeyParentDeleteBlocked,
} from "@/lib/cms/seo-planning-lineage/mysql-store";
import {
  buildProceedOpportunity,
  editorialOverridesAuthoritative,
  parseRequiredSearchIntent,
  resolveAuthoritativeDecision,
  type ResearchProceedEditorialSupplemental,
} from "@/lib/cms/seo-planning-lineage/proceed-integration";
import { resolvePlanningDecisionLineage } from "@/lib/cms/seo-planning-lineage/read";
import {
  attemptEstablishPlanningDecisionLink,
  PlanningLineageConflictError,
} from "@/lib/cms/seo-planning-lineage/repository";
import {
  isPreparedResearchProceedSelection,
  prepareTrustedResearchProceedSelection,
  summarizePreparedResearchProceedSelection,
  type DisplayedResearchOpportunitySnapshot,
  type ResearchProceedLedgerReader,
} from "@/lib/cms/seo-planning-lineage/research-proceed-selection";
import { createFencedPlanningWriteTransactionFn } from "@/lib/cms/seo-planning-lineage/planning-write-fence-auth";
import { L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE } from "@/lib/cms/seo-planning-lineage/schema-ddl";
import {
  isTrustedPlanningDecisionSelection,
  tryMintTrustedPlanningDecisionSelection,
} from "@/lib/cms/seo-planning-lineage/selection";
import { SEO_PLANNING_LINEAGE_CAPS } from "@/lib/cms/seo-planning-lineage/types";
import { mysqlDuplicateError } from "@/lib/cms/slug-change";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { sanitizeText } from "@/lib/cms/validation";
import { withTransaction } from "@/lib/db/pool";

/**
 * Optional local fence-bridge injection for disposable MySQL / tools harness.
 * Production facade (transactional-integration) never supplies this.
 * When set, Planning DML runs under session-marker authorization on one connection.
 */
export type PlanningWriteFenceExecutionOptions = {
  token: string;
};

export const L4B6_TRANSACTIONAL_EXECUTION_VERSION = "l4b6-v1" as const;

export type TransactionalProceedLinkageStatus =
  | "LINKED"
  | "IDEMPOTENT_LINKED"
  | "EXISTING_DRAFT_UNLINKED"
  | "DRAFT_CONFLICT"
  | "PROCEED_FAILED"
  | "SELECTION_UNAVAILABLE"
  | "ROLLED_BACK";

export type TransactionalProceedAndLinkResult =
  | {
      ok: true;
      planningDraftId: string;
      decisionId: string;
      researchRunId: string;
      created: boolean;
      linkageStatus: "LINKED" | "IDEMPOTENT_LINKED" | "EXISTING_DRAFT_UNLINKED";
      linkId: string | null;
      selectionSummary: ReturnType<typeof summarizePreparedResearchProceedSelection>;
    }
  | {
      ok: false;
      linkageStatus: TransactionalProceedLinkageStatus;
      errorCode: string;
      errorMessage: string;
      planningDraftId: string | null;
      created: false;
    };

export type TransactionalProtectedDeleteResult =
  | { ok: true; deleted: true; planningDraftId: string }
  | {
      ok: false;
      deleted: false;
      errorCode: string;
      errorMessage: string;
      planningDraftId: string | null;
    };

function trimField(value: unknown, max: number): string {
  return sanitizeText(value, max).replace(/\s+/g, " ").trim();
}

function failProceed(
  linkageStatus: TransactionalProceedLinkageStatus,
  errorCode: string,
  errorMessage: string,
): TransactionalProceedAndLinkResult {
  return {
    ok: false,
    linkageStatus,
    errorCode,
    errorMessage: trimField(errorMessage, 200),
    planningDraftId: null,
    created: false,
  };
}

/**
 * Atomic trusted Proceed + Ledger lineage link on one MySQL connection/transaction.
 * Returns LINKED only after successful commit of both Planning insert and link insert.
 *
 * No caller-provided activation capability. Production must not import this module;
 * tools harness wraps it for disposable MySQL acceptance only.
 */
export async function runTransactionalTrustedProceedAndLink(args: {
  actor: { authorized: boolean; adminId: string };
  ledgerRunId: unknown;
  opportunityIndex?: unknown;
  decisionId?: unknown;
  displayedOpportunity?: DisplayedResearchOpportunitySnapshot | null;
  editorialSupplemental: ResearchProceedEditorialSupplemental;
  ledgerReader: ResearchProceedLedgerReader;
  /** Read-only catalog for Proceed target validation (posts/pages/…). */
  catalog: SeoPlanningCatalog;
  now?: string;
  createIdFn?: (prefix?: string) => string;
  createLinkIdFn?: () => string;
  withTransactionFn?: typeof withTransaction;
  /**
   * When set (tools/disposable only), use fenced session-auth transaction helper.
   * Ignored when withTransactionFn is also provided (caller owns TX boundary).
   */
  planningWriteFence?: PlanningWriteFenceExecutionOptions;
  /** Test hook: throw after Planning insert, before link — must roll back draft. */
  failAfterPlanningInsert?: boolean;
  /** Test hook: throw inside link insert path. */
  failLinkInsert?: boolean;
}): Promise<TransactionalProceedAndLinkResult> {
  // Documented: ensure path remains disconnected in this worktree.
  void L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE;

  const adminId = trimField(args.actor?.adminId, SEO_PLANNING_LINEAGE_CAPS.adminId);
  if (!args.actor?.authorized || !adminId) {
    return failProceed("SELECTION_UNAVAILABLE", "UNAUTHORIZED", "Access denied.");
  }

  if (!args.editorialSupplemental || typeof args.editorialSupplemental !== "object") {
    return failProceed(
      "SELECTION_UNAVAILABLE",
      "MISSING_SUPPLEMENTAL",
      "Editorial supplemental input is required for Planning Proceed.",
    );
  }

  const prepared = await prepareTrustedResearchProceedSelection({
    actor: args.actor,
    ledgerRunId: args.ledgerRunId,
    opportunityIndex: args.opportunityIndex,
    decisionId: args.decisionId,
    displayedOpportunity: args.displayedOpportunity,
    ledgerReader: args.ledgerReader,
  });
  if (!prepared.ok) {
    return failProceed(
      "SELECTION_UNAVAILABLE",
      "SELECTION_UNAVAILABLE",
      prepared.errorMessage || "Research selection is unavailable.",
    );
  }

  const preparation = prepared.preparation;
  if (!isPreparedResearchProceedSelection(preparation)) {
    return failProceed(
      "SELECTION_UNAVAILABLE",
      "SELECTION_UNAVAILABLE",
      "Trusted Research selection binding is not available.",
    );
  }

  if (editorialOverridesAuthoritative(args.editorialSupplemental, preparation)) {
    return failProceed(
      "SELECTION_UNAVAILABLE",
      "IDENTITY_MISMATCH",
      "Editorial supplemental fields must not override Ledger-authoritative identity.",
    );
  }

  if (!isSeoPlanningActionableRecommendation(preparation.researchRecommendation)) {
    return failProceed(
      "SELECTION_UNAVAILABLE",
      "UNSUPPORTED_RECOMMENDATION",
      "Unsupported recommendation for Planning Proceed.",
    );
  }

  const searchIntentParsed = parseRequiredSearchIntent(args.editorialSupplemental.searchIntent);
  if (!searchIntentParsed.ok) {
    return failProceed("SELECTION_UNAVAILABLE", "MISSING_SUPPLEMENTAL", searchIntentParsed.error);
  }

  const resolved = await resolveAuthoritativeDecision({
    ledgerReader: args.ledgerReader,
    researchRunId: preparation.researchRunId,
    decisionId: preparation.decisionId,
    opportunityIndex: preparation.opportunityIndex,
  });
  if (!resolved.ok) {
    return failProceed("SELECTION_UNAVAILABLE", "DECISION_UNAVAILABLE", resolved.errorMessage);
  }

  const opportunity = buildProceedOpportunity({
    preparation,
    decision: resolved.decision,
    searchIntent: searchIntentParsed.value,
    editorial: args.editorialSupplemental,
  });

  const parsed = parseProceedOpportunityInput(opportunity);
  if (!parsed.ok) {
    return failProceed("PROCEED_FAILED", "PROCEED_FAILED", parsed.error);
  }

  const [posts, pages, categories, redirects] = await Promise.all([
    args.catalog.listPosts(),
    args.catalog.listPages(),
    args.catalog.listCategories(),
    args.catalog.listActiveRedirects(),
  ]);

  const validated = validateProceedTarget({
    opportunity: parsed.value,
    posts,
    pages,
    categories,
    redirects,
  });
  if (!validated.ok) {
    return failProceed("PROCEED_FAILED", "PROCEED_FAILED", validated.error);
  }

  const now = args.now || new Date().toISOString();
  const tx =
    args.withTransactionFn ??
    (args.planningWriteFence
      ? createFencedPlanningWriteTransactionFn({
          token: args.planningWriteFence.token,
          trustedOperation: "transactional_proceed_link",
        })
      : withTransaction);
  const summary = summarizePreparedResearchProceedSelection(preparation);

  try {
    return await tx(async (conn: PoolConnection) => {
      const store = createMysqlPlanningLineageStoreOnConnection(conn);
      const schemaOk = await store.isLineageSchemaAvailable();
      if (!schemaOk) {
        throw Object.assign(new Error("SCHEMA_UNAVAILABLE"), {
          l4b6Code: "SCHEMA_UNAVAILABLE",
          l4b6Message: "Planning decision lineage schema is unavailable.",
        });
      }

      const existing = await getSeoPlanningDraftByFingerprintOnConnection(
        conn,
        validated.value.fingerprint,
      );

      if (existing) {
        if (isSeoPlanningDraftArchived(existing)) {
          throw Object.assign(new Error("ARCHIVED"), {
            l4b6Code: "ARCHIVED",
            l4b6Message: SEO_PLANNING_ARCHIVED_PROCEED_MESSAGE,
          });
        }
        const existingLink = await store.getLinkByPlanningDraftId(existing.id);
        if (existingLink) {
          if (existingLink.decisionId === preparation.decisionId) {
            return {
              ok: true as const,
              planningDraftId: existing.id,
              decisionId: preparation.decisionId,
              researchRunId: preparation.researchRunId,
              created: false,
              linkageStatus: "IDEMPOTENT_LINKED" as const,
              linkId: existingLink.id,
              selectionSummary: summary,
            };
          }
          throw Object.assign(new Error("DRAFT_CONFLICT"), {
            l4b6Code: "DRAFT_CONFLICT",
            l4b6Message: "An existing Planning draft is linked to a different Ledger decision.",
          });
        }
        // Existing unlinked draft: open without claiming new originating lineage.
        return {
          ok: true as const,
          planningDraftId: existing.id,
          decisionId: preparation.decisionId,
          researchRunId: preparation.researchRunId,
          created: false,
          linkageStatus: "EXISTING_DRAFT_UNLINKED" as const,
          linkId: null,
          selectionSummary: summary,
        };
      }

      const draftId = (args.createIdFn || createId)("seoplan");
      const sources = sanitizeProceedSources(args.editorialSupplemental.sources);
      const gsc = sanitizeProceedGscMeta(args.editorialSupplemental.gscMeta);
      const draft: SeoPlanningDraft = {
        id: draftId,
        recommendation: validated.value.recommendation,
        workflowStatus: SEO_PLANNING_DEFAULT_WORKFLOW,
        fingerprint: validated.value.fingerprint,
        topic: parsed.value.topic,
        workingTitle: parsed.value.workingTitle,
        proposedSlug: validated.value.proposedSlug,
        targetPostId: validated.value.targetPostId,
        matchedPublicUrl: validated.value.matchedPublicUrl,
        restorePath: validated.value.restorePath,
        searchIntent: parsed.value.searchIntent,
        linkedPostId: null,
        createdBy: adminId,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        payload: buildPlanningPayload({
          opportunity: {
            ...parsed.value,
            restorePath: validated.value.restorePath || parsed.value.restorePath,
            matchedPublicUrl: validated.value.matchedPublicUrl || parsed.value.matchedPublicUrl,
          },
          sources,
          gsc,
        }),
      };

      try {
        await insertSeoPlanningDraftOnConnection(conn, draft);
      } catch (error) {
        if (mysqlDuplicateError(error) || (error instanceof Error && /fingerprint/i.test(error.message))) {
          const raced = await getSeoPlanningDraftByFingerprintOnConnection(
            conn,
            validated.value.fingerprint,
          );
          if (raced) {
            if (isSeoPlanningDraftArchived(raced)) {
              throw Object.assign(new Error("ARCHIVED"), {
                l4b6Code: "ARCHIVED",
                l4b6Message: SEO_PLANNING_ARCHIVED_PROCEED_MESSAGE,
              });
            }
            throw Object.assign(new Error("DRAFT_CONFLICT"), {
              l4b6Code: "EXISTING_DRAFT_UNLINKED",
              l4b6Message: "An existing Planning draft was opened without establishing lineage.",
              l4b6DraftId: raced.id,
            });
          }
        }
        throw Object.assign(new Error("PLANNING_SAVE_FAILED"), {
          l4b6Code: "PROCEED_FAILED",
          l4b6Message: "Could not create the planning draft. Please try again.",
        });
      }

      if (args.failAfterPlanningInsert) {
        throw Object.assign(new Error("FORCED_PLANNING_AFTER_FAIL"), {
          l4b6Code: "ROLLED_BACK",
          l4b6Message: "Planning create was rolled back.",
        });
      }

      const minted = tryMintTrustedPlanningDecisionSelection({
        planningDraftId: draftId,
        decisionId: preparation.decisionId,
        researchRunId: preparation.researchRunId,
        actorAdminId: adminId,
        serverResearchBinding: preparation,
      });
      if (!minted.ok || !isTrustedPlanningDecisionSelection(minted.selection)) {
        throw Object.assign(new Error("MINT_FAILED"), {
          l4b6Code: "SELECTION_UNAVAILABLE",
          l4b6Message: "Trusted Research selection binding is not available.",
        });
      }

      if (args.failLinkInsert) {
        throw Object.assign(new Error("FORCED_LINK_FAIL"), {
          l4b6Code: "ROLLED_BACK",
          l4b6Message: "Lineage link was rolled back.",
        });
      }

      const established = await attemptEstablishPlanningDecisionLink({
        planningDraftId: draftId,
        decisionId: preparation.decisionId,
        actorAdminId: adminId,
        store,
        trustedSelection: minted.selection,
        createLinkId: args.createLinkIdFn ?? (() => createId("seoplink")),
        nowIso: () => now,
      });

      if (!established.ok) {
        throw Object.assign(new Error("LINK_FAILED"), {
          l4b6Code: established.errorCode,
          l4b6Message: established.errorMessage,
        });
      }

      return {
        ok: true as const,
        planningDraftId: draftId,
        decisionId: preparation.decisionId,
        researchRunId: preparation.researchRunId,
        created: true,
        linkageStatus:
          established.status === "IDEMPOTENT"
            ? ("IDEMPOTENT_LINKED" as const)
            : ("LINKED" as const),
        linkId: established.link.id,
        selectionSummary: summary,
      };
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "l4b6Code" in error
        ? String((error as { l4b6Code?: unknown }).l4b6Code || "PROCEED_FAILED")
        : "PROCEED_FAILED";
    const message =
      error && typeof error === "object" && "l4b6Message" in error
        ? String((error as { l4b6Message?: unknown }).l4b6Message || "")
        : "";
    const draftId =
      error && typeof error === "object" && "l4b6DraftId" in error
        ? String((error as { l4b6DraftId?: unknown }).l4b6DraftId || "")
        : "";

    if (code === "EXISTING_DRAFT_UNLINKED" && draftId) {
      return {
        ok: true,
        planningDraftId: draftId,
        decisionId: preparation.decisionId,
        researchRunId: preparation.researchRunId,
        created: false,
        linkageStatus: "EXISTING_DRAFT_UNLINKED",
        linkId: null,
        selectionSummary: summary,
      };
    }

    const linkageStatus: TransactionalProceedLinkageStatus =
      code === "ROLLED_BACK" || code === "FORCED_LINK_FAIL" || code === "FORCED_PLANNING_AFTER_FAIL"
        ? "ROLLED_BACK"
        : code === "DRAFT_CONFLICT"
          ? "DRAFT_CONFLICT"
          : code === "ARCHIVED" || code === "PROCEED_FAILED"
            ? "PROCEED_FAILED"
            : code === "SCHEMA_UNAVAILABLE" || code === "SELECTION_UNAVAILABLE"
              ? "SELECTION_UNAVAILABLE"
              : "PROCEED_FAILED";

    return failProceed(
      linkageStatus,
      code === "FORCED_LINK_FAIL" || code === "FORCED_PLANNING_AFTER_FAIL" ? "ROLLED_BACK" : code,
      message || "Could not complete transactional Proceed lineage.",
    );
  }
}

/**
 * Protected permanent delete under one MySQL transaction with FOR UPDATE + L4B-5 policy.
 * FK RESTRICT remains the final race guard.
 *
 * No caller-provided activation capability. Production must not import this module.
 */
export async function runTransactionalProtectedPermanentDelete(args: {
  actor: { authorized: boolean; adminId: string };
  planningDraftId: unknown;
  confirmation: unknown;
  withTransactionFn?: typeof withTransaction;
  planningWriteFence?: PlanningWriteFenceExecutionOptions;
  lineageProtectionActive?: boolean;
}): Promise<TransactionalProtectedDeleteResult> {
  const adminId = trimField(args.actor?.adminId, SEO_PLANNING_LINEAGE_CAPS.adminId);
  if (!args.actor?.authorized || !adminId) {
    return {
      ok: false,
      deleted: false,
      errorCode: "UNAUTHORIZED",
      errorMessage: "Access denied.",
      planningDraftId: null,
    };
  }

  const planningDraftId = trimField(args.planningDraftId, SEO_PLANNING_LINEAGE_CAPS.id);
  if (!planningDraftId) {
    return {
      ok: false,
      deleted: false,
      errorCode: "INVALID_INPUT",
      errorMessage: "Planning draft id is required.",
      planningDraftId: null,
    };
  }

  const protectionActive = args.lineageProtectionActive !== false;
  const tx =
    args.withTransactionFn ??
    (args.planningWriteFence
      ? createFencedPlanningWriteTransactionFn({
          token: args.planningWriteFence.token,
          trustedOperation: "transactional_protected_delete",
        })
      : withTransaction);

  try {
    return await tx(async (conn: PoolConnection) => {
      const draft = await getSeoPlanningDraftByIdForUpdateOnConnection(conn, planningDraftId);
      const store = createMysqlPlanningLineageStoreOnConnection(conn);

      let lineage = null as Awaited<ReturnType<typeof resolvePlanningDecisionLineage>> | null;
      if (protectionActive) {
        lineage = await resolvePlanningDecisionLineage({
          planningDraftId,
          store,
        });
      }

      const policy = evaluatePlanningPermanentDeletePolicy({
        draft,
        confirmation: args.confirmation,
        lineageProtectionActive: protectionActive,
        lineage,
      });

      if (!policy.ok || !policy.mayPermanentlyDelete) {
        throw Object.assign(new Error("POLICY_DENY"), {
          l4b6Code: !policy.ok ? policy.decision : "DENY_LINKED",
          l4b6Message: !policy.ok
            ? policy.errorMessage
            : SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
        });
      }

      try {
        await deleteSeoPlanningDraftOnConnection(conn, planningDraftId);
      } catch (error) {
        if (isMysqlForeignKeyParentDeleteBlocked(error)) {
          throw Object.assign(new Error("FK_BLOCKED"), {
            l4b6Code: "DENY_LINKED",
            l4b6Message: SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
          });
        }
        throw Object.assign(new Error("DELETE_FAILED"), {
          l4b6Code: "WRITE_ERROR",
          l4b6Message: "Could not permanently delete the planning draft. Please try again.",
        });
      }

      return {
        ok: true as const,
        deleted: true as const,
        planningDraftId,
      };
    });
  } catch (error) {
    if (error instanceof PlanningLineageConflictError) {
      return {
        ok: false,
        deleted: false,
        errorCode: "DENY_LINKED",
        errorMessage: SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
        planningDraftId,
      };
    }
    const code =
      error && typeof error === "object" && "l4b6Code" in error
        ? String((error as { l4b6Code?: unknown }).l4b6Code || "WRITE_ERROR")
        : "WRITE_ERROR";
    const message =
      error && typeof error === "object" && "l4b6Message" in error
        ? String((error as { l4b6Message?: unknown }).l4b6Message || "")
        : "Could not permanently delete the planning draft. Please try again.";
    return {
      ok: false,
      deleted: false,
      errorCode: code,
      errorMessage: trimField(message, 200),
      planningDraftId,
    };
  }
}

/** Disposable-test helper — archive a draft on a connection (lifecycle allowed when linked). */
export async function archiveSeoPlanningDraftOnConnectionForTests(
  conn: PoolConnection,
  id: string,
  nowIso = new Date().toISOString(),
): Promise<void> {
  await conn.execute(
    `UPDATE seo_planning_drafts SET archived_at = ?, updated_at = ? WHERE id = ?`,
    [toMysqlDateTime(nowIso), toMysqlDateTime(nowIso), id],
  );
}
