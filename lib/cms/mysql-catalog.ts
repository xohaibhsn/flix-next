import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CatalogRepository,
  MergeSeoPlanningImagePromptResult,
  MergeSeoPlanningWritingPromptResult,
  SeoPlanningPromptAcceptReaders,
} from "@/lib/cms/catalog";
import {
  fromMysqlDateTime,
  parseJsonColumn,
  toMysqlDateTime,
} from "@/lib/cms/mysql-migrate";
import { sanitizeSeoPlanningDraft } from "@/lib/cms/seo-planning/sanitize";
import {
  archiveSeoPlanningDraftRecord,
  assertArchivedForPermanentDelete,
  assertSeoPlanningDraftMutableForOrdinarySave,
  restoreSeoPlanningDraftRecord,
  SEO_PLANNING_MISSING_DRAFT_MESSAGE,
  type SeoPlanningListLifecycle,
} from "@/lib/cms/seo-planning/lifecycle";
import {
  buildNewBlogHandoffDraft,
  evaluateSeoPlanningHandoffEligibility,
  handoffSuccess,
  SEO_PLANNING_HANDOFF_LINKED_POST_MISSING_MESSAGE,
  SEO_PLANNING_HANDOFF_REFRESH_TARGET_MISSING_MESSAGE,
  SEO_PLANNING_HANDOFF_REFRESH_TARGET_REQUIRED_MESSAGE,
  SEO_PLANNING_HANDOFF_SLUG_CONFLICT_MESSAGE,
  type SeoPlanningHandoffResult,
} from "@/lib/cms/seo-planning/handoff";
import {
  mergeImagePromptCache,
  type ImagePromptCacheEntry,
  type ImagePromptProvider,
} from "@/lib/cms/seo-planning/image-prompt-cache";
import {
  mergeWritingPromptCache,
  type WritingPromptCacheEntry,
  type WritingPromptProvider,
} from "@/lib/cms/seo-planning/writing-prompt-cache";
import {
  sanitizeCategory,
  sanitizeFaq,
  sanitizeMessage,
  sanitizePricingPlan,
  sanitizePost,
  sanitizeRedirect,
} from "@/lib/cms/validation";
import { ClientError } from "@/lib/security/errors";
import {
  isReservedRedirectSource,
  isSelfRedirect,
  REDIRECT_ERRORS,
  sanitizeRedirectDestination,
  withSlash,
  wouldCreateRedirectLoop,
} from "@/lib/cms/redirects";
import { getDbPool, withTransaction } from "@/lib/db/pool";
import type {
  BlogCategory,
  BlogPost,
  ContactMessage,
  FaqItem,
  MediaRef,
  PricingPlan,
  RedirectRule,
  SeoPlanningDraft,
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
  seo_title?: string | null;
  seo_description?: string | null;
  focus_keyword?: string | null;
  canonical_url?: string | null;
  robots_index?: number | null;
  robots_follow?: number | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: unknown;
  sitemap_include?: number | null;
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

/** Parameterized exact public lookup. Uses UNIQUE(source_path); no schema change. */
export const GET_ACTIVE_REDIRECT_BY_SOURCE_SQL =
  "SELECT * FROM redirects WHERE source_path = ? AND is_active = 1 LIMIT 1";

type MessageRow = RowDataPacket & {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  created_at: unknown;
};

type PlanningRow = RowDataPacket & {
  id: string;
  recommendation: string;
  workflow_status: string;
  fingerprint: string;
  topic: string;
  working_title: string;
  proposed_slug: string;
  target_post_id: string | null;
  matched_public_url: string;
  restore_path: string;
  search_intent: string;
  linked_post_id: string | null;
  created_by: string;
  payload: unknown;
  archived_at: unknown;
  created_at: unknown;
  updated_at: unknown;
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
    description: row.description || "",
    active: Boolean(row.is_active),
    createdAt: fromMysqlDateTime(row.created_at),
    updatedAt: fromMysqlDateTime(row.updated_at),
    seoTitle: row.seo_title || "",
    seoDescription: row.seo_description || "",
    focusKeyword: row.focus_keyword || "",
    canonicalUrl: row.canonical_url || "",
    robotsIndex: row.robots_index == null ? null : Boolean(row.robots_index),
    robotsFollow: row.robots_follow == null ? null : Boolean(row.robots_follow),
    ogTitle: row.og_title || "",
    ogDescription: row.og_description || "",
    ogImage: parseJsonColumn<MediaRef | null>(row.og_image, null),
    sitemapInclude: row.sitemap_include == null ? null : Boolean(row.sitemap_include),
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

/**
 * Transaction-scoped REFRESH article readers. Lock order after Planning FOR UPDATE:
 * target BlogPost → relevant category. NEW/RESTORE callers never need these locks.
 */
function createPromptAcceptReaders(
  conn: PoolConnection,
  latest: SeoPlanningDraft,
): SeoPlanningPromptAcceptReaders {
  let lockedPost: BlogPost | null | undefined;
  let lockedCategory: BlogCategory | null | undefined;
  return {
    async getPostById(postId: string) {
      const want = String(postId || "").trim();
      if (!want) {
        lockedPost = null;
        return null;
      }
      const [postRows] = await conn.query<PostRow[]>(
        "SELECT * FROM blog_posts WHERE id = ? LIMIT 1 FOR UPDATE",
        [want],
      );
      lockedPost = postRows[0] ? mapPost(postRows[0]) : null;
      lockedCategory = undefined;
      return lockedPost;
    },
    async listCategories() {
      if (latest.recommendation !== "REFRESH_EXISTING") return [];
      const categoryId = lockedPost?.categoryId?.trim() || "";
      if (!categoryId) return [];
      if (lockedCategory !== undefined) {
        return lockedCategory ? [lockedCategory] : [];
      }
      const [catRows] = await conn.query<CategoryRow[]>(
        "SELECT * FROM blog_categories WHERE id = ? LIMIT 1 FOR UPDATE",
        [categoryId],
      );
      lockedCategory = catRows[0] ? mapCategory(catRows[0]) : null;
      return lockedCategory ? [lockedCategory] : [];
    },
  };
}

function mapPlanningDraft(row: PlanningRow): SeoPlanningDraft {
  const archivedAt =
    row.archived_at == null || row.archived_at === ""
      ? null
      : fromMysqlDateTime(row.archived_at);
  return sanitizeSeoPlanningDraft({
    id: row.id,
    recommendation: row.recommendation,
    workflowStatus: row.workflow_status as SeoPlanningDraft["workflowStatus"],
    fingerprint: row.fingerprint,
    topic: row.topic,
    workingTitle: row.working_title,
    proposedSlug: row.proposed_slug,
    targetPostId: row.target_post_id,
    matchedPublicUrl: row.matched_public_url,
    restorePath: row.restore_path,
    searchIntent: row.search_intent,
    linkedPostId: row.linked_post_id,
    createdBy: row.created_by,
    createdAt: fromMysqlDateTime(row.created_at),
    updatedAt: fromMysqlDateTime(row.updated_at),
    archivedAt,
    payload: parseJsonColumn<Record<string, unknown>>(row.payload, {}),
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
      `INSERT INTO blog_categories (
        id, name, slug, description, is_active,
        seo_title, seo_description, focus_keyword, canonical_url,
        robots_index, robots_follow, og_title, og_description, og_image, sitemap_include
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), slug = VALUES(slug), description = VALUES(description), is_active = VALUES(is_active),
         seo_title = VALUES(seo_title), seo_description = VALUES(seo_description),
         focus_keyword = VALUES(focus_keyword), canonical_url = VALUES(canonical_url),
         robots_index = VALUES(robots_index), robots_follow = VALUES(robots_follow),
         og_title = VALUES(og_title), og_description = VALUES(og_description),
         og_image = VALUES(og_image), sitemap_include = VALUES(sitemap_include)`,
      [
        safe.id,
        safe.name,
        safe.slug,
        safe.description,
        safe.active ? 1 : 0,
        safe.seoTitle,
        safe.seoDescription,
        safe.focusKeyword,
        safe.canonicalUrl,
        safe.robotsIndex == null ? null : safe.robotsIndex ? 1 : 0,
        safe.robotsFollow == null ? null : safe.robotsFollow ? 1 : 0,
        safe.ogTitle,
        safe.ogDescription,
        safe.ogImage ? JSON.stringify(safe.ogImage) : null,
        safe.sitemapInclude == null ? null : safe.sitemapInclude ? 1 : 0,
      ],
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
  async getPostById(id: string) {
    await this.ready();
    const [rows] = await getDbPool().query<PostRow[]>("SELECT * FROM blog_posts WHERE id = ? LIMIT 1", [id]);
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
  async getActiveRedirectBySourcePath(sourcePath: string) {
    await this.ready();
    const source = withSlash(sourcePath);
    const [rows] = await getDbPool().query<RedirectRow[]>(GET_ACTIVE_REDIRECT_BY_SOURCE_SQL, [source]);
    const row = rows[0];
    if (!row) return null;
    const rule = mapRedirect(row);
    return rule.active ? rule : null;
  }
  async saveRedirect(rule: RedirectRule) {
    await this.ready();
    const safe = sanitizeRedirect(rule);
    if (!safe.sourcePath || isReservedRedirectSource(safe.sourcePath)) {
      throw new ClientError(REDIRECT_ERRORS.reserved);
    }
    if (isSelfRedirect(safe.sourcePath, sanitizeRedirectDestination(rule.destinationPath))) {
      throw new ClientError(REDIRECT_ERRORS.self);
    }
    const existing = await this.listRedirects();
    if (wouldCreateRedirectLoop(safe, existing)) {
      throw new ClientError(REDIRECT_ERRORS.loop);
    }
    const [dupes] = await getDbPool().query<RedirectRow[]>(
      "SELECT id FROM redirects WHERE source_path = ? AND id <> ? AND is_active = 1 LIMIT 1",
      [safe.sourcePath, safe.id],
    );
    if (dupes[0] && safe.active) throw new ClientError(REDIRECT_ERRORS.duplicate);
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
  async listSeoPlanningDrafts(options?: { lifecycle?: SeoPlanningListLifecycle }) {
    await this.ready();
    const lifecycle = options?.lifecycle || "active";
    let sql = "SELECT * FROM seo_planning_drafts";
    if (lifecycle === "active") sql += " WHERE archived_at IS NULL";
    else if (lifecycle === "archived") sql += " WHERE archived_at IS NOT NULL";
    sql += " ORDER BY updated_at DESC";
    const [rows] = await getDbPool().query<PlanningRow[]>(sql);
    return rows.map(mapPlanningDraft);
  }
  async getSeoPlanningDraftById(id: string) {
    await this.ready();
    const [rows] = await getDbPool().query<PlanningRow[]>(
      "SELECT * FROM seo_planning_drafts WHERE id = ? LIMIT 1",
      [id],
    );
    return rows[0] ? mapPlanningDraft(rows[0]) : null;
  }
  async getSeoPlanningDraftByFingerprint(fingerprint: string) {
    await this.ready();
    const fp = String(fingerprint || "").trim();
    if (!fp) return null;
    const [rows] = await getDbPool().query<PlanningRow[]>(
      "SELECT * FROM seo_planning_drafts WHERE fingerprint = ? LIMIT 1",
      [fp],
    );
    return rows[0] ? mapPlanningDraft(rows[0]) : null;
  }
  async saveSeoPlanningDraft(draft: SeoPlanningDraft) {
    await this.ready();
    const safe = sanitizeSeoPlanningDraft(draft);
    if (!safe.id || !safe.fingerprint) {
      throw new Error("Planning draft requires id and fingerprint.");
    }
    return withTransaction(async (conn) => {
      const [fpRows] = await conn.query<PlanningRow[]>(
        "SELECT id FROM seo_planning_drafts WHERE fingerprint = ? LIMIT 1",
        [safe.fingerprint],
      );
      if (fpRows[0] && fpRows[0].id !== safe.id) {
        throw new Error("Planning draft fingerprint already exists.");
      }

      const [rows] = await conn.query<PlanningRow[]>(
        "SELECT * FROM seo_planning_drafts WHERE id = ? LIMIT 1 FOR UPDATE",
        [safe.id],
      );
      if (rows[0]) {
        const latest = mapPlanningDraft(rows[0]);
        // Final boundary: ordinary save cannot clear Archive or mutate archived drafts.
        assertSeoPlanningDraftMutableForOrdinarySave(latest);
        // Do not write archived_at — Restore is the only path that may clear it.
        await conn.execute(
          `UPDATE seo_planning_drafts SET
            recommendation = ?, workflow_status = ?, fingerprint = ?, topic = ?, working_title = ?,
            proposed_slug = ?, target_post_id = ?, matched_public_url = ?, restore_path = ?,
            search_intent = ?, linked_post_id = ?, payload = ?, updated_at = ?
           WHERE id = ?`,
          [
            safe.recommendation,
            safe.workflowStatus,
            safe.fingerprint,
            safe.topic,
            safe.workingTitle,
            safe.proposedSlug,
            safe.targetPostId,
            safe.matchedPublicUrl,
            safe.restorePath,
            safe.searchIntent,
            safe.linkedPostId,
            JSON.stringify(safe.payload || {}),
            toMysqlDateTime(safe.updatedAt),
            safe.id,
          ],
        );
        return sanitizeSeoPlanningDraft({
          ...safe,
          archivedAt: latest.archivedAt ?? null,
        });
      }

      const archivedAtSql = safe.archivedAt ? toMysqlDateTime(safe.archivedAt) : null;
      await conn.execute(
        `INSERT INTO seo_planning_drafts (
          id, recommendation, workflow_status, fingerprint, topic, working_title, proposed_slug,
          target_post_id, matched_public_url, restore_path, search_intent, linked_post_id,
          created_by, payload, archived_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          safe.id,
          safe.recommendation,
          safe.workflowStatus,
          safe.fingerprint,
          safe.topic,
          safe.workingTitle,
          safe.proposedSlug,
          safe.targetPostId,
          safe.matchedPublicUrl,
          safe.restorePath,
          safe.searchIntent,
          safe.linkedPostId,
          safe.createdBy,
          JSON.stringify(safe.payload || {}),
          archivedAtSql,
          toMysqlDateTime(safe.createdAt),
          toMysqlDateTime(safe.updatedAt),
        ],
      );
      return safe;
    });
  }
  async archiveSeoPlanningDraft(id: string) {
    await this.ready();
    const want = String(id || "").trim();
    if (!want) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
    return withTransaction(async (conn) => {
      const [rows] = await conn.query<PlanningRow[]>(
        "SELECT * FROM seo_planning_drafts WHERE id = ? LIMIT 1 FOR UPDATE",
        [want],
      );
      if (!rows[0]) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
      const latest = mapPlanningDraft(rows[0]);
      const applied = archiveSeoPlanningDraftRecord(latest);
      if (!applied.ok) return applied;
      const safe = sanitizeSeoPlanningDraft(applied.draft);
      await conn.execute(
        "UPDATE seo_planning_drafts SET archived_at = ?, updated_at = ? WHERE id = ?",
        [toMysqlDateTime(safe.archivedAt!), toMysqlDateTime(safe.updatedAt), want],
      );
      return { ok: true as const, draft: safe };
    });
  }
  async restoreSeoPlanningDraft(id: string) {
    await this.ready();
    const want = String(id || "").trim();
    if (!want) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
    return withTransaction(async (conn) => {
      const [rows] = await conn.query<PlanningRow[]>(
        "SELECT * FROM seo_planning_drafts WHERE id = ? LIMIT 1 FOR UPDATE",
        [want],
      );
      if (!rows[0]) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
      const latest = mapPlanningDraft(rows[0]);
      const applied = restoreSeoPlanningDraftRecord(latest);
      if (!applied.ok) return applied;
      const safe = sanitizeSeoPlanningDraft(applied.draft);
      await conn.execute(
        "UPDATE seo_planning_drafts SET archived_at = NULL, updated_at = ? WHERE id = ?",
        [toMysqlDateTime(safe.updatedAt), want],
      );
      return { ok: true as const, draft: safe };
    });
  }
  async deleteSeoPlanningDraftPermanently(id: string) {
    await this.ready();
    const want = String(id || "").trim();
    if (!want) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
    return withTransaction(async (conn) => {
      const [rows] = await conn.query<PlanningRow[]>(
        "SELECT * FROM seo_planning_drafts WHERE id = ? LIMIT 1 FOR UPDATE",
        [want],
      );
      if (!rows[0]) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
      const latest = mapPlanningDraft(rows[0]);
      const gate = assertArchivedForPermanentDelete(latest);
      if (!gate.ok) return gate;
      await conn.execute("DELETE FROM seo_planning_drafts WHERE id = ?", [want]);
      return { ok: true as const };
    });
  }
  async mergeSeoPlanningWritingPromptCache(args: {
    id: string;
    provider: WritingPromptProvider;
    entry: WritingPromptCacheEntry;
    acceptLatest?: (
      latest: SeoPlanningDraft,
      readers: SeoPlanningPromptAcceptReaders,
    ) => boolean | Promise<boolean>;
  }): Promise<MergeSeoPlanningWritingPromptResult> {
    await this.ready();
    const id = String(args.id || "").trim();
    if (!id) return { ok: false, reason: "not_found" };
    if (args.provider !== "gemini" && args.provider !== "openai") {
      return { ok: false, reason: "rejected" };
    }

    return withTransaction(async (conn) => {
      const [rows] = await conn.query<PlanningRow[]>(
        "SELECT * FROM seo_planning_drafts WHERE id = ? LIMIT 1 FOR UPDATE",
        [id],
      );
      if (!rows[0]) return { ok: false, reason: "not_found" };

      const latest = mapPlanningDraft(rows[0]);
      if (latest.archivedAt) return { ok: false, reason: "rejected" };
      // Lock order: Planning → BlogPost → category (REFRESH only). Same conn.
      const readers = createPromptAcceptReaders(conn, latest);
      if (args.acceptLatest && !(await args.acceptLatest(latest, readers))) {
        return { ok: false, reason: "rejected" };
      }

      const basePayload =
        latest.payload && typeof latest.payload === "object" && !Array.isArray(latest.payload)
          ? { ...(latest.payload as Record<string, unknown>) }
          : {};
      const nextPayload = mergeWritingPromptCache(basePayload, args.provider, args.entry);
      const updatedAt = new Date().toISOString();
      await conn.execute(
        "UPDATE seo_planning_drafts SET payload = ?, updated_at = ? WHERE id = ?",
        [JSON.stringify(nextPayload), toMysqlDateTime(updatedAt), id],
      );

      return {
        ok: true,
        draft: sanitizeSeoPlanningDraft({
          ...latest,
          payload: nextPayload,
          updatedAt,
        }),
      };
    });
  }
  async mergeSeoPlanningGeminiWritingPromptCache(args: {
    id: string;
    entry: WritingPromptCacheEntry;
    acceptLatest?: (
      latest: SeoPlanningDraft,
      readers: SeoPlanningPromptAcceptReaders,
    ) => boolean | Promise<boolean>;
  }): Promise<MergeSeoPlanningWritingPromptResult> {
    return this.mergeSeoPlanningWritingPromptCache({
      id: args.id,
      provider: "gemini",
      entry: args.entry,
      acceptLatest: args.acceptLatest,
    });
  }
  async mergeSeoPlanningImagePromptCache(args: {
    id: string;
    provider: ImagePromptProvider;
    entry: ImagePromptCacheEntry;
    acceptLatest?: (
      latest: SeoPlanningDraft,
      readers: SeoPlanningPromptAcceptReaders,
    ) => boolean | Promise<boolean>;
  }): Promise<MergeSeoPlanningImagePromptResult> {
    await this.ready();
    const id = String(args.id || "").trim();
    if (!id) return { ok: false, reason: "not_found" };
    if (args.provider !== "gemini" && args.provider !== "openai") {
      return { ok: false, reason: "rejected" };
    }

    return withTransaction(async (conn) => {
      const [rows] = await conn.query<PlanningRow[]>(
        "SELECT * FROM seo_planning_drafts WHERE id = ? LIMIT 1 FOR UPDATE",
        [id],
      );
      if (!rows[0]) return { ok: false, reason: "not_found" };

      const latest = mapPlanningDraft(rows[0]);
      if (latest.archivedAt) return { ok: false, reason: "rejected" };
      // Lock order: Planning → BlogPost → category (REFRESH only). Same conn.
      const readers = createPromptAcceptReaders(conn, latest);
      if (args.acceptLatest && !(await args.acceptLatest(latest, readers))) {
        return { ok: false, reason: "rejected" };
      }

      const basePayload =
        latest.payload && typeof latest.payload === "object" && !Array.isArray(latest.payload)
          ? { ...(latest.payload as Record<string, unknown>) }
          : {};
      const nextPayload = mergeImagePromptCache(basePayload, args.provider, args.entry);
      const updatedAt = new Date().toISOString();
      await conn.execute(
        "UPDATE seo_planning_drafts SET payload = ?, updated_at = ? WHERE id = ?",
        [JSON.stringify(nextPayload), toMysqlDateTime(updatedAt), id],
      );

      return {
        ok: true,
        draft: sanitizeSeoPlanningDraft({
          ...latest,
          payload: nextPayload,
          updatedAt,
        }),
      };
    });
  }
  async handoffSeoPlanningToBlog(planningDraftId: string): Promise<SeoPlanningHandoffResult> {
    await this.ready();
    const id = String(planningDraftId || "").trim();
    if (!id) {
      return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE, code: "planning_not_found" };
    }

    return withTransaction(async (conn) => {
      const [rows] = await conn.query<PlanningRow[]>(
        "SELECT * FROM seo_planning_drafts WHERE id = ? LIMIT 1 FOR UPDATE",
        [id],
      );
      if (!rows[0]) {
        return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE, code: "planning_not_found" };
      }
      const latest = mapPlanningDraft(rows[0]);
      const eligible = evaluateSeoPlanningHandoffEligibility(latest);
      if (!eligible.ok) return eligible;

      if (eligible.draft.recommendation === "REFRESH_EXISTING") {
        const targetId = String(eligible.draft.targetPostId || "").trim();
        if (!targetId) {
          return {
            ok: false,
            error: SEO_PLANNING_HANDOFF_REFRESH_TARGET_REQUIRED_MESSAGE,
            code: "refresh_target_required",
          };
        }
        const [postRows] = await conn.query<PostRow[]>(
          "SELECT * FROM blog_posts WHERE id = ? LIMIT 1",
          [targetId],
        );
        if (!postRows[0]) {
          return {
            ok: false,
            error: SEO_PLANNING_HANDOFF_REFRESH_TARGET_MISSING_MESSAGE,
            code: "refresh_target_missing",
          };
        }
        return handoffSuccess({
          postId: mapPost(postRows[0]).id,
          created: false,
          recommendation: "REFRESH_EXISTING",
        });
      }

      // NEW_BLOG — same connection holds Planning FOR UPDATE for the create+link boundary.
      const linkedId = String(eligible.draft.linkedPostId || "").trim();
      if (linkedId) {
        const [linkedRows] = await conn.query<PostRow[]>(
          "SELECT * FROM blog_posts WHERE id = ? LIMIT 1",
          [linkedId],
        );
        if (!linkedRows[0]) {
          return {
            ok: false,
            error: SEO_PLANNING_HANDOFF_LINKED_POST_MISSING_MESSAGE,
            code: "linked_post_missing",
          };
        }
        return handoffSuccess({
          postId: mapPost(linkedRows[0]).id,
          created: false,
          recommendation: "NEW_BLOG",
        });
      }

      const built = buildNewBlogHandoffDraft({
        workingTitle: eligible.draft.workingTitle,
        proposedSlug: eligible.draft.proposedSlug,
      });
      if ("ok" in built) return built;
      const draftPost = built;

      const [dupes] = await conn.query<PostRow[]>(
        "SELECT id FROM blog_posts WHERE slug = ? AND id <> ? LIMIT 1",
        [draftPost.slug, draftPost.id],
      );
      if (dupes[0]) {
        return {
          ok: false,
          error: SEO_PLANNING_HANDOFF_SLUG_CONFLICT_MESSAGE,
          code: "slug_conflict",
        };
      }

      // Archive cannot land while we hold FOR UPDATE; still assert before writes.
      assertSeoPlanningDraftMutableForOrdinarySave(latest);

      await conn.execute(
        `INSERT INTO blog_posts (
          id, title, slug, excerpt, content, category_id, featured_image, status, featured, published_at,
          seo_title, seo_description, focus_keyword, canonical_url, robots_index, robots_follow,
          og_title, og_description, og_image, sitemap_include
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          draftPost.id,
          draftPost.title,
          draftPost.slug,
          draftPost.excerpt,
          draftPost.content,
          draftPost.categoryId,
          JSON.stringify(draftPost.featuredImage),
          draftPost.status,
          draftPost.featured ? 1 : 0,
          draftPost.publishedAt ? toMysqlDateTime(draftPost.publishedAt) : null,
          draftPost.seoTitle,
          draftPost.seoDescription,
          draftPost.focusKeyword,
          draftPost.canonicalUrl,
          draftPost.robotsIndex ? 1 : 0,
          draftPost.robotsFollow ? 1 : 0,
          draftPost.ogTitle,
          draftPost.ogDescription,
          JSON.stringify(draftPost.ogImage),
          draftPost.sitemapInclude ? 1 : 0,
        ],
      );

      const updatedAt = new Date().toISOString();
      await conn.execute(
        "UPDATE seo_planning_drafts SET linked_post_id = ?, updated_at = ? WHERE id = ?",
        [draftPost.id, toMysqlDateTime(updatedAt), id],
      );

      return handoffSuccess({
        postId: draftPost.id,
        created: true,
        recommendation: "NEW_BLOG",
      });
    });
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
