/**
 * Internal one-time migration completion keys stored in site_settings.
 * These are not user-editable Site Settings fields (key "site").
 */
export const CMS_CONTENT_CLEANUP_V1 = "cms_content_cleanup_v1";
export const TEST_TAGLINE_CLEANUP_V1 = "test_tagline_cleanup_v1";
export const SUBSCRIPTION_SLUG_MIGRATION_V1 = "subscription_slug_migration_v1";
/** One-time subscription page SEO title/meta + money-back eligibility microcopy (F4). */
export const SUBSCRIPTION_SEO_MICROCOPY_V1 = "subscription_seo_microcopy_v1";
/**
 * F4 follow-up: title-only exact match using unicode-safe £ constants.
 * v1 updated meta successfully but could skip title when the pound glyph was encoding-corrupted in the bundle.
 */
export const SUBSCRIPTION_SEO_MICROCOPY_V2 = "subscription_seo_microcopy_v2";
/** Schema verification completion marker; value is CURRENT_CMS_SCHEMA_VERSION as decimal text. */
export const CMS_SCHEMA_VERSION_KEY = "cms_schema_version";

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
