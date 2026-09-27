/**
 * Orchestrates admin bootstrap relative to schema readiness.
 * Used so ensureReady can skip a second ensureCmsSchema pass while standalone
 * bootstrap still ensures schema first.
 */
export async function ensureSchemaThenBootstrap(deps: {
  schemaAlreadyEnsured: boolean;
  ensureSchema: () => Promise<void>;
  bootstrapAfterSchema: () => Promise<void>;
}): Promise<"schema-then-bootstrap" | "bootstrap-only"> {
  if (!deps.schemaAlreadyEnsured) {
    await deps.ensureSchema();
    await deps.bootstrapAfterSchema();
    return "schema-then-bootstrap";
  }
  await deps.bootstrapAfterSchema();
  return "bootstrap-only";
}
