import "server-only";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { defaultPages, defaultSettings } from "@/lib/cms/defaults";
import { readJsonFile } from "@/lib/cms/json-store";
import type { MediaAsset, MediaFile, PagesFile, SiteSettings } from "@/lib/cms/types";
import { sanitizePage, sanitizeSettings } from "@/lib/cms/validation";
import { getDbPool } from "@/lib/db/pool";
import { CMS_SCHEMA_STATEMENTS } from "@/lib/db/schema";

export const SITE_SETTINGS_KEY = "site";

type CountRow = RowDataPacket & { n: number };

async function tableCount(table: "pages" | "media_assets" | "site_settings") {
  const [rows] = await getDbPool().query<CountRow[]>(
    table === "site_settings"
      ? "SELECT COUNT(*) AS n FROM site_settings WHERE setting_key = ?"
      : `SELECT COUNT(*) AS n FROM ${table}`,
    table === "site_settings" ? [SITE_SETTINGS_KEY] : [],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function ensureCmsSchema() {
  const pool = getDbPool();
  await pool.query("SELECT 1");
  for (const statement of CMS_SCHEMA_STATEMENTS) {
    await pool.query(statement);
  }
}

export async function seedCmsIfEmpty() {
  const pagesEmpty = (await tableCount("pages")) === 0;
  const settingsEmpty = (await tableCount("site_settings")) === 0;
  const mediaEmpty = (await tableCount("media_assets")) === 0;

  if (!pagesEmpty && !settingsEmpty && !mediaEmpty) {
    return { seeded: false as const };
  }

  const pagesFile = await readJsonFile<PagesFile>("pages.json", { pages: defaultPages() });
  const settings = await readJsonFile<SiteSettings>("site-settings.json", defaultSettings());
  const mediaFile = await readJsonFile<MediaFile>("media.json", { assets: [] });

  if (!Array.isArray(pagesFile.pages)) {
    throw new Error("pages.json is invalid: missing pages array.");
  }

  const conn = await getDbPool().getConnection();
  await conn.beginTransaction();
  try {
    if (pagesEmpty) {
      for (const raw of pagesFile.pages) {
        const page = sanitizePage(raw);
        await conn.execute(
          `INSERT INTO pages (id, name, slug, status, cms_enabled)
           VALUES (?, ?, ?, ?, ?)`,
          [page.id, page.name, page.slug, page.status, page.cmsEnabled ? 1 : 0],
        );
        for (const section of page.sections) {
          await conn.execute(
            `INSERT INTO page_sections
              (id, page_id, section_type, label, sort_order, visible, section_data)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              section.id,
              page.id,
              section.type,
              section.label,
              section.order,
              section.visible ? 1 : 0,
              JSON.stringify(section.data),
            ],
          );
        }
      }
    }

    if (settingsEmpty) {
      await conn.execute(
        `INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)`,
        [SITE_SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings))],
      );
    }

    if (mediaEmpty) {
      const assets = Array.isArray(mediaFile.assets) ? mediaFile.assets : [];
      for (const asset of assets) {
        await insertMediaRow(conn, asset);
      }
    }

    await conn.commit();
    return { seeded: true as const };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function insertMediaRow(conn: PoolConnection, asset: MediaAsset) {
  await conn.execute(
    `INSERT INTO media_assets (
      id, public_id, secure_url, filename, width, height, format,
      resource_type, folder, bytes, alt, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      public_id = VALUES(public_id),
      secure_url = VALUES(secure_url),
      filename = VALUES(filename),
      width = VALUES(width),
      height = VALUES(height),
      format = VALUES(format),
      resource_type = VALUES(resource_type),
      folder = VALUES(folder),
      bytes = VALUES(bytes),
      alt = VALUES(alt)`,
    [
      asset.id,
      asset.publicId,
      asset.secureUrl,
      asset.originalFilename,
      asset.width,
      asset.height,
      asset.format,
      asset.resourceType,
      asset.folder,
      asset.bytes,
      asset.alt,
      toMysqlDateTime(asset.createdAt),
    ],
  );
}

export function toMysqlDateTime(iso: string) {
  const date = new Date(iso);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return safe.toISOString().slice(0, 19).replace("T", " ");
}

export function fromMysqlDateTime(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

export function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") return value as T;
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
