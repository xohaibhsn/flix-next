import type { CmsPage, MediaAsset, MediaFile, PagesFile, SiteSettings } from "@/lib/cms/types";
import { defaultPages, defaultSettings } from "@/lib/cms/defaults";
import { readJsonFile, writeJsonFile } from "@/lib/cms/json-store";
import { sanitizePage, sanitizeSettings } from "@/lib/cms/validation";

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
    return Array.isArray(file.pages) ? file.pages : defaultPages();
  }

  async getPageById(id: string) {
    const pages = await this.listPages();
    return pages.find((page) => page.id === id) ?? null;
  }

  async getPageBySlug(slug: string) {
    const pages = await this.listPages();
    return pages.find((page) => page.slug === slug) ?? null;
  }

  async savePage(page: CmsPage) {
    const safe = sanitizePage(page);
    const pages = await this.listPages();
    const next = pages.some((item) => item.id === safe.id)
      ? pages.map((item) => (item.id === safe.id ? safe : item))
      : [...pages, safe];
    await writeJsonFile(PAGES_FILE, { pages: next } satisfies PagesFile);
    return safe;
  }

  async getSettings() {
    const settings = await readJsonFile<SiteSettings>(SETTINGS_FILE, defaultSettings());
    return sanitizeSettings(settings);
  }

  async saveSettings(settings: SiteSettings) {
    const safe = sanitizeSettings(settings);
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

export const cms: CmsRepository = new LocalJsonRepository();
