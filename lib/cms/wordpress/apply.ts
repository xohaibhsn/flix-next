import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import mysql from "mysql2/promise";
import { createId } from "@/lib/cms/ids";
import { slugify } from "@/lib/cms/slug";
import { sanitizeCategory, sanitizePost } from "@/lib/cms/validation";
import type { WordpressImportPlan, WpPostPlan } from "@/lib/cms/wordpress/extract";
import { getDbConfig } from "@/lib/db/config";
import { isCloudinaryConfigured, uploadImageBuffer } from "@/lib/cloudinary";

export type ApplyOptions = {
  overwrite?: boolean;
  mediaRoot?: string;
};

export type ApplyResult = {
  inserted: number;
  skippedExisting: number;
  conflicts: string[];
  mediaUploaded: number;
  mediaMissing: number;
};

function toMysqlDateTime(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function readMaybeGzip(path: string) {
  if (path.endsWith(".gz")) {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      createReadStream(path)
        .pipe(createGunzip())
        .on("data", (chunk) => chunks.push(chunk as Buffer))
        .on("end", () => resolve())
        .on("error", reject);
    });
    return Buffer.concat(chunks).toString("utf8");
  }
  return readFile(path, "utf8");
}

export async function readWordpressDump(path: string) {
  const info = await stat(path);
  if (info.size > 300 * 1024 * 1024) {
    throw new Error("SQL dump is larger than 300MB. Split it or gzip a smaller export.");
  }
  const sql = await readMaybeGzip(path);
  return sql.replace(/^\uFEFF/, "");
}

export async function applyWordpressPlan(plan: WordpressImportPlan, options: ApplyOptions = {}): Promise<ApplyResult> {
  const config = getDbConfig();
  if (!config) {
    throw new Error("MySQL is not configured. Set DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD.");
  }
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.name,
    charset: "utf8mb4",
  });

  const result: ApplyResult = {
    inserted: 0,
    skippedExisting: 0,
    conflicts: [],
    mediaUploaded: 0,
    mediaMissing: 0,
  };

  try {
    const [postRows] = await conn.query<Array<mysql.RowDataPacket & { id: string; slug: string }>>(
      "SELECT id, slug FROM blog_posts",
    );
    const existingById = new Map(postRows.map((row) => [row.id, row]));
    const existingBySlug = new Map(postRows.map((row) => [row.slug, row]));

    const [catRows] = await conn.query<Array<mysql.RowDataPacket & { id: string; slug: string }>>(
      "SELECT id, slug FROM blog_categories",
    );
    const categoryIdBySlug = new Map(catRows.map((row) => [row.slug, row.id]));

    for (const category of plan.categories) {
      const slug = slugify(category.slug || category.name);
      if (categoryIdBySlug.has(slug)) continue;
      const safe = sanitizeCategory({
        id: `wp-cat-${category.termId}`,
        name: category.name,
        slug,
        description: "",
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await conn.execute(
        `INSERT IGNORE INTO blog_categories (id, name, slug, description, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [safe.id, safe.name, safe.slug, safe.description, safe.active ? 1 : 0],
      );
      categoryIdBySlug.set(safe.slug, safe.id);
    }

    for (const post of plan.posts) {
      const outcome = await importOnePost(conn, post, {
        existingById,
        existingBySlug,
        categoryIdBySlug,
        overwrite: Boolean(options.overwrite),
        mediaRoot: options.mediaRoot,
        cloudinary: isCloudinaryConfigured(),
      });
      if (outcome === "inserted") result.inserted += 1;
      else if (outcome === "skipped") result.skippedExisting += 1;
      else if (outcome.startsWith("conflict:")) {
        result.conflicts.push(outcome.slice("conflict:".length));
      } else if (outcome === "media-missing") {
        result.inserted += 1;
        result.mediaMissing += 1;
      } else if (outcome === "media-uploaded") {
        result.inserted += 1;
        result.mediaUploaded += 1;
      }
    }
  } finally {
    await conn.end();
  }

  return result;
}

async function importOnePost(
  conn: mysql.Connection,
  post: WpPostPlan,
  ctx: {
    existingById: Map<string, { id: string; slug: string }>;
    existingBySlug: Map<string, { id: string; slug: string }>;
    categoryIdBySlug: Map<string, string>;
    overwrite: boolean;
    mediaRoot?: string;
    cloudinary: boolean;
  },
) {
  const slug = slugify(post.slug || post.title);
  const existingId = ctx.existingById.get(post.stableId);
  const existingSlug = ctx.existingBySlug.get(slug);
  if (existingId && !ctx.overwrite) return "skipped";
  if (existingSlug && existingSlug.id !== post.stableId) {
    return `conflict:slug '${slug}' already belongs to ${existingSlug.id}; WordPress post ${post.wpId} was not imported`;
  }

  let featuredImage = null as { id: string; publicId: string; secureUrl: string } | null;
  let mediaNote: "media-uploaded" | "media-missing" | null = null;
  if (post.featuredImage) {
    const uploaded = await tryUploadFeatured(conn, post, ctx.mediaRoot, ctx.cloudinary);
    if (uploaded) {
      featuredImage = uploaded;
      mediaNote = "media-uploaded";
    } else {
      mediaNote = "media-missing";
    }
  }

  const categoryId = post.categorySlugs.map((item) => ctx.categoryIdBySlug.get(item)).find(Boolean) || null;
  const safe = sanitizePost({
    id: post.stableId,
    title: post.title,
    slug,
    excerpt: post.excerpt,
    content: post.content,
    categoryId,
    featuredImage,
    status: post.status,
    featured: false,
    publishedAt: post.publishedAt,
    createdAt: post.publishedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    focusKeyword: post.focusKeyword,
    canonicalUrl: post.canonicalUrl,
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: post.ogTitle,
    ogDescription: post.ogDescription,
    ogImage: featuredImage,
    sitemapInclude: post.status === "published",
  });

  await conn.execute(
    `INSERT INTO blog_posts (
      id, title, slug, excerpt, content, category_id, featured_image, status, featured, published_at,
      seo_title, seo_description, focus_keyword, canonical_url, robots_index, robots_follow,
      og_title, og_description, og_image, sitemap_include
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title), slug = VALUES(slug), excerpt = VALUES(excerpt), content = VALUES(content),
      category_id = VALUES(category_id), featured_image = VALUES(featured_image), status = VALUES(status),
      featured = VALUES(featured), published_at = VALUES(published_at), seo_title = VALUES(seo_title),
      seo_description = VALUES(seo_description), focus_keyword = VALUES(focus_keyword),
      canonical_url = VALUES(canonical_url), robots_index = VALUES(robots_index), robots_follow = VALUES(robots_follow),
      og_title = VALUES(og_title), og_description = VALUES(og_description), og_image = VALUES(og_image),
      sitemap_include = VALUES(sitemap_include)`,
    [
      safe.id,
      safe.title,
      safe.slug,
      safe.excerpt,
      safe.content,
      safe.categoryId,
      JSON.stringify(safe.featuredImage),
      safe.status,
      safe.featured ? 1 : 0,
      toMysqlDateTime(safe.publishedAt),
      safe.seoTitle,
      safe.seoDescription,
      safe.focusKeyword,
      safe.canonicalUrl,
      safe.robotsIndex ? 1 : 0,
      safe.robotsFollow ? 1 : 0,
      safe.ogTitle,
      safe.ogDescription,
      JSON.stringify(safe.ogImage),
      safe.sitemapInclude ? 1 : 0,
    ],
  );

  ctx.existingById.set(safe.id, { id: safe.id, slug: safe.slug });
  ctx.existingBySlug.set(safe.slug, { id: safe.id, slug: safe.slug });
  if (!ctx.overwrite && mediaNote === "media-missing") return "media-missing";
  if (!ctx.overwrite && mediaNote === "media-uploaded") return "media-uploaded";
  return "inserted";
}

async function tryUploadFeatured(
  conn: mysql.Connection,
  post: WpPostPlan,
  mediaRoot: string | undefined,
  cloudinary: boolean,
) {
  const image = post.featuredImage;
  if (!image) return null;
  const relative = image.attachedFile.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!mediaRoot || !relative || !cloudinary) return null;
  try {
    const filePath = `${mediaRoot.replace(/\\/g, "/")}/wp-content/uploads/${relative}`;
    const altPath = `${mediaRoot.replace(/\\/g, "/")}/${relative}`;
    const { readFile } = await import("node:fs/promises");
    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      buffer = await readFile(altPath);
    }
    const uploaded = await uploadImageBuffer({
      buffer,
      filename: relative.split("/").pop() || "image.jpg",
      folder: "theflix/site",
    });
    const id = createId("media");
    await conn.execute(
      `INSERT INTO media_assets (
        id, public_id, secure_url, filename, width, height, format,
        resource_type, folder, bytes, alt, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE secure_url = VALUES(secure_url)`,
      [
        id,
        uploaded.publicId,
        uploaded.secureUrl,
        relative.split("/").pop() || "",
        uploaded.width,
        uploaded.height,
        uploaded.format,
        uploaded.resourceType,
        "theflix/site",
        uploaded.bytes,
        image.title,
        toMysqlDateTime(new Date().toISOString()),
      ],
    );
    return { id, publicId: uploaded.publicId, secureUrl: uploaded.secureUrl };
  } catch {
    return null;
  }
}
