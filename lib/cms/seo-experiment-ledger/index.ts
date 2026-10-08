/**
 * Experiment Ledger V1 — public pure exports.
 * Server-only MySQL persistence: import `@/lib/cms/seo-experiment-ledger/persist-mysql` directly.
 * Do not barrel-export persist-mysql (avoids client/server-only leakage).
 */

export {
  SEO_LEDGER_CAPS,
  SEO_LEDGER_DURABILITY_STATUSES,
  SEO_LEDGER_MAX_OPPORTUNITIES,
  SEO_LEDGER_PIPELINE_RUN_STATUSES,
  SEO_LEDGER_RUN_SOURCES,
  SEO_LEDGER_SELECTION_SOURCES,
  type InsertResearchRunWithDecisionsResult,
  type SeoLedgerDurabilityStatus,
  type SeoLedgerMapInput,
  type SeoLedgerMapResult,
  type SeoLedgerPersistPlan,
  type SeoLedgerPipelineRunStatus,
  type SeoLedgerResearchSnapshot,
  type SeoLedgerRunSource,
  type SeoLedgerSelectionSource,
  type SeoOpportunityDecisionRow,
  type SeoResearchRunRow,
} from "@/lib/cms/seo-experiment-ledger/types";

export { mapResearchSnapshotToLedgerPlan } from "@/lib/cms/seo-experiment-ledger/map";

export {
  attachLedgerDurabilityToResearchResult,
  bridgeResultToLedgerSnapshot,
  durabilityMetaFromPersistResult,
  runResearchBridgeThenPersistLedger,
  type ResearchLedgerDurabilityMeta,
  type ResearchWithLedgerDurability,
} from "@/lib/cms/seo-experiment-ledger/attach-research-durability";

/** L3 read helpers (pure). MySQL reader: import `@/lib/cms/seo-experiment-ledger/read-mysql` directly. */
export {
  clampLedgerListPageSize,
  decodeLedgerListCursor,
  encodeLedgerListCursor,
  formatLedgerMysqlUtcLabel,
  isValidLedgerRunId,
  SEO_LEDGER_DECISION_FETCH_LIMIT,
  SEO_LEDGER_LIST_DEFAULT_PAGE_SIZE,
  SEO_LEDGER_LIST_MAX_PAGE_SIZE,
  toLedgerMysqlDateTime,
  type SeoLedgerListCursor,
} from "@/lib/cms/seo-experiment-ledger/read-cursor";
