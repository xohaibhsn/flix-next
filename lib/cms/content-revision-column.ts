/**
 * Postcondition checks for pages.content_revision (signed MySQL INT, NOT NULL, DEFAULT 1).
 */

export type ContentRevisionColumnMeta = {
  TABLE_SCHEMA?: unknown;
  TABLE_NAME?: unknown;
  COLUMN_NAME?: unknown;
  DATA_TYPE?: unknown;
  COLUMN_TYPE?: unknown;
  IS_NULLABLE?: unknown;
  COLUMN_DEFAULT?: unknown;
};

export function isCompatiblePagesContentRevisionColumn(
  row: ContentRevisionColumnMeta | null | undefined,
  expectedSchema?: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (!row) {
    return { ok: false, reason: "pages.content_revision column metadata not found." };
  }
  if (String(row.TABLE_NAME ?? "") !== "pages") {
    return { ok: false, reason: "content_revision metadata is not for table pages." };
  }
  if (String(row.COLUMN_NAME ?? "") !== "content_revision") {
    return { ok: false, reason: "Unexpected column name for content_revision check." };
  }
  if (expectedSchema != null && expectedSchema !== "" && String(row.TABLE_SCHEMA ?? "") !== expectedSchema) {
    return { ok: false, reason: "content_revision belongs to an unexpected schema." };
  }

  const dataType = String(row.DATA_TYPE ?? "").toLowerCase();
  const columnType = String(row.COLUMN_TYPE ?? "").toLowerCase();
  const isInt =
    dataType === "int" ||
    columnType === "int" ||
    /^int(\s*\(|$)/.test(columnType);
  // Reject unsigned — Phase 1 contract is signed INT.
  if (!isInt || columnType.includes("unsigned")) {
    return { ok: false, reason: "pages.content_revision must be signed INT." };
  }
  if (String(row.IS_NULLABLE ?? "").toUpperCase() !== "NO") {
    return { ok: false, reason: "pages.content_revision must be NOT NULL." };
  }

  const defaultRaw = row.COLUMN_DEFAULT;
  const defaultText =
    defaultRaw == null ? "" : String(defaultRaw).trim().replace(/^'|'$/g, "");
  if (defaultText !== "1") {
    return { ok: false, reason: "pages.content_revision DEFAULT must be 1." };
  }

  return { ok: true };
}
