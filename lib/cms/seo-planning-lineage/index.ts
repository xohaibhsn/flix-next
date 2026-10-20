/**
 * L4B-1 — Planning ↔ Ledger decision lineage foundation (pure + DI repository).
 * Schema DDL is isolated and deployment-inactive (concurrency v6 collision avoidance).
 */

export {
  L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN,
  L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
  L4B_PLANNING_LINEAGE_PROPOSED_NUMERIC_SLOT,
  L4B_PLANNING_LINEAGE_TARGET_SCHEMA_SLOT,
  SEO_PLANNING_DECISION_LINKS_DDL,
  SEO_PLANNING_DECISION_LINKS_TABLE,
} from "@/lib/cms/seo-planning-lineage/schema-ddl";

/** Pure compatibility matrix — not the MySQL adapter (adapter is server-only, non-barrel). */
export {
  L4B4_ACTIVE_SCHEMA_VERSION,
  L4B4_CONCURRENCY_RELEASED_SCHEMA_VERSION,
  L4B4_CONCURRENCY_UNRELEASED_SCHEMA_VERSION,
  L4B4_LINEAGE_MIGRATION_DEPENDENCY,
  L4B4_RECOMMENDED_MIGRATION_ORDER,
  L4B4_SCHEMA_COMPATIBILITY_MATRIX,
  assertL4b4SchemaActivationBoundaries,
  assessL4bLineageMigrationReadiness,
  inspectL4bLineageDdlReadiness,
  type L4B4CompatibilityRow,
  type L4B5MigrationReadiness,
} from "@/lib/cms/seo-planning-lineage/schema-compatibility";

export {
  PLANNING_LINEAGE_DELETE_FINAL_INTEGRITY,
  PLANNING_PERMANENT_DELETE_POLICY_DECISIONS,
  SEO_PLANNING_LINEAGE_CONFLICT_DELETE_MESSAGE,
  SEO_PLANNING_LINEAGE_DELETE_POLICY_VERSION,
  SEO_PLANNING_LINEAGE_UNAVAILABLE_DELETE_MESSAGE,
  SEO_PLANNING_LINKED_DELETE_BLOCKED_MESSAGE,
  evaluatePlanningLifecycleWithLineage,
  evaluatePlanningPermanentDeletePolicy,
  evaluatePlanningPermanentDeletePolicyAsync,
  ignoreClientSuppliedLineageFlags,
  type PlanningLifecycleLineageAllowance,
  type PlanningPermanentDeletePolicyDecision,
  type PlanningPermanentDeletePolicyResult,
} from "@/lib/cms/seo-planning-lineage/delete-policy";

export {
  SEO_PLANNING_LINEAGE_CAPS,
  SEO_PLANNING_LINEAGE_ERROR_CODES,
  SEO_PLANNING_LINEAGE_READ_STATES,
  SEO_PLANNING_LINEAGE_SELECTION_MARKERS,
  SEO_PLANNING_LINEAGE_VERSION,
  type EstablishPlanningDecisionLinkResult,
  type PlanningDecisionLineageCandidate,
  type PlanningDecisionLineageRecords,
  type PlanningDecisionLineageValidationResult,
  type ResolveDecisionPlanningLineageResult,
  type ResolvePlanningDecisionLineageResult,
  type SeoPlanningDecisionLinkRow,
  type SeoPlanningLineageErrorCode,
  type SeoPlanningLineageReadState,
  type SeoPlanningLineageSelectionMarker,
} from "@/lib/cms/seo-planning-lineage/types";

export {
  decisionSnapshotIncomplete,
  isPlanningDraftArchived,
  isValidLineageId,
  planningDecisionIdentityConsistent,
  researchRunSupportsLineage,
  validatePlanningDecisionLineageCandidate,
} from "@/lib/cms/seo-planning-lineage/validate";

export {
  isTrustedPlanningDecisionSelection,
  tryMintTrustedPlanningDecisionSelection,
  trustedSelectionMatchesLocators,
  type TrustedPlanningDecisionSelection,
} from "@/lib/cms/seo-planning-lineage/selection";
// Test-only fixtures stay under tools/ (not re-exported here).
// The ungated transactional execution module is intentionally omitted from this barrel.

export {
  attemptEstablishPlanningDecisionLink,
  PlanningLineageConflictError,
  type PlanningLineageStore,
} from "@/lib/cms/seo-planning-lineage/repository";

export {
  resolveDecisionPlanningLineage,
  resolvePlanningDecisionLineage,
} from "@/lib/cms/seo-planning-lineage/read";

export {
  LEDGER_MISSING_PLANNING_FIELDS,
  RESEARCH_PROCEED_SELECTION_ERROR_CODES,
  RESEARCH_PROCEED_SELECTION_STATUSES,
  RESEARCH_PROCEED_SELECTION_VERSION,
  isPreparedResearchProceedSelection,
  isValidLedgerDecisionId,
  isValidOpportunityIndex,
  prepareTrustedResearchProceedSelection,
  summarizePreparedResearchProceedSelection,
  type DisplayedResearchOpportunitySnapshot,
  type PrepareTrustedResearchProceedSelectionResult,
  type PreparedResearchProceedSelection,
  type ResearchProceedLedgerReader,
  type ResearchProceedSelectionErrorCode,
  type ResearchProceedSelectionStatus,
} from "@/lib/cms/seo-planning-lineage/research-proceed-selection";

export {
  RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED,
  RESEARCH_PROCEED_INTEGRATION_ERROR_CODES,
  RESEARCH_PROCEED_INTEGRATION_VERSION,
  RESEARCH_PROCEED_LINKAGE_STATUSES,
  proceedFromTrustedResearchSelection,
  researchProceedIntegrationAllowsLinkedStatus,
  type ResearchProceedAuthoritativeFields,
  type ResearchProceedEditorialProvenance,
  type ResearchProceedEditorialSupplemental,
  type ResearchProceedIntegrationErrorCode,
  type ResearchProceedIntegrationFailure,
  type ResearchProceedIntegrationResult,
  type ResearchProceedIntegrationSuccess,
  type ResearchProceedLinkageStatus,
} from "@/lib/cms/seo-planning-lineage/proceed-integration";

/** Physical readiness + worker-overlap are pure/DI — not transactional writers. */
export {
  L4B_PHYSICAL_SCHEMA_READINESS_VERSION,
  LINEAGE_PHYSICAL_READINESS_STATUSES,
  LINEAGE_PHYSICAL_SCHEMA_EXPECTATIONS,
  assessLineagePhysicalSchemaReadiness,
  lineagePhysicalReadinessInvocationPolicy,
  type LineagePhysicalReadinessResult,
  type LineagePhysicalReadinessStatus,
  type LineagePhysicalSchemaMetadataReader,
} from "@/lib/cms/seo-planning-lineage/physical-schema-readiness";

export {
  L4B_WORKER_OVERLAP_ANALYSIS_VERSION,
  L4B_WORKER_OVERLAP_MATRIX,
  classifyWorkerOverlap,
  describeCurrentRolloutStage,
  type WorkerOverlapCell,
  type WorkerOverlapVerdict,
  type WorkerProceedMode,
} from "@/lib/cms/seo-planning-lineage/worker-overlap-compatibility";

// transactional-integration / live-wiring-dispatch / transactional-execution
// remain intentionally omitted from this barrel.
