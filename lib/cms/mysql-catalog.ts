import type { RowDataPacket } from "mysql2/promise";
import type { CatalogRepository } from "@/lib/cms/catalog";
import {
  fromMysqlDateTime,
  parseJsonColumn,
  toMysqlDateTime,
} from "@/lib/cms/mysql-migrate";
import {
  sanitizeCategory,
  sanitizeFaq,
  sanitizeMessage,
  sanitizePricingPlan,
  sanitizePost,
  sanitizeRedirect,
} from "@/lib/cms/validation";
import { getDbPool } from "@/lib/db/pool";
import type {
  BlogCategory,
  BlogPost,
  ContactMessage,
  FaqItem,
  MediaRef,
  PricingPlan,
  RedirectRule,
} from "@/lib/cms/types";

type PlanRow = RowDataPacket & {
  id: string;
  name: string;
  slug: string;
  price: string;
  duration: string;
  badge_text: string;
  is_popular: number;
  features: unknown;
  button_label: string;
  button_url: string;
  sort_order: number;
  is_active: number;
  created_at: unknown;
  updated_at: unknown;
};

type FaqRow = RowDataPacket & {
  id: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  is_visible: number;
  created_at: unknown;
  updated_at: unknown;
};

type CategoryRow = RowDataPacket & {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: number;
  created_at: unknown;
  updated_at: unknown;
};

type PostRow = RowDataPacket & {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category_id: string | null;
  featured_image: unknown;
  status: string;
  featured: number;
  published_at: unknown;
  created_at: unknown;
  updated_at: unknown;
  seo_title: string;
  seo_description: string;
  focus_keyword: string;
  canonical_url: string;
  robots_index: number;
  robots_follow: number;
  og_title: string;
  og_description: string;
  og_image: unknown;
  sitemap_include: number;
};

type RedirectRow = RowDataPacket & {
  id: string;
  source_path: string;
  destination_path: string;
  status_code: number;
  is_active: number;
  created_at: unknown;
  updated_at: unknown;
};

type MessageRow = RowDataPacket & {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  created_at: unknown;
};

function mapPlan(row: PlanRow): PricingPlan {
  return sanitizePricingPlan({
    id: row.id,
    name: row.name,
    slug: row.slug,
    price: row.price,
    duration: row.duration,
    badge: row.badge_text,
    popular: Boolean(row.is_popular),
    features: parseJsonColumn<string[]>(row.features, []),
    buttonLabel: row.button_label,
    buttonHref: row.button_url,
    sortOrder: row.sort_order,
    active: Boolean(row.is_active),
    createdAt: fromMysqlDateTime(row.created_at),
    updatedAt: fromMysqlDateTime(row.updated_at),
  });
}

function mapFaq(row: FaqRow): FaqItem {
  return sanitizeFaq({
    id: row.id,
    question: row.question,
    answer: row.answer,
    category: row.category,
    sortOrder: row.sort_order,
    visible: Boolean(row.is_visible),
    createdAt: fromMysqlDateTime(row.created_at),
    updatedAt: fromMysqlDateTime(row.updated_at),
  });
}

function mapCategory(row: CategoryRow): BlogCategory {
  return sanitizeCategory({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    active: Boolean(row.is_active),
    createdAt: fromMysqlDateTime(row.created_at),
    updatedAt: fromMysqlDateTime(row.updated_at),
  });
}

function mapPost(row: PostRow): BlogPost {
  return sanitizePost({
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    categoryId: row.category_id,
    featuredImage: parseJsonColumn<MediaRef | null>(row.featured_image, null),
    status: row.status === "published" ? "published" : "draft",
    featured: Boolean(row.featured),
    publishedAt: row.published_at ? fromMysqlDateTime(row.published_at) : null,
    createdAt: fromMysqlDateTime(row.created_at),
    updatedAt: fromMysqlDateTime(row.updated_at),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    focusKeyword: row.focus_keyword,
    canonicalUrl: row.canonical_url,
    robotsIndex: Boolean(row.robots_index),
    robotsFollow: Boolean(row.robots_follow),
    ogTitle: row.og_title,
    ogDescription: row.og_description,
    ogImage: parseJsonColumn<MediaRef | null>(row.og_image, null),
    sitemapInclude: Boolean(row.sitemap_include),
  });
}

function mapRedirect(row: RedirectRow): RedirectRule {
  return sanitizeRedirect({
    id: row.id,
    sourcePath: row.source_path,
    destinationPath: row.destination_path,
    statusCode: row.status_code as RedirectRule["statusCode"],
    active: Boolean(row.is_active),
    createdAt: fromMysqlDateTime(row.created_at),
    updatedAt: fromMysqlDateTime(row.updated_at),
  });
}

function mapMessage(row: MessageRow): ContactMessage {
  return sanitizeMessage({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    createdAt: fromMysqlDateTime(row.created_at),
  });
}

export class MysqlCatalogRepository implements CatalogRepository {
  constructor(private readonly ready: () => Promise<void>) {}

  async listPlans() {
    await this.ready();
    const [rows] = await getDbPool().query<PlanRow[]>(
      "SELECT * FROM pricing_plans ORDER BY sort_order ASC, name ASC",
    );
    return rows.map(mapPlan);
  }
  async savePlan(plan: PricingPlan) {
    await this.ready();
    const safe = sanitizePricingPlan(plan);
    await getDbPool().execute(
      `INSERT INTO pricing_plans
        (id, name, slug, price, duration, badge_text, is_popular, features, button_label, button_url, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), slug = VALUES(slug), price = VALUES(price), duration = VALUES(duration),
         badge_text = VALUES(badge_text), is_popular = VALUES(is_popular), features = VALUES(features),
         button_label = VALUES(button_label), button_url = VALUES(button_url), sort_order = VALUES(sort_order),
         is_active = VALUES(is_active)`,
      [
        safe.id,
        safe.name,
        safe.slug,
        safe.price,
        safe.duration,
        safe.badge,
        safe.popular ? 1 : 0,
        JSON.stringify(safe.features),
        safe.buttonLabel,
        safe.buttonHref,
        safe.sortOrder,
        safe.active ? 1 : 0,
      ],
    );
    return safe;
  }
  async deletePlan(id: string) {
    await this.ready();
    await getDbPool().execute("DELETE FROM pricing_plans WHERE id = ?", [id]);
  }
  async listFaqs() {
    await this.ready();
    const [rows] = await getDbPool().query<FaqRow[]>("SELECT * FROM faqs ORDER BY sort_order ASC, question ASC");
    return rows.map(mapFaq);
  }
  async saveFaq(item: FaqItem) {
    await this.ready();
    const safe = sanitizeFaq(item);
    await getDbPool().execute(
      `INSERT INTO faqs (id, question, answer, category, sort_order, is_visible)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         question = VALUES(question), answer = VALUES(answer), category = VALUES(category),
         sort_order = VALUES(sort_order), is_visible = VALUES(is_visible)`,
      [safe.id, safe.question, safe.answer, safe.category, safe.sortOrder, safe.visible ? 1 : 0],
    );
    return safe;
  }
  async deleteFaq(id: string) {
    await this.ready();
    await getDbPool().execute("DELETE FROM faqs WHERE id = ?", [id]);
  }
  async listCategories() {
    await this.ready();
    const [rows] = await getDbPool().query<CategoryRow[]>("SELECT * FROM blog_categories ORDER BY name ASC");
    return rows.map(mapCategory);
  }
  async saveCategory(category: BlogCategory) {
    await this.ready();
    const safe = sanitizeCategory(category);
    await getDbPool().execute(
      `INSERT INTO blog_categories (id, name, slug, description, is_active)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), slug = VALUES(slug), description = VALUES(description), is_active = VALUES(is_active)`,
      [safe.id, safe.name, safe.slug, safe.description, safe.active ? 1 : 0],
    );
    return safe;
  }
  async deleteCategory(id: string) {
    await this.ready();
    await getDbPool().execute("DELETE FROM blog_categories WHERE id = ?", [id]);
  }
  async listPosts() {
    await this.ready();
    const [rows] = await getDbPool().query<PostRow[]>("SELECT * FROM blog_posts ORDER BY COALESCE(published_at, created_at) DESC");
    return rows.map(mapPost);
  }
  async getPostBySlug(slug: string) {
    await this.ready();
    const [rows] = await getDbPool().query<PostRow[]>("SELECT * FROM blog_posts WHERE slug = ? LIMIT 1", [slug]);
    return rows[0] ? mapPost(rows[0]) : null;
  }
  async savePost(post: BlogPost) {
    await this.ready();
    const safe = sanitizePost(post);
    const [dupes] = await getDbPool().query<PostRow[]>("SELECT id FROM blog_posts WHERE slug = ? AND id <> ? LIMIT 1", [
      safe.slug,
      safe.id,
    ]);
    if (dupes[0]) throw new Error("That blog slug is already in use.");
    await getDbPool().execute(
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
        safe.publishedAt ? toMysqlDateTime(safe.publishedAt) : null,
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
    return safe;
  }
  async deletePost(id: string) {
    await this.ready();
    await getDbPool().execute("DELETE FROM blog_posts WHERE id = ?", [id]);
  }
  async listRedirects() {
    await this.ready();
    const [rows] = await getDbPool().query<RedirectRow[]>("SELECT * FROM redirects ORDER BY source_path ASC");
    return rows.map(mapRedirect);
  }
  async listActiveRedirects() {
    const items = await this.listRedirects();
    return items.filter((item) => item.active);
  }
  async saveRedirect(rule: RedirectRule) {
    await this.ready();
    const safe = sanitizeRedirect(rule);
    if (!safe.sourcePath || safe.sourcePath === "/" || safe.sourcePath === "/welcome/" || safe.sourcePath === "/welcome") {
      throw new Error("That source path is reserved.");
    }
    if (safe.sourcePath === safe.destinationPath) {
      throw new Error("Source and destination cannot be the same.");
    }
    const [dupes] = await getDbPool().query<RedirectRow[]>(
      "SELECT id FROM redirects WHERE source_path = ? AND id <> ? AND is_active = 1 LIMIT 1",
      [safe.sourcePath, safe.id],
    );
    if (dupes[0] && safe.active) throw new Error("An active redirect already uses that source path.");
    await getDbPool().execute(
      `INSERT INTO redirects (id, source_path, destination_path, status_code, is_active)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         source_path = VALUES(source_path), destination_path = VALUES(destination_path),
         status_code = VALUES(status_code), is_active = VALUES(is_active)`,
      [safe.id, safe.sourcePath, safe.destinationPath, safe.statusCode, safe.active ? 1 : 0],
    );
    return safe;
  }
  async deleteRedirect(id: string) {
    await this.ready();
    await getDbPool().execute("DELETE FROM redirects WHERE id = ?", [id]);
  }
  async listMessages() {
    await this.ready();
    const [rows] = await getDbPool().query<MessageRow[]>("SELECT * FROM contact_messages ORDER BY created_at DESC");
    return rows.map(mapMessage);
  }
  async addMessage(message: ContactMessage) {
    await this.ready();
    const safe = sanitizeMessage(message);
    await getDbPool().execute(
      `INSERT INTO contact_messages (id, name, email, phone, subject, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [safe.id, safe.name, safe.email, safe.phone, safe.subject, safe.message, toMysqlDateTime(safe.createdAt)],
    );
    return safe;
  }
  async dashboardStats() {
    await this.ready();
    const pool = getDbPool();
    const count = async (sql: string) => {
      const [rows] = await pool.query<Array<RowDataPacket & { n: number }>>(sql);
      return Number(rows[0]?.n ?? 0);
    };
    const [pages, posts, drafts, publishedPosts, faqs, plans, media, redirects, messages] = await Promise.all([
      count("SELECT COUNT(*) AS n FROM pages"),
      count("SELECT COUNT(*) AS n FROM blog_posts"),
      count("SELECT COUNT(*) AS n FROM blog_posts WHERE status = 'draft'"),
      count("SELECT COUNT(*) AS n FROM blog_posts WHERE status = 'published'"),
      count("SELECT COUNT(*) AS n FROM faqs"),
      count("SELECT COUNT(*) AS n FROM pricing_plans"),
      count("SELECT COUNT(*) AS n FROM media_assets"),
      count("SELECT COUNT(*) AS n FROM redirects"),
      count("SELECT COUNT(*) AS n FROM contact_messages"),
    ]);
    return { pages, posts, drafts, publishedPosts, faqs, plans, media, redirects, messages };
  }
}
