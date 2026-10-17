import type { CmsPage, MediaAsset, MediaFile, PagesFile, SiteSettings } from "@/lib/cms/types";
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
import { readFile } from "fs/promises";
import {
  assertCmsJsonWritesAllowed,
  dataFile,
  readJsonFile,
  withJsonFileLock,
  writeJsonFile,
  writeJsonFileInLock,
} from "@/lib/cms/json-store";
import { sanitizePage, sanitizeSettings } from "@/lib/cms/validation";
import {
  defaultContentRevision,
  nextContentRevision,
  parseExpectedContentRevision,
  PageConflictError,
} from "@/lib/cms/page-revision";
import { ClientError } from "@/lib/security/errors";
import { cmsJsonWritesAllowed } from "@/lib/db/config";

const PAGES_FILE = "pages.json";
const SETTINGS_FILE = "site-settings.json";
const MEDIA_FILE = "media.json";

/** Test-only barrier inside the pages.json lock (after read, before optional write). */
let pagesFileBarrierForTests: (() => Promise<void>) | null = null;

/** @internal */
export function __setPagesFileBarrierForTests(barrier: (() => Promise<void>) | null) {
  pagesFileBarrierForTests = barrier;
}

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
  updateMediaAlt(id: string, alt: string): Promise<MediaAsset | null>;
  removeMedia(id: string): Promise<void>;
}

async function readPagesSnapshotUnlocked(): Promise<CmsPage[]> {
  try {
    const raw = await readFile(dataFile(PAGES_FILE), "utf8");
    const file = JSON.parse(raw) as PagesFile;
    return Array.isArray(file.pages) ? file.pages : defaultPages();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultPages();
    throw error;
  }
}

function transformPagesSnapshot(raw: CmsPage[]): { pages: CmsPage[]; shouldPersist: boolean } {
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
      const fallback =
        defaults.find((item) => item.id === next.id) ?? defaults.find((item) => item.slug === next.slug);
      if (fallback) {
        return {
          ...next,
          cmsEnabled: true,
          contentRevision: defaultContentRevision(next.contentRevision),
          sections: fallback.sections,
        };
      }
    }
    return {
      ...next,
      contentRevision: defaultContentRevision(next.contentRevision),
    };
  });
  const merged = mergeMissingCompanyPages(pages);
  const longform = applySeoLongformToPages(merged.pages.map((page) => sanitizePage(page)));
  const cleaned = applyPublicCopyCleanupToPages(longform.pages);
  const shouldPersist = migratedChanged || merged.changed || longform.changed || cleaned.changed;
  return { pages: cleaned.pages, shouldPersist };
}

export class LocalJsonRepository implements CmsRepository {
  async listPages() {
    // Entire read → transform → optional write shares the same process-local pages lock as savePage.
    return withJsonFileLock(PAGES_FILE, async () => {
      const raw = await readPagesSnapshotUnlocked();
      const { pages, shouldPersist } = transformPagesSnapshot(raw);
      if (pagesFileBarrierForTests) {
        await pagesFileBarrierForTests();
      }
      if (shouldPersist && cmsJsonWritesAllowed()) {
        await writeJsonFileInLock(PAGES_FILE, { pages } satisfies PagesFile);
      }
      return pages;
    });
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
    // Local/dev only. Same-process lock serializes vs listPages migrations.
    // Not cross-process / multi-worker safe. Production/build refuse JSON writes.
    assertCmsJsonWritesAllowed();
    const expectedRevision = parseExpectedContentRevision(page.contentRevision);
    if (expectedRevision == null) {
      throw new PageConflictError();
    }
    const safe = sanitizePage(page);

    return withJsonFileLock(PAGES_FILE, async () => {
      const rawPages = await readPagesSnapshotUnlocked();
      const pages = rawPages.map((item) =>
        sanitizePage({
          ...item,
          contentRevision: defaultContentRevision(item.contentRevision),
        }),
      );
      if (pages.some((item) => item.id !== safe.id && withSlash(item.slug) === withSlash(safe.slug))) {
        throw duplicateSlugError();
      }
      const existing = pages.find((item) => item.id === safe.id);
      if (!existing) {
        throw new ClientError("Page not found.");
      }
      if (existing.contentRevision !== expectedRevision) {
        throw new PageConflictError();
      }
      if (pagesFileBarrierForTests) {
        await pagesFileBarrierForTests();
      }
      const saved = { ...safe, contentRevision: nextContentRevision(expectedRevision) };
      const next = pages.map((item) => (item.id === safe.id ? saved : item));
      await writeJsonFileInLock(PAGES_FILE, { pages: next } satisfies PagesFile);
      return saved;
    });
  }

  async getSettings() {
    const settings = await readJsonFile<SiteSettings>(SETTINGS_FILE, defaultSettings());
    const safe = sanitizeSettings(settings);
    const cleaned = applyPublicCopyCleanupToSettings(safe);
    if (cleaned.changed && cmsJsonWritesAllowed()) {
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

  async updateMediaAlt(id: string, alt: string) {
    const assets = await this.listMedia();
    const current = assets.find((asset) => asset.id === id);
    if (!current) return null;
    const next = assets.map((asset) => (asset.id === id ? { ...asset, alt } : asset));
    await writeJsonFile(MEDIA_FILE, { assets: next } satisfies MediaFile);
    return { ...current, alt };
  }

  async removeMedia(id: string) {
    const assets = await this.listMedia();
    await writeJsonFile(MEDIA_FILE, {
      assets: assets.filter((asset) => asset.id !== id),
    } satisfies MediaFile);
  }
}
