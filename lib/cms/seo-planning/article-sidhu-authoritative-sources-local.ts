/**
 * A2-7 — LOCAL-ONLY read-only Sidhu authoritative source boundary.
 *
 * Fetches current Planning / Blog identity and (when available) provenance-tagged
 * evidence inputs for H3B assessment. Never mutates CMS, Research, Ledger, or Blog.
 *
 * Production catalog wiring remains inactive here: callers inject a read-only
 * catalog compatible with `cms.getSeoPlanningDraftById` / `cms.getPostById`.
 * Synthetic evidence readers are for offline tests only and do not prove live
 * Research/GSC provenance.
 */

import type { SeoEvidencePackInput } from "@/lib/cms/seo-autonomy/evidence-pack";
import {
  assessArticleEvidencePackForApply,
  type TrustedArticleEvidencePackAssessment,
} from "@/lib/cms/seo-planning/article-evidence-pack-adapter";
import {
  SEO_AI_ARTICLE_APPLY_PROTECTED_FIXTURE_FINGERPRINT_PREFIX,
} from "@/lib/cms/seo-planning/article-apply-readiness";
import {
  isSeoPlanningDraftArchived,
  parseSeoPlanningLifecycleId,
} from "@/lib/cms/seo-planning/lifecycle";
import {
  readSeoPlanningEditorialEvidence,
  SEO_PLANNING_EDITORIAL_TRUST,
} from "@/lib/cms/seo-planning/editorial-evidence";
import type { BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export const SEO_AI_ARTICLE_SIDHU_SOURCES_SPEC = "a2-7-sidhu-authoritative-sources-local-v1" as const;

/** Read-only Planning/Blog catalog surface — mirrors Cms getters, no writes. */
export type SidhuAuthoritativePlanningCatalog = {
  getSeoPlanningDraftById(id: string): Promise<SeoPlanningDraft | null>;
  getPostById(id: string): Promise<BlogPost | null>;
};

export type SidhuEvidenceProvenanceKind =
  | "server_owned_research"
  | "synthetic_test"
  | "unavailable";

/**
 * Minimal read-only evidence dependency.
 * Production would resolve Research/Ledger/GSC-backed pack inputs.
 * Offline tests inject provenance-tagged synthetic pack inputs.
 */
export type SidhuTrustedEvidenceSourceReader = {
  readEvidencePackInputForPlanning(args: {
    planningDraftId: string;
    planning: SeoPlanningDraft;
  }): Promise<SidhuTrustedEvidenceReadResult>;
};

export type SidhuTrustedEvidenceReadResult =
  | {
      ok: true;
      provenance: Exclude<SidhuEvidenceProvenanceKind, "unavailable">;
      /** Real H3B input — never a client READY string. */
      packInput: SeoEvidencePackInput;
    }
  | {
      ok: false;
      provenance: "unavailable";
      code: "evidence_unavailable" | "evidence_read_failure";
      message: string;
    };

export type SidhuAuthoritativePlanningLoad =
  | {
      ok: true;
      spec: typeof SEO_AI_ARTICLE_SIDHU_SOURCES_SPEC;
      planning: SeoPlanningDraft;
      linkedPost: BlogPost | null;
      editorialTrust: typeof SEO_PLANNING_EDITORIAL_TRUST | "absent";
      fixtureMarked: boolean;
    }
  | {
      ok: false;
      spec: typeof SEO_AI_ARTICLE_SIDHU_SOURCES_SPEC;
      code:
        | "invalid_input"
        | "planning_not_found"
        | "planning_archived"
        | "protected_fixture";
      error: string;
      planning: null;
      linkedPost: null;
    };

export type SidhuTrustedEvidenceAssessment =
  | {
      ok: true;
      provenance: Exclude<SidhuEvidenceProvenanceKind, "unavailable">;
      trustedEvidencePack: TrustedArticleEvidencePackAssessment;
    }
  | {
      ok: false;
      code: "evidence_unavailable" | "evidence_read_failure" | "evidence_pack_hold";
      error: string;
      provenance: SidhuEvidenceProvenanceKind;
      trustedEvidencePack: TrustedArticleEvidencePackAssessment | null;
    };

/**
 * Fail-closed Planning load: ID parse → catalog read → archive/fixture checks.
 * Does not accept a client-supplied Planning object as authoritative.
 */
export async function loadAuthoritativeSeoPlanningForApply(args: {
  planningDraftId: unknown;
  catalog: SidhuAuthoritativePlanningCatalog;
}): Promise<SidhuAuthoritativePlanningLoad> {
  const parsed = parseSeoPlanningLifecycleId(args.planningDraftId);
  if (!parsed.ok) {
    return {
      ok: false,
      spec: SEO_AI_ARTICLE_SIDHU_SOURCES_SPEC,
      code: "invalid_input",
      error: parsed.error,
      planning: null,
      linkedPost: null,
    };
  }

  const planning = await args.catalog.getSeoPlanningDraftById(parsed.id);
  if (!planning) {
    return {
      ok: false,
      spec: SEO_AI_ARTICLE_SIDHU_SOURCES_SPEC,
      code: "planning_not_found",
      error: "Planning draft was not found in the authoritative catalog.",
      planning: null,
      linkedPost: null,
    };
  }

  if (isSeoPlanningDraftArchived(planning)) {
    return {
      ok: false,
      spec: SEO_AI_ARTICLE_SIDHU_SOURCES_SPEC,
      code: "planning_archived",
      error: "Archived Planning drafts cannot enter the supervised Apply preflight path.",
      planning: null,
      linkedPost: null,
    };
  }

  const fixtureMarked = String(planning.fingerprint || "").startsWith(
    SEO_AI_ARTICLE_APPLY_PROTECTED_FIXTURE_FINGERPRINT_PREFIX,
  );
  if (fixtureMarked) {
    return {
      ok: false,
      spec: SEO_AI_ARTICLE_SIDHU_SOURCES_SPEC,
      code: "protected_fixture",
      error: "Fixture-marked Planning drafts cannot enter the supervised Apply preflight path.",
      planning: null,
      linkedPost: null,
    };
  }

  const linkedPost = planning.linkedPostId
    ? await args.catalog.getPostById(planning.linkedPostId)
    : null;

  const editorial = readSeoPlanningEditorialEvidence(planning.payload);
  const hasEditorial =
    Boolean(editorial.originalContribution.trim()) ||
    Boolean(editorial.readerBenefit.trim()) ||
    Boolean(editorial.missingEvidenceNotes.trim()) ||
    editorial.entries.length > 0;

  return {
    ok: true,
    spec: SEO_AI_ARTICLE_SIDHU_SOURCES_SPEC,
    planning,
    linkedPost,
    editorialTrust: hasEditorial ? SEO_PLANNING_EDITORIAL_TRUST : "absent",
    fixtureMarked: false,
  };
}

/**
 * Resolve a sealed H3B assessment from a server-owned evidence reader.
 * Editorial Planning notes alone never become verified pack inputs here.
 */
export async function assessTrustedEvidenceFromAuthoritativeReader(args: {
  planning: SeoPlanningDraft;
  evidenceReader: SidhuTrustedEvidenceSourceReader;
}): Promise<SidhuTrustedEvidenceAssessment> {
  let read: SidhuTrustedEvidenceReadResult;
  try {
    read = await args.evidenceReader.readEvidencePackInputForPlanning({
      planningDraftId: args.planning.id,
      planning: args.planning,
    });
  } catch {
    return {
      ok: false,
      code: "evidence_read_failure",
      error: "Trusted evidence reader failed. Apply preflight remains fail-closed.",
      provenance: "unavailable",
      trustedEvidencePack: null,
    };
  }

  if (!read.ok) {
    return {
      ok: false,
      code: read.code,
      error: read.message,
      provenance: "unavailable",
      trustedEvidencePack: null,
    };
  }

  const trusted = assessArticleEvidencePackForApply(read.packInput);
  if (trusted.applyEvidenceGate !== "PASS_DRAFTING_REVIEW_ONLY") {
    return {
      ok: false,
      code: "evidence_pack_hold",
      error:
        "Evidence Pack HOLD / incomplete / conflicting evidence blocks supervised Apply preflight.",
      provenance: read.provenance,
      trustedEvidencePack: trusted,
    };
  }

  return {
    ok: true,
    provenance: read.provenance,
    trustedEvidencePack: trusted,
  };
}

/** Explicit unavailable reader — production gap until real Research/GSC readers exist. */
export function createUnavailableSidhuEvidenceReader(
  message = "No authoritative Research/Ledger/GSC evidence reader is wired for Apply preflight.",
): SidhuTrustedEvidenceSourceReader {
  return {
    async readEvidencePackInputForPlanning() {
      return {
        ok: false,
        provenance: "unavailable",
        code: "evidence_unavailable",
        message,
      };
    },
  };
}

/**
 * Offline-only synthetic reader. Provenance is tagged `synthetic_test` and must
 * never be described as live Sidhu/Research authenticity.
 */
export function createSyntheticSidhuEvidenceReader(
  packInput: SeoEvidencePackInput,
): SidhuTrustedEvidenceSourceReader {
  return {
    async readEvidencePackInputForPlanning() {
      return {
        ok: true,
        provenance: "synthetic_test",
        packInput,
      };
    },
  };
}
