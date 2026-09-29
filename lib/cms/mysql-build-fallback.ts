import { isProductionBuildPhase } from "@/lib/db/config";

/**
 * Run a MySQL CMS op, falling back to JSON only during Next production builds.
 * Extracted for unit tests without importing server-only MySQL modules.
 */
export async function runMysqlWithBuildFallback<T>(
  mysqlOp: () => Promise<T>,
  jsonOp: () => Promise<T>,
  onFallback?: () => void,
): Promise<T> {
  try {
    return await mysqlOp();
  } catch (error) {
    if (isProductionBuildPhase()) {
      onFallback?.();
      return jsonOp();
    }
    throw error;
  }
}
