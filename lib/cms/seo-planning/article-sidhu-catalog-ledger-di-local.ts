/**
 * A2-12 — LOCAL-ONLY read-only DI adapters for Planning/Blog catalog and Ledger detail.
 *
 * Supplies injected exact-lookup functions shaped for A2-7/A2-10 Sidhu preflight
 * without importing or initializing:
 *   - runtime `cms` repository
 *   - ambient MySQL pool helpers
 *   - Ledger MySQL read modules (server-only + pool)
 *
 * A future Server Action may inject production-backed implementations of these
 * function types. This module never authorizes Apply and never mutates CMS.
 */

import { FIRST_PARTY_VERIFY_CAPS } from "@/lib/cms/seo-autonomy/first-party-site-fact-verify";
import type { FirstPartyVerifyCatalog } from "@/lib/cms/seo-autonomy/first-party-site-fact-verify";
import type {
  SidhuLedgerRunDetailReader,
  SidhuLedgerRunDetailResult,
} from "@/lib/cms/seo-planning/article-sidhu-authoritative-readers-local";
import { SIDHU_AUTHORITATIVE_READ_BUDGET } from "@/lib/cms/seo-planning/article-sidhu-authoritative-readers-local";
import type { SidhuAuthoritativePlanningCatalog } from "@/lib/cms/seo-planning/article-sidhu-authoritative-sources-local";
import type { BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export const SEO_AI_ARTICLE_SIDHU_CATALOG_LEDGER_DI_SPEC =
  "a2-12-sidhu-catalog-ledger-di-local-v1" as const;

/**
 * Exact Planning + Blog identity readers.
 * Intentionally narrower than CatalogRepository — no list/save/delete/merge methods.
 */
export type SidhuInjectedPlanningBlogExactReaders = {
  getSeoPlanningDraftById(id: string): Promise<SeoPlanningDraft | null>;
  getPostById(id: string): Promise<BlogPost | null>;
};

/** Read-only Blog slug catalog for the reused A2-10 first-party verifier. */
export type SidhuInjectedFirstPartyBlogReaders = {
  getSeoPlanningDraftById(id: string): Promise<SeoPlanningDraft | null>;
  getPostBySlug(slug: string): Promise<BlogPost | null>;
};

/**
 * Injected Ledger run-detail function.
 * Shape mirrors `getSeoResearchRunDetail` success/failure unions without
 * importing the MySQL reader module.
 */
export type SidhuInjectedLedgerRunDetailFn = (args: {
  runId: string;
}) => Promise<SidhuLedgerRunDetailResult>;

/**
 * Documented read budgets for live DI composition.
 * First-party slug lookups are bounded by the existing verifier entry cap
 * (sequential per PROPOSED_SITE_FACT entry; no N+1 invented here).
 */
export const SIDHU_CATALOG_LEDGER_DI_READ_BUDGET = {
  maxPlanningExactLookups: SIDHU_AUTHORITATIVE_READ_BUDGET.maxPlanningExactLookups,
  maxLinkedBlogLookups: SIDHU_AUTHORITATIVE_READ_BUDGET.maxBlogIdentityLookups,
  maxFirstPartySlugLookupsPerVerify: FIRST_PARTY_VERIFY_CAPS.entryCount,
  maxLedgerRunDetailLookups: SIDHU_AUTHORITATIVE_READ_BUDGET.maxLedgerRunDetailLookups,
  /** Adapters never expose or call listPosts / listSeoPlanningDrafts / list runs. */
  unboundedListingForbidden: true as const,
} as const;

const SANITIZED_LEDGER_FAILURE = "Ledger detail reader failed closed." as const;

function sanitizeLedgerErrorMessage(message: unknown): string {
  const raw = typeof message === "string" ? message.trim() : "";
  if (!raw) return SANITIZED_LEDGER_FAILURE;
  // Strip accidental SQL / credential leakage patterns from injected failures.
  if (/password|passwd|secret|token|mysql:|errno|sqlstate|econn|access denied/i.test(raw)) {
    return SANITIZED_LEDGER_FAILURE;
  }
  return raw.slice(0, 240);
}

function sanitizeLedgerDetailResult(
  result: SidhuLedgerRunDetailResult,
): SidhuLedgerRunDetailResult {
  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.errorCode,
      errorMessage: sanitizeLedgerErrorMessage(result.errorMessage),
    };
  }
  return result;
}

/**
 * Wrap injected Planning/Blog exact getters as A2-7 `SidhuAuthoritativePlanningCatalog`.
 * Does not expose mutable CatalogRepository methods.
 */
export function createSidhuAuthoritativePlanningCatalogFromInjected(
  readers: SidhuInjectedPlanningBlogExactReaders,
): SidhuAuthoritativePlanningCatalog {
  return {
    getSeoPlanningDraftById(id: string) {
      return readers.getSeoPlanningDraftById(id);
    },
    getPostById(id: string) {
      return readers.getPostById(id);
    },
  };
}

/**
 * Wrap injected Planning + slug Blog getters as A2-10 `FirstPartyVerifyCatalog`.
 */
export function createFirstPartyVerifyCatalogFromInjected(
  readers: SidhuInjectedFirstPartyBlogReaders,
): FirstPartyVerifyCatalog {
  return {
    getSeoPlanningDraftById(id: string) {
      return readers.getSeoPlanningDraftById(id);
    },
    getPostBySlug(slug: string) {
      return readers.getPostBySlug(slug);
    },
  };
}

export type SidhuLedgerRunDetailReaderFromInjected = SidhuLedgerRunDetailReader & {
  /** Bounded call counter for offline budgets (not a trust signal). */
  readonly callCount: number;
};

/**
 * Wrap an injected Ledger detail function as A2-8/A2-10 `SidhuLedgerRunDetailReader`.
 * Failures are sanitized; thrown errors become fail-closed `query_error`.
 */
export function createSidhuLedgerRunDetailReaderFromInjected(
  getDetail: SidhuInjectedLedgerRunDetailFn,
): SidhuLedgerRunDetailReaderFromInjected {
  const state = { callCount: 0 };
  return {
    get callCount() {
      return state.callCount;
    },
    async getSeoResearchRunDetail(args) {
      state.callCount += 1;
      const runId = typeof args.runId === "string" ? args.runId.trim() : "";
      if (!runId) {
        return {
          ok: false,
          errorCode: "invalid_id",
          errorMessage: "Research run id is required.",
        };
      }
      try {
        const result = await getDetail({ runId });
        return sanitizeLedgerDetailResult(result);
      } catch {
        return {
          ok: false,
          errorCode: "query_error",
          errorMessage: SANITIZED_LEDGER_FAILURE,
        };
      }
    },
  };
}

/**
 * Structural guard: catalog adapter objects must not carry mutation method names.
 * Pure — does not invoke any method.
 */
export function sidhuCatalogAdapterExposesOnlyExactReads(
  catalog: SidhuAuthoritativePlanningCatalog,
): boolean {
  const keys = Object.keys(catalog as object).sort();
  return (
    keys.length === 2 &&
    keys[0] === "getPostById" &&
    keys[1] === "getSeoPlanningDraftById"
  );
}
