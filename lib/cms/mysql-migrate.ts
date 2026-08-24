import "server-only";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  defaultBlogCategories,
  defaultBlogPosts,
  defaultFaqs,
  defaultPages,
  defaultPricingPlans,
  defaultSettings,
} from "@/lib/cms/defaults";
import { readJsonFile } from "@/lib/cms/json-store";
import { MANAGED_REDIRECT_SEED_KEY, MANAGED_REDIRECTS } from "@/lib/cms/managed-redirects";
import type { MediaAsset, MediaFile, PagesFile, SiteSettings } from "@/lib/cms/types";
import { sanitizePage, sanitizeSettings } from "@/lib/cms/validation";
import { getDbPool } from "@/lib/db/pool";
import { CMS_SCHEMA_STATEMENTS } from "@/lib/db/schema";

export const SITE_SETTINGS_KEY = "site";

type CountRow = RowDataPacket & { n: number };
type ColumnRow = RowDataPacket & { COLUMN_NAME: string };

const REQUIRED_COLUMNS: Array<{ table: string; column: string; definition: string }> = [
  { table: "blog_posts", column: "excerpt", definition: "excerpt TEXT NULL" },
  { table: "blog_posts", column: "content", definition: "content LONGTEXT NULL" },
  { table: "blog_posts", column: "category_id", definition: "category_id VARCHAR(80) NULL" },
  { table: "blog_posts", column: "featured_image", definition: "featured_image LONGTEXT NULL" },
  { table: "blog_posts", column: "status", definition: "status VARCHAR(20) NOT NULL DEFAULT 'draft'" },
  { table: "blog_posts", column: "featured", definition: "featured TINYINT(1) NOT NULL DEFAULT 0" },
  { table: "blog_posts", column: "published_at", definition: "published_at DATETIME NULL" },
  { table: "blog_posts", column: "seo_title", definition: "seo_title VARCHAR(200) NOT NULL DEFAULT ''" },
  { table: "blog_posts", column: "seo_description", definition: "seo_description VARCHAR(300) NOT NULL DEFAULT ''" },
  { table: "blog_posts", column: "focus_keyword", definition: "focus_keyword VARCHAR(120) NOT NULL DEFAULT ''" },
  { table: "blog_posts", column: "canonical_url", definition: "canonical_url VARCHAR(255) NOT NULL DEFAULT ''" },
  { table: "blog_posts", column: "robots_index", definition: "robots_index TINYINT(1) NOT NULL DEFAULT 1" },
  { table: "blog_posts", column: "robots_follow", definition: "robots_follow TINYINT(1) NOT NULL DEFAULT 1" },
  { table: "blog_posts", column: "og_title", definition: "og_title VARCHAR(200) NOT NULL DEFAULT ''" },
  { table: "blog_posts", column: "og_description", definition: "og_description VARCHAR(300) NOT NULL DEFAULT ''" },
  { table: "blog_posts", column: "og_image", definition: "og_image LONGTEXT NULL" },
  { table: "blog_posts", column: "sitemap_include", definition: "sitemap_include TINYINT(1) NOT NULL DEFAULT 1" },
  { table: "blog_categories", column: "description", definition: "description VARCHAR(255) NOT NULL DEFAULT ''" },
  { table: "blog_categories", column: "is_active", definition: "is_active TINYINT(1) NOT NULL DEFAULT 1" },
  { table: "media_assets", column: "filename", definition: "filename VARCHAR(160) NOT NULL DEFAULT ''" },
  { table: "media_assets", column: "width", definition: "width INT NULL" },
  { table: "media_assets", column: "height", definition: "height INT NULL" },
  { table: "media_assets", column: "format", definition: "format VARCHAR(40) NOT NULL DEFAULT ''" },
  { table: "media_assets", column: "resource_type", definition: "resource_type VARCHAR(40) NOT NULL DEFAULT 'image'" },
  { table: "media_assets", column: "folder", definition: "folder VARCHAR(160) NOT NULL DEFAULT ''" },
  { table: "media_assets", column: "bytes", definition: "bytes INT NULL" },
  { table: "media_assets", column: "alt", definition: "alt VARCHAR(160) NOT NULL DEFAULT ''" },
];

async function ensureMissingColumns() {
  const pool = getDbPool();
  const tables = [...new Set(REQUIRED_COLUMNS.map((item) => item.table))];
  const existing = new Map<string, Set<string>>();
  for (const table of tables) {
    const [rows] = await pool.query<ColumnRow[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    existing.set(table, new Set(rows.map((row) => row.COLUMN_NAME)));
  }
  for (const item of REQUIRED_COLUMNS) {
    if (existing.get(item.table)?.has(item.column)) continue;
    await pool.query(`ALTER TABLE \`${item.table}\` ADD COLUMN ${item.definition}`);
  }
}

export async function ensureCmsSchema() {
  const pool = getDbPool();
  await pool.query("SELECT 1");
  for (const statement of CMS_SCHEMA_STATEMENTS) {
    await pool.query(statement);
  }
  await ensureMissingColumns();
}

async function tableCount(table: "pages" | "media_assets" | "site_settings") {
  const [rows] = await getDbPool().query<CountRow[]>(
    table === "site_settings"
      ? "SELECT COUNT(*) AS n FROM site_settings WHERE setting_key = ?"
      : `SELECT COUNT(*) AS n FROM ${table}`,
    table === "site_settings" ? [SITE_SETTINGS_KEY] : [],
  );
  return Number(rows[0]?.n ?? 0);
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

async function countTable(table: string) {
  const [rows] = await getDbPool().query<CountRow[]>(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(rows[0]?.n ?? 0);
}

export async function seedExtendedIfEmpty() {
  const pool = getDbPool();
  if ((await countTable("pricing_plans")) === 0) {
    for (const plan of defaultPricingPlans()) {
      await pool.execute(
        `INSERT INTO pricing_plans
          (id, name, slug, price, duration, badge_text, is_popular, features, button_label, button_url, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          plan.id,
          plan.name,
          plan.slug,
          plan.price,
          plan.duration,
          plan.badge,
          plan.popular ? 1 : 0,
          JSON.stringify(plan.features),
          plan.buttonLabel,
          plan.buttonHref,
          plan.sortOrder,
          plan.active ? 1 : 0,
        ],
      );
    }
  }
  if ((await countTable("faqs")) === 0) {
    for (const item of defaultFaqs()) {
      await pool.execute(
        `INSERT INTO faqs (id, question, answer, category, sort_order, is_visible)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [item.id, item.question, item.answer, item.category, item.sortOrder, item.visible ? 1 : 0],
      );
    }
  }
  if ((await countTable("blog_categories")) === 0) {
    for (const category of defaultBlogCategories()) {
      await pool.execute(
        `INSERT INTO blog_categories (id, name, slug, description, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [category.id, category.name, category.slug, category.description, category.active ? 1 : 0],
      );
    }
  }
  if ((await countTable("blog_posts")) === 0) {
    for (const post of defaultBlogPosts()) {
      await pool.execute(
        `INSERT INTO blog_posts (
          id, title, slug, excerpt, content, category_id, featured_image, status, featured, published_at,
          seo_title, seo_description, focus_keyword, canonical_url, robots_index, robots_follow,
          og_title, og_description, og_image, sitemap_include
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          post.id,
          post.title,
          post.slug,
          post.excerpt,
          post.content,
          post.categoryId,
          JSON.stringify(post.featuredImage),
          post.status,
          post.featured ? 1 : 0,
          post.publishedAt ? toMysqlDateTime(post.publishedAt) : null,
          post.seoTitle,
          post.seoDescription,
          post.focusKeyword,
          post.canonicalUrl,
          post.robotsIndex ? 1 : 0,
          post.robotsFollow ? 1 : 0,
          post.ogTitle,
          post.ogDescription,
          JSON.stringify(post.ogImage),
          post.sitemapInclude ? 1 : 0,
        ],
      );
    }
  }

  const defaults = defaultPages();
  for (const page of defaults.filter((item) => item.slug !== "/")) {
    const [rows] = await pool.query<Array<RowDataPacket & { id: string }>>(
      "SELECT id FROM pages WHERE slug = ? LIMIT 1",
      [page.slug],
    );
    const existingId = rows[0]?.id;
    if (!existingId) {
      const safe = sanitizePage(page);
      await pool.execute(
        `INSERT INTO pages (id, name, slug, status, cms_enabled) VALUES (?, ?, ?, ?, ?)`,
        [safe.id, safe.name, safe.slug, safe.status, safe.cmsEnabled ? 1 : 0],
      );
      for (const section of safe.sections) {
        await pool.execute(
          `INSERT INTO page_sections
            (id, page_id, section_type, label, sort_order, visible, section_data)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            section.id,
            safe.id,
            section.type,
            section.label,
            section.order,
            section.visible ? 1 : 0,
            JSON.stringify(section.data),
          ],
        );
      }
      continue;
    }
    const [sectionCount] = await pool.query<CountRow[]>(
      "SELECT COUNT(*) AS n FROM page_sections WHERE page_id = ?",
      [existingId],
    );
    if (Number(sectionCount[0]?.n ?? 0) > 0) continue;
    await pool.execute("UPDATE pages SET cms_enabled = 1, name = ? WHERE id = ?", [page.name, existingId]);
    for (const section of sanitizePage({ ...page, id: existingId }).sections) {
      await pool.execute(
        `INSERT INTO page_sections
          (id, page_id, section_type, label, sort_order, visible, section_data)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          section.id,
          existingId,
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

export async function seedManagedRedirectsIfNeeded() {
  const pool = getDbPool();
  const [flagRows] = await pool.query<Array<RowDataPacket & { setting_value: unknown }>>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
    [MANAGED_REDIRECT_SEED_KEY],
  );
  if (flagRows[0]) return;

  for (const rule of MANAGED_REDIRECTS) {
    const [existing] = await pool.query<Array<RowDataPacket & { id: string }>>(
      "SELECT id FROM redirects WHERE source_path = ? LIMIT 1",
      [rule.sourcePath],
    );
    if (existing[0]) continue;
    await pool.execute(
      `INSERT INTO redirects (id, source_path, destination_path, status_code, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [rule.id, rule.sourcePath, rule.destinationPath, rule.statusCode, rule.active ? 1 : 0],
    );
  }

  await pool.execute(
    `INSERT INTO site_settings (setting_key, setting_value)
     VALUES (?, '1')
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [MANAGED_REDIRECT_SEED_KEY],
  );
}
