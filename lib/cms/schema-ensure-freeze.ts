/**
 * Orchestrates CMS readiness under optional CMS_WRITE_FREEZE.
 *
 * Pure coordination helper — injectable for deterministic tests.
 * Does not import server-only / MySQL.
 *
 * Freeze ACTIVE + schema already current (ensureSchemaCurrent resolves without
 * mutation) → skip all post-schema seed/migration/bootstrap writers.
 * Freeze ACTIVE + schema mutation required → ensureSchemaCurrent must reject
 * before the first DDL (wired via assertCmsWritesAllowed in mysql-migrate).
 */
export type CmsReadyFreezeOutcome = "ready-readonly" | "ready-full";

export async function runCmsReadyInitialization(deps: {
  ensureSchemaCurrent: () => Promise<unknown>;
  runPostSchemaMutations: () => Promise<void>;
  isFreezeActive: () => boolean;
}): Promise<CmsReadyFreezeOutcome> {
  await deps.ensureSchemaCurrent();
  if (deps.isFreezeActive()) {
    return "ready-readonly";
  }
  await deps.runPostSchemaMutations();
  return "ready-full";
}
