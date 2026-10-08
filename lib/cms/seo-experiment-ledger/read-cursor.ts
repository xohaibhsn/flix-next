/**
 * Experiment Ledger L3 — pure pagination / ID validation.
 * Safe for unit tests without server-only or MySQL.
 */

import { SEO_LEDGER_CAPS } from "@/lib/cms/seo-experiment-ledger/types";

export const SEO_LEDGER_LIST_DEFAULT_PAGE_SIZE = 20 as const;
export const SEO_LEDGER_LIST_MAX_PAGE_SIZE = 50 as const;
/** Defensive fetch bound: L1 max evaluations is 5; +1 detects unexpected excess. */
export const SEO_LEDGER_DECISION_FETCH_LIMIT = 6 as const;

const MYSQL_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const RUN_ID_RE = /^seorun_[A-Za-z0-9-]{1,72}$/;

export function clampLedgerListPageSize(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 1) return SEO_LEDGER_LIST_DEFAULT_PAGE_SIZE;
  return Math.min(n, SEO_LEDGER_LIST_MAX_PAGE_SIZE);
}

/** Validate run IDs before any SQL lookup — rejects oversized / unsafe shapes. */
export function isValidLedgerRunId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const id = value.trim();
  if (!id || id.length > SEO_LEDGER_CAPS.adminId) return false;
  if (!RUN_ID_RE.test(id)) return false;
  return true;
}

export type SeoLedgerListCursor = {
  createdAt: string;
  id: string;
};

function encodeBase64Url(text: string): string {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 240) return null;
  try {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return null;
  }
}

export function encodeLedgerListCursor(cursor: SeoLedgerListCursor): string {
  return encodeBase64Url(JSON.stringify({ c: cursor.createdAt, i: cursor.id }));
}

/**
 * Strict cursor decode. Malformed input returns null — callers must not interpolate it into SQL.
 */
export function decodeLedgerListCursor(raw: unknown): SeoLedgerListCursor | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const text = decodeBase64Url(raw.trim());
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as { c?: unknown; i?: unknown };
  if (typeof record.c !== "string" || typeof record.i !== "string") return null;
  if (!MYSQL_DATETIME_RE.test(record.c)) return null;
  if (!isValidLedgerRunId(record.i)) return null;
  return { createdAt: record.c, id: record.i };
}

/** Format stored MySQL DATETIME (UTC) for admin display without local reinterpretation. */
export function formatLedgerMysqlUtcLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = String(value).trim();
  if (!trimmed) return "—";
  if (MYSQL_DATETIME_RE.test(trimmed)) return `${trimmed} UTC`;
  const asIso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T") + "Z";
  const date = new Date(asIso);
  if (Number.isNaN(date.getTime())) return trimmed;
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** Normalize a DB DATETIME / Date into MySQL UTC wall-clock string for cursors. */
export function toLedgerMysqlDateTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 19).replace("T", " ");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (MYSQL_DATETIME_RE.test(trimmed)) return trimmed;
    const date = new Date(trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T") + "Z");
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 19).replace("T", " ");
    }
  }
  return "1970-01-01 00:00:00";
}
