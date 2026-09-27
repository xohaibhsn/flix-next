import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { fromMysqlDateTime } from "@/lib/cms/mysql-migrate";
import { cms } from "@/lib/cms/repository";
import type {
  SitemapCategoryRow,
  SitemapPageRow,
  SitemapPostRow,
} from "@/lib/cms/sitemap-build";
import type { SiteSettings } from "@/lib/cms/types";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getDbPool } from "@/lib/db/pool";

type PageLiteRow = RowDataPacket & { id: string; slug: string; status: string };
type PostLiteRow = RowDataPacket & {
  slug: string;
  status: string;
  sitemap_include: number;
  updated_at: unknown;
};
type CategoryLiteRow = RowDataPacket & {
  slug: string;
  is_active: number;
  updated_at: unknown;
};

async function listSitemapPagesMysql(): Promise<SitemapPageRow[]> {
  const [rows] = await getDbPool().query<PageLiteRow[]>(
    "SELECT id, slug, status FROM pages ORDER BY name ASC",
  );
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    status: row.status === "published" ? "published" : "draft",
  }));
}

async function listSitemapPostsMysql(): Promise<SitemapPostRow[]> {
  const [rows] = await getDbPool().query<PostLiteRow[]>(
    "SELECT slug, status, sitemap_include, updated_at FROM blog_posts ORDER BY slug ASC",
  );
  return rows.map((row) => ({
    slug: row.slug,
    status: row.status === "published" ? "published" : "draft",
    sitemapInclude: Boolean(row.sitemap_include),
    updatedAt: fromMysqlDateTime(row.updated_at),
  }));
}

async function listSitemapCategoriesMysql(): Promise<SitemapCategoryRow[]> {
  const [rows] = await getDbPool().query<CategoryLiteRow[]>(
    "SELECT slug, is_active, updated_at FROM blog_categories ORDER BY slug ASC",
  );
  return rows.map((row) => ({
    slug: row.slug,
    active: Boolean(row.is_active),
    updatedAt: fromMysqlDateTime(row.updated_at),
  }));
}

async function listSitemapPagesJson(): Promise<SitemapPageRow[]> {
  const pages = await cms.listPages();
  return pages.map((page) => ({
    id: page.id,
    slug: page.slug,
    status: page.status,
  }));
}

async function listSitemapPostsJson(): Promise<SitemapPostRow[]> {
  const posts = await cms.listPosts();
  return posts.map((post) => ({
    slug: post.slug,
    status: post.status,
    sitemapInclude: post.sitemapInclude,
    updatedAt: post.updatedAt,
  }));
}

async function listSitemapCategoriesJson(): Promise<SitemapCategoryRow[]> {
  const categories = await cms.listCategories();
  return categories.map((category) => ({
    slug: category.slug,
    active: category.active,
    updatedAt: category.updatedAt,
  }));
}

/** Minimal CMS reads for sitemap.xml — skips section blobs and post body columns. */
export async function loadSitemapSource(): Promise<{
  settings: SiteSettings;
  pages: SitemapPageRow[];
  posts: SitemapPostRow[];
  categories: SitemapCategoryRow[];
  loadedPageSections: boolean;
}> {
  const settings = await cms.getSettings();
  if (isDatabaseConfigured()) {
    const [pages, posts, categories] = await Promise.all([
      listSitemapPagesMysql(),
      listSitemapPostsMysql(),
      listSitemapCategoriesMysql(),
    ]);
    return { settings, pages, posts, categories, loadedPageSections: false };
  }
  const [pages, posts, categories] = await Promise.all([
    listSitemapPagesJson(),
    listSitemapPostsJson(),
    listSitemapCategoriesJson(),
  ]);
  return { settings, pages, posts, categories, loadedPageSections: false };
}
