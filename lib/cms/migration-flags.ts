/**
 * Internal one-time migration completion keys stored in site_settings.
 * These are not user-editable Site Settings fields (key "site").
 */
export const CMS_CONTENT_CLEANUP_V1 = "cms_content_cleanup_v1";
export const TEST_TAGLINE_CLEANUP_V1 = "test_tagline_cleanup_v1";

export const CONTENT_CLEANUP_FLAG_KEYS = [CMS_CONTENT_CLEANUP_V1, TEST_TAGLINE_CLEANUP_V1] as const;

export type MigrationOnceResult = "skipped" | "ran" | "deferred";

/**
 * Runs a one-time migration only when its completion flag is absent.
 * The flag is written only after `run` resolves successfully with a non-deferred result.
 * If `run` throws, the flag is not written and the error propagates.
 */
export async function runCompletedMigrationOnce(options: {
  flagKey: string;
  hasCompleted: (key: string) => Promise<boolean>;
  markCompleted: (key: string) => Promise<void>;
  run: () => Promise<void | "deferred">;
}): Promise<MigrationOnceResult> {
  if (await options.hasCompleted(options.flagKey)) return "skipped";
  const outcome = await options.run();
  if (outcome === "deferred") return "deferred";
  await options.markCompleted(options.flagKey);
  return "ran";
}
