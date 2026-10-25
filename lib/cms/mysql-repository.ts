import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { defaultSettings } from "@/lib/cms/defaults";
import {
  SITE_SETTINGS_KEY,
  ensureCmsSchemaCurrent,
  fromMysqlDateTime,
  insertMediaRow,
  parseJsonColumn,
  seedCmsIfEmpty,
  seedExtendedIfEmpty,
  seedManagedRedirectsIfNeeded,
  migrateSubscriptionPageSlugIfNeeded,
  migrateSubscriptionSeoMicrocopyIfNeeded,
  ensureBlogIndexRedirect,
  seedSeoLongformIfNeeded,
  cleanupKnownTestTaglineIfNeeded,
} from "@/lib/cms/mysql-migrate";
import type { CmsPage, CmsSection, MediaAsset, SectionType, SiteSettings } from "@/lib/cms/types";
import { sanitizePage, sanitizeSettings } from "@/lib/cms/validation";
import { applyPublicCopyCleanupToSettings } from "@/lib/cms/settings-cleanup";
import { withSlash } from "@/lib/cms/redirects";
import { duplicateSlugError, mysqlDuplicateError } from "@/lib/cms/slug-change";
import { runMysqlWithBuildFallback } from "@/lib/cms/mysql-build-fallback";
import {
  nextContentRevision,
  parseExpectedContentRevision,
  parseStoredContentRevision,
  PageConflictError,
} from "@/lib/cms/page-revision";
import { ClientError } from "@/lib/security/errors";
import { getDbPool, withTransaction } from "@/lib/db/pool";
import { runCmsReadyInitialization } from "@/lib/cms/schema-ensure-freeze";
import { isCmsWriteFreezeActive, isCmsWriteFreezeError } from "@/lib/cms/write-freeze";

type PageRow = RowDataPacket & {
  id: string;
  name: string;
  slug: string;
  status: string;
  cms_enabled: number;
  content_revision?: unknown;
};

type SectionRow = RowDataPacket & {
  id: string;
  page_id: string;
  section_type: string;
  label: string;
  sort_order: number;
  visible: number;
  section_data: unknown;
};

type SettingsRow = RowDataPacket & {
  setting_key: string;
  setting_value: unknown;
};

type MediaRow = RowDataPacket & {
  id: string;
  public_id: string;
  secure_url: string;
  filename: string;
  width: number | null;
  height: number | null;
  format: string;
  resource_type: string;
  folder: string;
  bytes: number | null;
  alt: string;
  created_at: unknown;
};

function cmsDbError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown database error";
  return new Error(`CMS MySQL is unavailable. ${message}`);
}

function mapSection(row: SectionRow): CmsSection {
  return {
    id: String(row.id),
    type: row.section_type as SectionType,
    label: String(row.label),
    order: Number(row.sort_order) || 0,
    visible: Boolean(row.visible),
    data: parseJsonColumn(row.section_data, {} as CmsSection["data"]),
  };
}

function mapPage(page: PageRow, sections: SectionRow[]): CmsPage {
  return sanitizePage({
    id: page.id,
    name: page.name,
    slug: page.slug,
    status: page.status === "draft" ? "draft" : "published",
    cmsEnabled: Boolean(page.cms_enabled),
    contentRevision: parseStoredContentRevision(page.content_revision ?? 1),
    sections: sections
      .filter((section) => section.page_id === page.id)
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      .map(mapSection),
  });
}

function mapMedia(row: MediaRow): MediaAsset {
  return {
    id: row.id,
    publicId: row.public_id,
    secureUrl: row.secure_url,
    folder: row.folder,
    originalFilename: row.filename,
    format: row.format,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    resourceType: row.resource_type,
    createdAt: fromMysqlDateTime(row.created_at),
    alt: row.alt || "",
  };
}

export class MysqlCmsRepository {
  private readyPromise: Promise<void> | null = null;

  private async ensureReady() {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        await runCmsReadyInitialization({
          ensureSchemaCurrent: () => ensureCmsSchemaCurrent(),
          isFreezeActive: () => isCmsWriteFreezeActive(),
          runPostSchemaMutations: async () => {
            await seedCmsIfEmpty();
            await migrateSubscriptionPageSlugIfNeeded();
            await seedExtendedIfEmpty();
            await seedManagedRedirectsIfNeeded();
            await ensureBlogIndexRedirect();
            await seedSeoLongformIfNeeded();
            await cleanupKnownTestTaglineIfNeeded();
            await migrateSubscriptionSeoMicrocopyIfNeeded();
            const { bootstrapAdminUsersAfterSchemaReady } = await import("@/lib/auth/admin-users");
            await bootstrapAdminUsersAfterSchemaReady({ allowEmergency: true });
          },
        });
      })().catch((error) => {
        this.readyPromise = null;
        // Preserve freeze denial so callers/actions can map cms_write_freeze distinctly.
        if (isCmsWriteFreezeError(error)) throw error;
        throw cmsDbError(error);
      });
    }
    await this.readyPromise;
  }

  ready() {
    return this.ensureReady();
  }

  async listPages() {
    await this.ensureReady();
    const pool = getDbPool();
    const [pages] = await pool.query<PageRow[]>(
      "SELECT id, name, slug, status, cms_enabled, content_revision FROM pages ORDER BY name ASC",
    );
    if (pages.length === 0) return [];
    const [sections] = await pool.query<SectionRow[]>(
      `SELECT id, page_id, section_type, label, sort_order, visible, section_data
       FROM page_sections
       ORDER BY sort_order ASC`,
    );
    return pages.map((page) => mapPage(page, sections));
  }

  async getPageById(id: string) {
    const pages = await this.listPages();
    return pages.find((page) => page.id === id) ?? null;
  }

  async getPageBySlug(slug: string) {
    await this.ensureReady();
    const pool = getDbPool();
    const want = withSlash(slug);
    const slugs = want === "/" ? ["/"] : [want, want.replace(/\/$/, "")];
    const [pages] = await pool.query<PageRow[]>(
      `SELECT id, name, slug, status, cms_enabled, content_revision FROM pages WHERE slug IN (${slugs.map(() => "?").join(", ")}) LIMIT 1`,
      slugs,
    );
    const page = pages[0];
    if (!page) return null;
    const [sections] = await pool.query<SectionRow[]>(
      `SELECT id, page_id, section_type, label, sort_order, visible, section_data
       FROM page_sections
       WHERE page_id = ?
       ORDER BY sort_order ASC`,
      [page.id],
    );
    return mapPage(page, sections);
  }

  async savePage(page: CmsPage) {
    await this.ensureReady();
    const expectedRevision = parseExpectedContentRevision(page.contentRevision);
    if (expectedRevision == null) {
      throw new PageConflictError();
    }
    const safe = sanitizePage(page);
    let savedRevision = expectedRevision;
    try {
      await withTransaction(async (conn) => {
        const [lockedRows] = await conn.query<PageRow[]>(
          "SELECT id, content_revision FROM pages WHERE id = ? FOR UPDATE",
          [safe.id],
        );
        const locked = lockedRows[0];
        if (!locked) {
          throw new ClientError("Page not found.");
        }
        const currentRevision = parseStoredContentRevision(locked.content_revision);
        if (currentRevision !== expectedRevision) {
          throw new PageConflictError();
        }
        const nextRevision = nextContentRevision(currentRevision);
        const [casResult] = await conn.execute(
          `UPDATE pages
           SET name = ?, slug = ?, status = ?, cms_enabled = ?, content_revision = ?
           WHERE id = ? AND content_revision = ?`,
          [
            safe.name,
            safe.slug,
            safe.status,
            safe.cmsEnabled ? 1 : 0,
            nextRevision,
            safe.id,
            expectedRevision,
          ],
        );
        const affected = Number((casResult as { affectedRows?: number }).affectedRows ?? 0);
        if (affected !== 1) {
          throw new PageConflictError();
        }
        await conn.execute("DELETE FROM page_sections WHERE page_id = ?", [safe.id]);
        for (const section of safe.sections) {
          await conn.execute(
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
        savedRevision = nextRevision;
      });
    } catch (error) {
      if (error instanceof PageConflictError || error instanceof ClientError) throw error;
      if (mysqlDuplicateError(error)) throw duplicateSlugError();
      throw error;
    }
    return { ...safe, contentRevision: savedRevision };
  }

  async getSettings() {
    await this.ensureReady();
    const [rows] = await getDbPool().query<SettingsRow[]>(
      "SELECT setting_key, setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
      [SITE_SETTINGS_KEY],
    );
    const value = parseJsonColumn<SiteSettings>(rows[0]?.setting_value, defaultSettings());
    return applyPublicCopyCleanupToSettings(sanitizeSettings(value)).settings;
  }

  async saveSettings(settings: SiteSettings) {
    await this.ensureReady();
    const safe = applyPublicCopyCleanupToSettings(sanitizeSettings(settings)).settings;
    await getDbPool().execute(
      `INSERT INTO site_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [SITE_SETTINGS_KEY, JSON.stringify(safe)],
    );
    return safe;
  }

  async listMedia() {
    await this.ensureReady();
    const [rows] = await getDbPool().query<MediaRow[]>(
      `SELECT id, public_id, secure_url, filename, width, height, format,
              resource_type, folder, bytes, alt, created_at
       FROM media_assets
       ORDER BY created_at DESC`,
    );
    return rows.map(mapMedia);
  }

  async getMediaById(id: string) {
    await this.ensureReady();
    const [rows] = await getDbPool().query<MediaRow[]>(
      `SELECT id, public_id, secure_url, filename, width, height, format,
              resource_type, folder, bytes, alt, created_at
       FROM media_assets
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    return rows[0] ? mapMedia(rows[0]) : null;
  }

  async addMedia(asset: MediaAsset) {
    await this.ensureReady();
    const conn = await getDbPool().getConnection();
    try {
      await insertMediaRow(conn, asset);
    } finally {
      conn.release();
    }
    return asset;
  }

  async updateMediaAlt(id: string, alt: string) {
    await this.ensureReady();
    const current = await this.getMediaById(id);
    if (!current) return null;
    await getDbPool().execute("UPDATE media_assets SET alt = ? WHERE id = ?", [alt, id]);
    return { ...current, alt };
  }

  async removeMedia(id: string) {
    await this.ensureReady();
    await getDbPool().execute("DELETE FROM media_assets WHERE id = ?", [id]);
  }
}

type CmsOps = {
  listPages: () => Promise<CmsPage[]>;
  getPageById: (id: string) => Promise<CmsPage | null>;
  getPageBySlug: (slug: string) => Promise<CmsPage | null>;
  savePage: (page: CmsPage) => Promise<CmsPage>;
  getSettings: () => Promise<SiteSettings>;
  saveSettings: (settings: SiteSettings) => Promise<SiteSettings>;
  listMedia: () => Promise<MediaAsset[]>;
  getMediaById: (id: string) => Promise<MediaAsset | null>;
  addMedia: (asset: MediaAsset) => Promise<MediaAsset>;
  updateMediaAlt: (id: string, alt: string) => Promise<MediaAsset | null>;
  removeMedia: (id: string) => Promise<void>;
};

export class MysqlWithBuildFallback implements CmsOps {
  constructor(
    private readonly mysql: CmsOps,
    private readonly json: CmsOps,
  ) {}

  /** Reads may use JSON only during Next production builds. Mutations never fall back. */
  private async runRead<T>(mysqlOp: () => Promise<T>, jsonOp: () => Promise<T>): Promise<T> {
    try {
      return await runMysqlWithBuildFallback(mysqlOp, jsonOp, () => {
        console.warn("MySQL CMS unavailable during production build; using JSON snapshot.");
      });
    } catch (error) {
      throw error instanceof Error ? error : cmsDbError(error);
    }
  }

  private async runMutation<T>(mysqlOp: () => Promise<T>): Promise<T> {
    try {
      return await mysqlOp();
    } catch (error) {
      throw error instanceof Error ? error : cmsDbError(error);
    }
  }

  listPages() {
    return this.runRead(() => this.mysql.listPages(), () => this.json.listPages());
  }
  getPageById(id: string) {
    return this.runRead(() => this.mysql.getPageById(id), () => this.json.getPageById(id));
  }
  getPageBySlug(slug: string) {
    return this.runRead(() => this.mysql.getPageBySlug(slug), () => this.json.getPageBySlug(slug));
  }
  savePage(page: CmsPage) {
    return this.runMutation(() => this.mysql.savePage(page));
  }
  getSettings() {
    return this.runRead(() => this.mysql.getSettings(), () => this.json.getSettings());
  }
  saveSettings(settings: SiteSettings) {
    return this.runMutation(() => this.mysql.saveSettings(settings));
  }
  listMedia() {
    return this.runRead(() => this.mysql.listMedia(), () => this.json.listMedia());
  }
  getMediaById(id: string) {
    return this.runRead(() => this.mysql.getMediaById(id), () => this.json.getMediaById(id));
  }
  addMedia(asset: MediaAsset) {
    return this.runMutation(() => this.mysql.addMedia(asset));
  }
  updateMediaAlt(id: string, alt: string) {
    return this.runMutation(() => this.mysql.updateMediaAlt(id, alt));
  }
  removeMedia(id: string) {
    return this.runMutation(() => this.mysql.removeMedia(id));
  }
}
