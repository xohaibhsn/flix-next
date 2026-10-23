/**
 * A2-4 — Compile-time production wiring gate for supervised NEW_BLOG Article Apply.
 *
 * Closed by default. Env / cookie / URL / request-body overrides CANNOT open this gate.
 * Offline readiness + in-memory / inactive adapters remain available for local tests;
 * they do not constitute production Apply activation.
 *
 * Flip only under a separately authorized release task (not this module alone).
 */

export const SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_SPEC = "a2-4-production-gate-v1" as const;

/**
 * MUST remain false until Professor authorizes production Apply wiring.
 * Do not read process.env here — env cannot activate Apply.
 */
export const SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED: boolean = false;

export const SEO_AI_ARTICLE_APPLY_PRODUCTION_DISABLED_MESSAGE =
  "Supervised NEW_BLOG Article Apply production wiring is disabled. Private previews are not applied to Blog drafts.";

export const SEO_AI_ARTICLE_APPLY_PRODUCTION_GATE_CODE = "feature_disabled" as const;

export type ArticleApplyProductionGateResult =
  | { ok: true; spec: typeof SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_SPEC }
  | {
      ok: false;
      spec: typeof SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_SPEC;
      code: typeof SEO_AI_ARTICLE_APPLY_PRODUCTION_GATE_CODE;
      error: string;
      /** Explicit: env/body/cookie cannot activate. */
      envOverrideIgnored: true;
    };

export function isArticleApplyProductionWiringEnabled(): boolean {
  return SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED === true;
}

/**
 * Fail-closed probe for any future Server Action / UI Apply entry.
 * Intentionally ignores process.env and client flags.
 */
export function evaluateArticleApplyProductionGate(_ignored?: {
  envFlag?: unknown;
  cookieFlag?: unknown;
  bodyFlag?: unknown;
  urlFlag?: unknown;
}): ArticleApplyProductionGateResult {
  void _ignored;
  if (SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED !== true) {
    return {
      ok: false,
      spec: SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_SPEC,
      code: SEO_AI_ARTICLE_APPLY_PRODUCTION_GATE_CODE,
      error: SEO_AI_ARTICLE_APPLY_PRODUCTION_DISABLED_MESSAGE,
      envOverrideIgnored: true,
    };
  }
  return { ok: true, spec: SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_SPEC };
}
