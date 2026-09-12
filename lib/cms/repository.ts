import type { CmsPage, MediaAsset, MediaFile, PagesFile, SiteSettings } from "@/lib/cms/types";
import type { CatalogRepository } from "@/lib/cms/catalog";
import { defaultPages, defaultSettings } from "@/lib/cms/defaults";
import { companyPageById, companyPageBySlug, mergeMissingCompanyPages } from "@/lib/cms/company-pages";
import { applyPublicCopyCleanupToPages } from "@/lib/cms/public-copy-cleanup";
import { applyPublicCopyCleanupToSettings } from "@/lib/cms/settings-cleanup";
import { applySeoLongformToPages } from "@/lib/cms/seo-longform";
import { SUBSCRIPTION_PAGE_ID, SUBSCRIPTION_SLUG, SUBSCRIPTION_SLUG_LEGACY } from "@/lib/cms/page-paths";
import { withSlash } from "@/lib/cms/redirects";
import { duplicateSlugError } from "@/lib/cms/slug-change";
import {
  migrateSubscriptionPageRecord,
  remapPageStructuredHrefs,
} from "@/lib/cms/subscription-url-migrate";
import { JsonCatalogRepository } from "@/lib/cms/json-catalog";
import { readJsonFile, writeJsonFile } from "@/lib/cms/json-store";
import { MysqlCatalogRepository } from "@/lib/cms/mysql-catalog";
import { MysqlCmsRepository, MysqlWithBuildFallback } from "@/lib/cms/mysql-repository";
import { sanitizePage, sanitizeSettings } from "@/lib/cms/validation";
import { isDatabaseConfigured } from "@/lib/db/config";

const PAGES_FILE = "pages.json";
const SETTINGS_FILE = "site-settings.json";
const MEDIA_FILE = "media.json";

export interface CmsRepository {
  listPages(): Promise<CmsPage[]>;
  getPageById(id: string): Promise<CmsPage | null>;
  getPageBySlug(slug: string): Promise<CmsPage | null>;
  savePage(page: CmsPage): Promise<CmsPage>;
  getSettings(): Promise<SiteSettings>;
  saveSettings(settings: SiteSettings): Promise<SiteSettings>;
  listMedia(): Promise<MediaAsset[]>;
  getMediaById(id: string): Promise<MediaAsset | null>;
  addMedia(asset: MediaAsset): Promise<MediaAsset>;
  removeMedia(id: string): Promise<void>;
}

export class LocalJsonRepository implements CmsRepository {
  async listPages() {
    const file = await readJsonFile<PagesFile>(PAGES_FILE, { pages: defaultPages() });
    const raw = Array.isArray(file.pages) ? file.pages : defaultPages();
    const defaults = defaultPages();
    let migratedChanged = false;
    const pages = raw.map((page) => {
      const migrated = migrateSubscriptionPageRecord(page);
      const hrefs = remapPageStructuredHrefs(migrated.page);
      if (migrated.changed || hrefs.changed) migratedChanged = true;
      const next = hrefs.page;
      if (
        (next.id === SUBSCRIPTION_PAGE_ID ||
          next.slug === SUBSCRIPTION_SLUG ||
          next.slug === SUBSCRIPTION_SLUG_LEGACY ||
          companyPageBySlug(next.slug) ||
          companyPageById(next.id)) &&
        (!next.sections || next.sections.length === 0)
      ) {
        const fallback = defaults.find((item) => item.id === next.id) ?? defaults.find((item) => item.slug === next.slug);
        if (fallback) return { ...next, cmsEnabled: true, sections: fallback.sections };
      }
      return next;
    });
    const merged = mergeMissingCompanyPages(pages);
    const longform = applySeoLongformToPages(merged.pages.map((page) => sanitizePage(page)));
    const cleaned = applyPublicCopyCleanupToPages(longform.pages);
    if (migratedChanged || longform.changed || cleaned.changed) {
      await writeJsonFile(PAGES_FILE, { pages: cleaned.pages } satisfies PagesFile);
    }
    return cleaned.pages;
  }

  async getPageById(id: string) {
    const pages = await this.listPages();
    return pages.find((page) => page.id === id) ?? null;
  }

  async getPageBySlug(slug: string) {
    const pages = await this.listPages();
    return pages.find((page) => withSlash(page.slug) === withSlash(slug)) ?? null;
  }

  async savePage(page: CmsPage) {
    const safe = sanitizePage(page);
    const pages = await this.listPages();
    if (pages.some((item) => item.id !== safe.id && withSlash(item.slug) === withSlash(safe.slug))) {
      throw duplicateSlugError();
    }
    const next = pages.some((item) => item.id === safe.id)
      ? pages.map((item) => (item.id === safe.id ? safe : item))
      : [...pages, safe];
    await writeJsonFile(PAGES_FILE, { pages: next } satisfies PagesFile);
    return safe;
  }

  async getSettings() {
    const settings = await readJsonFile<SiteSettings>(SETTINGS_FILE, defaultSettings());
    const safe = sanitizeSettings(settings);
    const cleaned = applyPublicCopyCleanupToSettings(safe);
    if (cleaned.changed) {
      await writeJsonFile(SETTINGS_FILE, cleaned.settings);
    }
    return cleaned.settings;
  }

  async saveSettings(settings: SiteSettings) {
    const safe = applyPublicCopyCleanupToSettings(sanitizeSettings(settings)).settings;
    await writeJsonFile(SETTINGS_FILE, safe);
    return safe;
  }

  async listMedia() {
    const file = await readJsonFile<MediaFile>(MEDIA_FILE, { assets: [] });
    return Array.isArray(file.assets) ? file.assets : [];
  }

  async getMediaById(id: string) {
    const assets = await this.listMedia();
    return assets.find((asset) => asset.id === id) ?? null;
  }

  async addMedia(asset: MediaAsset) {
    const assets = await this.listMedia();
    const next = [asset, ...assets.filter((item) => item.id !== asset.id)];
    await writeJsonFile(MEDIA_FILE, { assets: next } satisfies MediaFile);
    return asset;
  }

  async removeMedia(id: string) {
    const assets = await this.listMedia();
    await writeJsonFile(MEDIA_FILE, {
      assets: assets.filter((asset) => asset.id !== id),
    } satisfies MediaFile);
  }
}

export type Cms = CmsRepository & CatalogRepository;

function mergeCms(pages: CmsRepository, catalog: CatalogRepository): Cms {
  return new Proxy({} as Cms, {
    get(_, prop) {
      const source = prop in pages ? pages : catalog;
      const value = Reflect.get(source as object, prop);
      return typeof value === "function" ? value.bind(source) : value;
    },
  });
}

const jsonCms = new LocalJsonRepository();
const jsonCatalog = new JsonCatalogRepository();
const useMysql = isDatabaseConfigured();

if (process.env.NEXT_PHASE !== "phase-production-build") {
  console.info(`[cms] persistence adapter: ${useMysql ? "mysql" : "json"}`);
}

function createMysqlCms(): Cms {
  const mysqlPages = new MysqlCmsRepository();
  const mysqlCatalog = new MysqlCatalogRepository(() => mysqlPages.ready());
  return mergeCms(new MysqlWithBuildFallback(mysqlPages, jsonCms), mysqlCatalog);
}

export const cms: Cms = useMysql ? createMysqlCms() : mergeCms(jsonCms, jsonCatalog);
