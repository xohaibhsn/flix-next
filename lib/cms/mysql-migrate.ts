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
import {
  CMS_CONTENT_CLEANUP_V1,
  SUBSCRIPTION_SEO_MICROCOPY_V1,
  SUBSCRIPTION_SEO_MICROCOPY_V2,
  SUBSCRIPTION_SLUG_MIGRATION_V1,
  TEST_TAGLINE_CLEANUP_V1,
  runCompletedMigrationOnce,
} from "@/lib/cms/migration-flags";
import { BLOG_INDEX_SLUG_LEGACY, resolveBlogIndexManagedRedirect } from "@/lib/cms/blog-index";
import type { CmsPage, CmsSection, FaqItem, MediaAsset, MediaFile, PagesFile, RedirectRule, SectionType, SiteSettings } from "@/lib/cms/types";
import { resolveDefaultPageSeed } from "@/lib/cms/page-seed";
import { applyPublicCopyCleanupToPage, rewriteDemoCopy } from "@/lib/cms/public-copy-cleanup";
import { mysqlDuplicateError } from "@/lib/cms/slug-change";
import { applySeoLongformToPage } from "@/lib/cms/seo-longform";
import { applyPublicCopyCleanupToSettings } from "@/lib/cms/settings-cleanup";
import { remapStructuredHrefs, SUBSCRIPTION_PAGE_ID, SUBSCRIPTION_SLUG, SUBSCRIPTION_SLUG_LEGACY } from "@/lib/cms/page-paths";
import {
  applySubscriptionRedirectMigration,
  isSubscriptionMigrationPostconditionMet,
  remapSettingsForSubscriptionUrl,
} from "@/lib/cms/subscription-url-migrate";
import {
  applySubscriptionMoneyBackExactToFaqs,
  applySubscriptionMoneyBackExactToSections,
  applySubscriptionSeoMicrocopyToSettings,
  applySubscriptionSeoTitleRepair,
} from "@/lib/cms/subscription-seo-microcopy";
import { sanitizePage, sanitizeSettings } from "@/lib/cms/validation";
import { withSlash } from "@/lib/cms/redirects";
import {
  MYSQL_SIGNED_INT_MAX,
  nextContentRevision,
  parseStoredContentRevision,
} from "@/lib/cms/page-revision";
import { isCompatiblePagesContentRevisionColumn } from "@/lib/cms/content-revision-column";
import {
  DEFAULT_CMS_SCHEMA_ENSURE_LOCK,
  DEFAULT_CMS_SCHEMA_ENSURE_LOCK_TIMEOUT_SEC,
  runWithCmsSchemaAdvisoryLock,
} from "@/lib/cms/schema-advisory-lock";
import { getDbPool } from "@/lib/db/pool";
import { CMS_SCHEMA_STATEMENTS, CURRENT_CMS_SCHEMA_VERSION } from "@/lib/db/schema";
import {
  CMS_SCHEMA_VERSION_KEY,
  decideSchemaEnsureAction,
  isMissingRelationError,
  parseStoredSchemaVersion,
  runSchemaVersionGate,
  type SchemaEnsureOutcome,
  type SchemaVersionLookup,
} from "@/lib/cms/schema-version";

export const SITE_SETTINGS_KEY = "site";

type CountRow = RowDataPacket & { n: number };
type ColumnRow = RowDataPacket & { COLUMN_NAME: string };
type SettingValueRow = RowDataPacket & { setting_value: unknown };

async function hasMigrationFlag(key: string) {
  const [rows] = await getDbPool().query<SettingValueRow[]>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
    [key],
  );
  return Boolean(rows[0]);
}

async function markMigrationFlag(key: string) {
  await getDbPool().execute(
    `INSERT INTO site_settings (setting_key, setting_value)
     VALUES (?, '1')
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key],
  );
}

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
  { table: "blog_categories", column: "seo_title", definition: "seo_title VARCHAR(200) NOT NULL DEFAULT ''" },
  { table: "blog_categories", column: "seo_description", definition: "seo_description VARCHAR(300) NOT NULL DEFAULT ''" },
  { table: "blog_categories", column: "focus_keyword", definition: "focus_keyword VARCHAR(120) NOT NULL DEFAULT ''" },
  { table: "blog_categories", column: "canonical_url", definition: "canonical_url VARCHAR(255) NOT NULL DEFAULT ''" },
  { table: "blog_categories", column: "robots_index", definition: "robots_index TINYINT(1) NULL" },
  { table: "blog_categories", column: "robots_follow", definition: "robots_follow TINYINT(1) NULL" },
  { table: "blog_categories", column: "og_title", definition: "og_title VARCHAR(200) NOT NULL DEFAULT ''" },
  { table: "blog_categories", column: "og_description", definition: "og_description VARCHAR(300) NOT NULL DEFAULT ''" },
  { table: "blog_categories", column: "og_image", definition: "og_image LONGTEXT NULL" },
  { table: "blog_categories", column: "sitemap_include", definition: "sitemap_include TINYINT(1) NULL" },
  { table: "media_assets", column: "filename", definition: "filename VARCHAR(160) NOT NULL DEFAULT ''" },
  { table: "media_assets", column: "width", definition: "width INT NULL" },
  { table: "media_assets", column: "height", definition: "height INT NULL" },
  { table: "media_assets", column: "format", definition: "format VARCHAR(40) NOT NULL DEFAULT ''" },
  { table: "media_assets", column: "resource_type", definition: "resource_type VARCHAR(40) NOT NULL DEFAULT 'image'" },
  { table: "media_assets", column: "folder", definition: "folder VARCHAR(160) NOT NULL DEFAULT ''" },
  { table: "media_assets", column: "bytes", definition: "bytes INT NULL" },
  { table: "media_assets", column: "alt", definition: "alt VARCHAR(160) NOT NULL DEFAULT ''" },
  { table: "admin_users", column: "session_version", definition: "session_version INT NOT NULL DEFAULT 1" },
  { table: "admin_users", column: "last_login_at", definition: "last_login_at DATETIME NULL" },
  { table: "admin_users", column: "created_by", definition: "created_by VARCHAR(80) NULL" },
  { table: "seo_planning_drafts", column: "archived_at", definition: "archived_at DATETIME NULL" },
  { table: "pages", column: "content_revision", definition: "content_revision INT NOT NULL DEFAULT 1" },
];

function isDuplicateColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const errno = "errno" in error ? Number(error.errno) : 0;
  return code === "ER_DUP_FIELDNAME" || errno === 1060;
}

type ContentRevisionColumnRow = RowDataPacket & {
  TABLE_SCHEMA: string;
  TABLE_NAME: string;
  COLUMN_NAME: string;
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: unknown;
};

async function assertPagesContentRevisionColumnCompatible(): Promise<void> {
  const pool = getDbPool();
  const [schemaRows] = await pool.query<Array<RowDataPacket & { db: string | null }>>("SELECT DATABASE() AS db");
  const expectedSchema = schemaRows[0]?.db ? String(schemaRows[0].db) : null;
  const [rows] = await pool.query<ContentRevisionColumnRow[]>(
    `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pages' AND COLUMN_NAME = 'content_revision'
     LIMIT 1`,
  );
  const check = isCompatiblePagesContentRevisionColumn(rows[0], expectedSchema);
  if (!check.ok) {
    throw new Error(check.reason);
  }
}

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
    const columns = existing.get(item.table);
    if (!columns || columns.size === 0) continue;
    if (columns.has(item.column)) {
      if (item.table === "pages" && item.column === "content_revision") {
        await assertPagesContentRevisionColumnCompatible();
      }
      continue;
    }
    try {
      await pool.query(`ALTER TABLE \`${item.table}\` ADD COLUMN ${item.definition}`);
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
      // Concurrent ADD may race; only accept when postconditions match Phase 1 contract.
      if (item.table === "pages" && item.column === "content_revision") {
        await assertPagesContentRevisionColumnCompatible();
        continue;
      }
      // Other legacy REQUIRED_COLUMNS: presence after ER_DUP_FIELDNAME is historically accepted.
      continue;
    }
    if (item.table === "pages" && item.column === "content_revision") {
      await assertPagesContentRevisionColumnCompatible();
    }
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

/**
 * Serialize multi-process schema ensure via session GET_LOCK.
 * DDL is not transactionally rollback-safe; content_revision is verified after ADD/DUP.
 */
async function ensureCmsSchemaSerialized(): Promise<void> {
  await runWithCmsSchemaAdvisoryLock({
    lockName: DEFAULT_CMS_SCHEMA_ENSURE_LOCK,
    timeoutSec: DEFAULT_CMS_SCHEMA_ENSURE_LOCK_TIMEOUT_SEC,
    getConnection: async () => getDbPool().getConnection(),
    readIsFastPath: async () => {
      const lookup = await readCmsSchemaVersionLookup();
      return decideSchemaEnsureAction(lookup).action === "fast-path";
    },
    ensureSchema: ensureCmsSchema,
  });
}

type SchemaVersionRow = RowDataPacket & { setting_value: unknown };

async function readCmsSchemaVersionLookup(): Promise<SchemaVersionLookup> {
  try {
    const [rows] = await getDbPool().query<SchemaVersionRow[]>(
      "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
      [CMS_SCHEMA_VERSION_KEY],
    );
    if (!rows[0]) return { status: "found", version: null };
    return { status: "found", version: parseStoredSchemaVersion(rows[0].setting_value) };
  } catch (error) {
    if (isMissingRelationError(error)) return { status: "unavailable" };
    throw error;
  }
}

async function writeCmsSchemaVersion(version: number = CURRENT_CMS_SCHEMA_VERSION): Promise<void> {
  await getDbPool().execute(
    `INSERT INTO site_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [CMS_SCHEMA_VERSION_KEY, String(version)],
  );
}

/**
 * Authoritative schema entry for cold start and standalone bootstrap.
 * Cheap version check first; full ensureCmsSchema only when required; marker written only on success.
 */
export async function ensureCmsSchemaCurrent(): Promise<SchemaEnsureOutcome> {
  return runSchemaVersionGate({
    readLookup: readCmsSchemaVersionLookup,
    ensureSchema: ensureCmsSchemaSerialized,
    writeVersion: writeCmsSchemaVersion,
  });
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

  const [pageRows] = await pool.query<Array<RowDataPacket & { id: string; slug: string }>>(
    "SELECT id, slug FROM pages",
  );
  const existingPages = pageRows.map((row) => ({ id: String(row.id), slug: String(row.slug) }));
  const defaults = defaultPages();
  for (const page of defaults.filter((item) => item.slug !== "/")) {
    const action = resolveDefaultPageSeed(page, existingPages);
    if (action.type === "insert") {
      const safe = sanitizePage(page);
      try {
        await pool.execute(
          `INSERT INTO pages (id, name, slug, status, cms_enabled) VALUES (?, ?, ?, ?, ?)`,
          [safe.id, safe.name, safe.slug, safe.status, safe.cmsEnabled ? 1 : 0],
        );
      } catch (error) {
        if (!mysqlDuplicateError(error)) throw error;
        continue;
      }
      existingPages.push({ id: safe.id, slug: safe.slug });
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
    const existingId = action.existingId;
    const [sectionCount] = await pool.query<CountRow[]>(
      "SELECT COUNT(*) AS n FROM page_sections WHERE page_id = ?",
      [existingId],
    );
    if (Number(sectionCount[0]?.n ?? 0) > 0) continue;
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

type PageSectionRow = RowDataPacket & {
  id: string;
  section_type: string;
  label: string;
  sort_order: number;
  visible: number;
  section_data: unknown;
};

/** Map authoritative page_sections rows into CmsSection shape used for stale-write fingerprints. */
function mapSectionRowsToCmsSections(rows: PageSectionRow[]): CmsSection[] {
  return rows.map((section) => ({
    id: String(section.id),
    type: section.section_type as SectionType,
    label: String(section.label),
    order: Number(section.sort_order) || 0,
    visible: Boolean(section.visible),
    data: parseJsonColumn(section.section_data, {} as CmsSection["data"]),
  }));
}

function sectionsFingerprint(sections: CmsSection[]): string {
  const normalized = [...sections]
    .map((section) => ({
      id: section.id,
      type: section.type,
      label: section.label,
      order: section.order,
      visible: section.visible,
      data: section.data,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(normalized);
}

/** @internal Real-MySQL integration tests only — exercises maintenance writer lock/fingerprint path. */
export async function __persistPageSectionDiffForTests(
  pageId: string,
  before: CmsSection[],
  after: CmsSection[],
) {
  return persistPageSectionDiff(pageId, before, after);
}

/** @internal Real-MySQL integration tests only. */
export async function __migrateSubscriptionPageSlugRowForTests() {
  return migrateSubscriptionPageSlugRow();
}

async function persistPageSectionDiff(
  pageId: string,
  before: CmsSection[],
  after: CmsSection[],
) {
  const afterIds = new Set(after.map((section) => section.id));
  const beforeMap = new Map(before.map((section) => [section.id, section]));
  let willMutate = false;
  for (const section of before) {
    if (!afterIds.has(section.id)) {
      willMutate = true;
      break;
    }
  }
  if (!willMutate) {
    for (const section of after) {
      const previous = beforeMap.get(section.id);
      if (!previous || JSON.stringify(previous) !== JSON.stringify(section)) {
        willMutate = true;
        break;
      }
    }
  }
  if (!willMutate) return;

  const conn = await getDbPool().getConnection();
  await conn.beginTransaction();
  try {
    // Lock pages row first (same order as savePage) before mutating page_sections.
    const [locked] = await conn.query<Array<RowDataPacket & { id: string }>>(
      "SELECT id FROM pages WHERE id = ? FOR UPDATE",
      [pageId],
    );
    if (!locked[0]) {
      throw new Error(`Page not found for section diff: ${pageId}`);
    }
    // Reject stale snapshots: re-read authoritative sections under the page lock.
    // Fingerprint uses the same row→CmsSection mapping as maintenance callers' live "before".
    const [liveRows] = await conn.query<PageSectionRow[]>(
      `SELECT id, section_type, label, sort_order, visible, section_data
       FROM page_sections
       WHERE page_id = ?
       ORDER BY sort_order ASC`,
      [pageId],
    );
    const liveSections = mapSectionRowsToCmsSections(liveRows);
    if (sectionsFingerprint(liveSections) !== sectionsFingerprint(before)) {
      throw new Error("Page sections changed during maintenance write; retry required.");
    }
    for (const section of before) {
      if (!afterIds.has(section.id)) {
        await conn.execute("DELETE FROM page_sections WHERE id = ? AND page_id = ?", [section.id, pageId]);
      }
    }
    for (const section of after) {
      const previous = beforeMap.get(section.id);
      if (previous && JSON.stringify(previous) === JSON.stringify(section)) continue;
      await conn.execute(
        `INSERT INTO page_sections
          (id, page_id, section_type, label, sort_order, visible, section_data)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           section_type = VALUES(section_type),
           label = VALUES(label),
           sort_order = VALUES(sort_order),
           visible = VALUES(visible),
           section_data = VALUES(section_data)`,
        [
          section.id,
          pageId,
          section.type,
          section.label,
          section.order,
          section.visible ? 1 : 0,
          JSON.stringify(section.data),
        ],
      );
    }
    const [bumpResult] = await conn.execute(
      "UPDATE pages SET content_revision = content_revision + 1 WHERE id = ? AND content_revision < ?",
      [pageId, MYSQL_SIGNED_INT_MAX],
    );
    if (Number((bumpResult as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
      throw new Error("Page content_revision overflow during maintenance write.");
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function cleanupDemoFaqCopy() {
  const pool = getDbPool();
  const [rows] = await pool.query<Array<RowDataPacket & { id: string; question: string; answer: string }>>(
    "SELECT id, question, answer FROM faqs",
  );
  for (const row of rows) {
    const question = rewriteDemoCopy(String(row.question || ""));
    const answer = rewriteDemoCopy(String(row.answer || ""));
    if (question === row.question && answer === row.answer) continue;
    await pool.execute("UPDATE faqs SET question = ?, answer = ? WHERE id = ?", [question, answer, row.id]);
  }
}

async function cleanupDemoPlanFeatures() {
  const pool = getDbPool();
  const [rows] = await pool.query<Array<RowDataPacket & { id: string; features: unknown }>>(
    "SELECT id, features FROM pricing_plans",
  );
  for (const row of rows) {
    const features = parseJsonColumn<string[]>(row.features, []);
    const next = features.map((feature) => rewriteDemoCopy(String(feature)));
    if (JSON.stringify(next) === JSON.stringify(features)) continue;
    await pool.execute("UPDATE pricing_plans SET features = ? WHERE id = ?", [JSON.stringify(next), row.id]);
  }
}

async function cleanupDemoBlogCopy() {
  const pool = getDbPool();
  const [rows] = await pool.query<
    Array<
      RowDataPacket & {
        id: string;
        excerpt: string;
        content: string;
        seo_title: string;
        seo_description: string;
        og_title: string;
        og_description: string;
      }
    >
  >("SELECT id, excerpt, content, seo_title, seo_description, og_title, og_description FROM blog_posts");
  for (const row of rows) {
    const excerpt = rewriteDemoCopy(String(row.excerpt || ""));
    const content = rewriteDemoCopy(String(row.content || ""));
    const seoTitle = rewriteDemoCopy(String(row.seo_title || ""));
    const seoDescription = rewriteDemoCopy(String(row.seo_description || ""));
    const ogTitle = rewriteDemoCopy(String(row.og_title || ""));
    const ogDescription = rewriteDemoCopy(String(row.og_description || ""));
    if (
      excerpt === row.excerpt &&
      content === row.content &&
      seoTitle === row.seo_title &&
      seoDescription === row.seo_description &&
      ogTitle === row.og_title &&
      ogDescription === row.og_description
    ) {
      continue;
    }
    await pool.execute(
      `UPDATE blog_posts
       SET excerpt = ?, content = ?, seo_title = ?, seo_description = ?, og_title = ?, og_description = ?
       WHERE id = ?`,
      [excerpt, content, seoTitle, seoDescription, ogTitle, ogDescription, row.id],
    );
  }
}

export async function seedSeoLongformIfNeeded() {
  await runCompletedMigrationOnce({
    flagKey: CMS_CONTENT_CLEANUP_V1,
    hasCompleted: hasMigrationFlag,
    markCompleted: markMigrationFlag,
    run: async () => {
      const pool = getDbPool();
      for (const id of ["page-home", SUBSCRIPTION_PAGE_ID, "page-contact"]) {
        const [pages] = await pool.query<
          Array<RowDataPacket & { id: string; name: string; slug: string; status: string; cms_enabled: number }>
        >("SELECT id, name, slug, status, cms_enabled FROM pages WHERE id = ? LIMIT 1", [id]);
        const row = pages[0];
        if (!row) continue;
        const [sectionRows] = await pool.query<PageSectionRow[]>(
          `SELECT id, section_type, label, sort_order, visible, section_data
           FROM page_sections
           WHERE page_id = ?
           ORDER BY sort_order ASC`,
          [row.id],
        );
        // Authoritative DB snapshot for stale-write detection — must NOT be sanitized.
        // sanitizePage() fills defaults / reindexes order and would false-conflict vs locked re-read.
        const liveSections = mapSectionRowsToCmsSections(sectionRows);
        const page: CmsPage = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          status: row.status === "draft" ? "draft" : "published",
          cmsEnabled: Boolean(row.cms_enabled),
          contentRevision: 1,
          sections: liveSections,
        };
        const safe = sanitizePage(page);
        const longform = applySeoLongformToPage(safe);
        const cleaned = applyPublicCopyCleanupToPage(longform.page);
        if (!longform.changed && !cleaned.changed) continue;
        await persistPageSectionDiff(row.id, liveSections, cleaned.page.sections);
      }
      await cleanupDemoFaqCopy();
      await cleanupDemoPlanFeatures();
      await cleanupDemoBlogCopy();
    },
  });
}

export async function cleanupKnownTestTaglineIfNeeded() {
  await runCompletedMigrationOnce({
    flagKey: TEST_TAGLINE_CLEANUP_V1,
    hasCompleted: hasMigrationFlag,
    markCompleted: markMigrationFlag,
    run: async () => {
      const pool = getDbPool();
      const [rows] = await pool.query<SettingValueRow[]>(
        "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
        [SITE_SETTINGS_KEY],
      );
      if (!rows[0]) return "deferred";
      const current = sanitizeSettings(parseJsonColumn<SiteSettings>(rows[0].setting_value, defaultSettings()));
      const next = applyPublicCopyCleanupToSettings(current);
      if (!next.changed) return;
      await pool.execute(
        `INSERT INTO site_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [SITE_SETTINGS_KEY, JSON.stringify(next.settings)],
      );
    },
  });
}

/** Indexed exact source lookup (any active state) — same UNIQUE(source_path) path as Phase 2. */
const GET_REDIRECT_BY_SOURCE_SQL =
  "SELECT id, source_path, destination_path, status_code, is_active, created_at, updated_at FROM redirects WHERE source_path = ? LIMIT 1";

type RedirectSourceRow = RowDataPacket & {
  id: string;
  source_path: string;
  destination_path: string;
  status_code: number;
  is_active: number;
  created_at: unknown;
  updated_at: unknown;
};

function mapRedirectSourceRow(row: RedirectSourceRow): RedirectRule {
  return {
    id: row.id,
    sourcePath: row.source_path,
    destinationPath: row.destination_path,
    statusCode:
      row.status_code === 302 || row.status_code === 307 || row.status_code === 308 ? row.status_code : 301,
    active: Boolean(row.is_active),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

async function loadRedirectBySourcePath(sourcePath: string) {
  const [rows] = await getDbPool().query<RedirectSourceRow[]>(GET_REDIRECT_BY_SOURCE_SQL, [
    withSlash(sourcePath),
  ]);
  return rows[0] ? mapRedirectSourceRow(rows[0]) : null;
}

/**
 * One-shot subscription page slug rewrite with page-row lock + revision bump.
 * Holds the lock only for the slug/revision mutation — not redirect/section work.
 */
async function migrateSubscriptionPageSlugRow(): Promise<"updated" | "noop"> {
  const conn = await getDbPool().getConnection();
  await conn.beginTransaction();
  try {
    const [lockedRows] = await conn.query<
      Array<RowDataPacket & { id: string; slug: string; content_revision: unknown }>
    >("SELECT id, slug, content_revision FROM pages WHERE id = ? FOR UPDATE", [SUBSCRIPTION_PAGE_ID]);
    const locked = lockedRows[0];
    if (!locked) {
      await conn.commit();
      return "noop";
    }
    const currentSlug = String(locked.slug);
    const eligible =
      currentSlug === SUBSCRIPTION_SLUG_LEGACY || currentSlug === "/iptv-subscriptions-uk";
    if (!eligible) {
      await conn.commit();
      return "noop";
    }
    const currentRevision = parseStoredContentRevision(locked.content_revision ?? 1);
    const nextRevision = nextContentRevision(currentRevision);
    const [result] = await conn.execute(
      `UPDATE pages
       SET slug = ?, content_revision = ?
       WHERE id = ? AND content_revision = ? AND (slug = ? OR slug = ?)`,
      [
        SUBSCRIPTION_SLUG,
        nextRevision,
        SUBSCRIPTION_PAGE_ID,
        currentRevision,
        SUBSCRIPTION_SLUG_LEGACY,
        "/iptv-subscriptions-uk",
      ],
    );
    if (Number((result as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
      throw new Error("Subscription slug migration lost the page row race.");
    }
    await conn.commit();
    return "updated";
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function runSubscriptionSlugMigrationBody(): Promise<void | "deferred"> {
  const pool = getDbPool();
  await migrateSubscriptionPageSlugRow();

  const [redirectRows] = await pool.query<RedirectSourceRow[]>(
    "SELECT id, source_path, destination_path, status_code, is_active, created_at, updated_at FROM redirects",
  );
  const currentRules: RedirectRule[] = redirectRows.map(mapRedirectSourceRow);
  const migrated = applySubscriptionRedirectMigration(currentRules);
  if (migrated.changed) {
    for (const rule of migrated.rules) {
      const before = currentRules.find((item) => item.id === rule.id);
      if (before && JSON.stringify(before) === JSON.stringify(rule)) continue;
      await pool.execute(
        `INSERT INTO redirects (id, source_path, destination_path, status_code, is_active)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           source_path = VALUES(source_path),
           destination_path = VALUES(destination_path),
           status_code = VALUES(status_code),
           is_active = VALUES(is_active)`,
        [rule.id, rule.sourcePath, rule.destinationPath, rule.statusCode, rule.active ? 1 : 0],
      );
    }
  }

  // Candidate page ids from a pre-scan only; authoritative remap recomputes under each page lock.
  const [sectionRows] = await pool.query<
    Array<RowDataPacket & { id: string; page_id: string; section_data: unknown }>
  >("SELECT id, page_id, section_data FROM page_sections");
  const candidatePageIds = new Set<string>();
  for (const row of sectionRows) {
    const data = parseJsonColumn(row.section_data, {} as CmsSection["data"]);
    const next = remapStructuredHrefs(data);
    if (JSON.stringify(next) === JSON.stringify(data)) continue;
    candidatePageIds.add(String(row.page_id));
  }
  const pageIds = [...candidatePageIds].sort();
  if (pageIds.length) {
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      for (const pageId of pageIds) {
        await conn.query("SELECT id FROM pages WHERE id = ? FOR UPDATE", [pageId]);
        const [liveRows] = await conn.query<
          Array<RowDataPacket & { id: string; section_data: unknown }>
        >("SELECT id, section_data FROM page_sections WHERE page_id = ? ORDER BY id ASC", [pageId]);
        let mutated = false;
        for (const row of liveRows) {
          const data = parseJsonColumn(row.section_data, {} as CmsSection["data"]);
          const next = remapStructuredHrefs(data);
          if (JSON.stringify(next) === JSON.stringify(data)) continue;
          await conn.execute("UPDATE page_sections SET section_data = ? WHERE id = ? AND page_id = ?", [
            JSON.stringify(next),
            String(row.id),
            pageId,
          ]);
          mutated = true;
        }
        if (!mutated) continue;
        const [bumpResult] = await conn.execute(
          "UPDATE pages SET content_revision = content_revision + 1 WHERE id = ? AND content_revision < ?",
          [pageId, MYSQL_SIGNED_INT_MAX],
        );
        if (Number((bumpResult as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
          throw new Error("Page content_revision overflow during slug remap.");
        }
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  const [settingRows] = await pool.query<SettingValueRow[]>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
    [SITE_SETTINGS_KEY],
  );
  if (!settingRows[0]) return "deferred";
  const current = sanitizeSettings(parseJsonColumn<SiteSettings>(settingRows[0].setting_value, defaultSettings()));
  const remapped = remapSettingsForSubscriptionUrl(current);
  if (remapped.changed) {
    await pool.execute(
      `INSERT INTO site_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [SITE_SETTINGS_KEY, JSON.stringify(remapped.settings)],
    );
  }
}

async function verifySubscriptionSlugMigrationComplete() {
  const pool = getDbPool();
  const [pages] = await pool.query<Array<RowDataPacket & { slug: string }>>(
    "SELECT slug FROM pages WHERE id = ? LIMIT 1",
    [SUBSCRIPTION_PAGE_ID],
  );
  const pageSlug = pages[0] ? String(pages[0].slug) : null;
  const legacyRedirect = await loadRedirectBySourcePath(SUBSCRIPTION_SLUG_LEGACY);
  const [settingRows] = await pool.query<SettingValueRow[]>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
    [SITE_SETTINGS_KEY],
  );
  if (!settingRows[0]) return false;
  const settings = sanitizeSettings(
    parseJsonColumn<SiteSettings>(settingRows[0].setting_value, defaultSettings()),
  );
  return isSubscriptionMigrationPostconditionMet({
    pageSlug,
    legacyRedirect,
    settings,
  });
}

export async function migrateSubscriptionPageSlugIfNeeded() {
  await runCompletedMigrationOnce({
    flagKey: SUBSCRIPTION_SLUG_MIGRATION_V1,
    hasCompleted: hasMigrationFlag,
    markCompleted: markMigrationFlag,
    run: async () => {
      const outcome = await runSubscriptionSlugMigrationBody();
      if (outcome === "deferred") return "deferred";
      if (!(await verifySubscriptionSlugMigrationComplete())) {
        throw new Error("subscription slug migration postconditions not met");
      }
    },
  });
}

/**
 * F4: exact-match subscription SEO title/meta + money-back eligibility on subscription page/FAQs.
 * Skips unknown custom title/meta; writes completion flag only after a successful run.
 */
export async function migrateSubscriptionSeoMicrocopyIfNeeded() {
  await runCompletedMigrationOnce({
    flagKey: SUBSCRIPTION_SEO_MICROCOPY_V1,
    hasCompleted: hasMigrationFlag,
    markCompleted: markMigrationFlag,
    run: async () => {
      const pool = getDbPool();
      const [settingRows] = await pool.query<SettingValueRow[]>(
        "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
        [SITE_SETTINGS_KEY],
      );
      if (!settingRows[0]) return "deferred";

      const current = sanitizeSettings(
        parseJsonColumn<SiteSettings>(settingRows[0].setting_value, defaultSettings()),
      );
      const seoApplied = applySubscriptionSeoMicrocopyToSettings(current);
      if (seoApplied.changed) {
        await pool.execute(
          `INSERT INTO site_settings (setting_key, setting_value)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [SITE_SETTINGS_KEY, JSON.stringify(seoApplied.settings)],
        );
      }

      const [sectionRows] = await pool.query<PageSectionRow[]>(
        `SELECT id, section_type, label, sort_order, visible, section_data
         FROM page_sections
         WHERE page_id = ?
         ORDER BY sort_order ASC`,
        [SUBSCRIPTION_PAGE_ID],
      );
      if (sectionRows.length) {
        // Same authoritative-before contract as longform: raw mapped rows, not sanitizePage().
        const before = mapSectionRowsToCmsSections(sectionRows);
        const money = applySubscriptionMoneyBackExactToSections(before);
        if (money.changed) {
          await persistPageSectionDiff(SUBSCRIPTION_PAGE_ID, before, money.sections);
        }
      }

      const [faqRows] = await pool.query<Array<RowDataPacket & { id: string; question: string; answer: string }>>(
        "SELECT id, question, answer FROM faqs",
      );
      const faqs: FaqItem[] = faqRows.map((row) => ({
        id: String(row.id),
        question: String(row.question || ""),
        answer: String(row.answer || ""),
        category: "",
        sortOrder: 0,
        visible: true,
        createdAt: "",
        updatedAt: "",
      }));
      const faqApplied = applySubscriptionMoneyBackExactToFaqs(faqs);
      if (faqApplied.changed) {
        for (const faq of faqApplied.faqs) {
          if (!faqApplied.updatedIds.includes(faq.id)) continue;
          await pool.execute("UPDATE faqs SET question = ?, answer = ? WHERE id = ?", [
            faq.question,
            faq.answer,
            faq.id,
          ]);
        }
      }
    },
  });

  // Title-only follow-up: v1 may have completed after meta-only success if £ encoding mismatched.
  await runCompletedMigrationOnce({
    flagKey: SUBSCRIPTION_SEO_MICROCOPY_V2,
    hasCompleted: hasMigrationFlag,
    markCompleted: markMigrationFlag,
    run: async () => {
      const pool = getDbPool();
      const [settingRows] = await pool.query<SettingValueRow[]>(
        "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
        [SITE_SETTINGS_KEY],
      );
      if (!settingRows[0]) return "deferred";

      const current = sanitizeSettings(
        parseJsonColumn<SiteSettings>(settingRows[0].setting_value, defaultSettings()),
      );
      const repaired = applySubscriptionSeoTitleRepair(current.pageSeo.subscriptions);
      if (!repaired.changed) return;

      const nextSettings: SiteSettings = {
        ...current,
        pageSeo: {
          ...current.pageSeo,
          subscriptions: repaired.seo,
        },
      };
      await pool.execute(
        `INSERT INTO site_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [SITE_SETTINGS_KEY, JSON.stringify(nextSettings)],
      );
    },
  });
}

export async function ensureBlogIndexRedirect() {
  try {
    const existing = await loadRedirectBySourcePath(BLOG_INDEX_SLUG_LEGACY);
    const { rule, changed } = resolveBlogIndexManagedRedirect(existing);
    if (!changed) return;
    const pool = getDbPool();
    try {
      await pool.execute(
        `INSERT INTO redirects (id, source_path, destination_path, status_code, is_active)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           source_path = VALUES(source_path),
           destination_path = VALUES(destination_path),
           status_code = VALUES(status_code),
           is_active = VALUES(is_active)`,
        [rule.id, rule.sourcePath, rule.destinationPath, rule.statusCode, rule.active ? 1 : 0],
      );
    } catch (error) {
      if (!mysqlDuplicateError(error)) throw error;
      await pool.execute(
        `UPDATE redirects
         SET destination_path = ?, status_code = ?, is_active = ?
         WHERE source_path = ?`,
        [rule.destinationPath, rule.statusCode, rule.active ? 1 : 0, rule.sourcePath],
      );
    }
  } catch (error) {
    console.error("[cms] blog index redirect was not applied:", error instanceof Error ? error.message : error);
  }
}
