import type {
  CatalogRepository,
  MergeSeoPlanningImagePromptResult,
  MergeSeoPlanningWritingPromptResult,
  SeoPlanningPromptAcceptReaders,
} from "@/lib/cms/catalog";
import {
  defaultBlogCategories,
  defaultBlogPosts,
  defaultFaqs,
  defaultPricingPlans,
} from "@/lib/cms/defaults";
import { applyPublicCopyCleanupToFaq, applyPublicCopyCleanupToPlan, applyPublicCopyCleanupToPost } from "@/lib/cms/public-copy-cleanup";
import { MANAGED_REDIRECT_SEED_KEY, MANAGED_REDIRECTS, toRedirectRule } from "@/lib/cms/managed-redirects";
import { applySubscriptionRedirectMigration } from "@/lib/cms/subscription-url-migrate";
import { applyBlogIndexRedirectUpsert } from "@/lib/cms/blog-index";
import { readJsonFile, writeJsonFile } from "@/lib/cms/json-store";
import { sanitizeSeoPlanningDraft } from "@/lib/cms/seo-planning/sanitize";
import {
  archiveSeoPlanningDraftRecord,
  assertArchivedForPermanentDelete,
  assertSeoPlanningDraftMutableForOrdinarySave,
  filterSeoPlanningDraftsByLifecycle,
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
  findActiveRedirectBySourcePath,
  isReservedRedirectSource,
  isSelfRedirect,
  REDIRECT_ERRORS,
  sanitizeRedirectDestination,
  wouldCreateRedirectLoop,
} from "@/lib/cms/redirects";
import type {
  BlogCategory,
  BlogPost,
  CmsDashboardStats,
  ContactMessage,
  FaqItem,
  PricingPlan,
  RedirectRule,
  SeoPlanningDraft,
} from "@/lib/cms/types";
import { isProductionBuildPhase } from "@/lib/db/config";

const PLANS_FILE = "pricing-plans.json";
const FAQS_FILE = "faqs.json";
const CATEGORIES_FILE = "blog-categories.json";
const POSTS_FILE = "blog-posts.json";
const REDIRECTS_FILE = "redirects.json";
const REDIRECT_SEED_FILE = "redirect-seeds.json";
const MESSAGES_FILE = "contact-messages.json";
const SEO_PLANNING_FILE = "seo-planning-drafts.json";

/**
 * Process-local queue for seo-planning-drafts.json read/check/write.
 * Prevents last-writer-wins races on concurrent same/different fingerprints.
 * Failures never permanently poison the queue (next waiter still runs).
 */
let seoPlanningJsonWriteChain: Promise<void> = Promise.resolve();

function withSeoPlanningJsonWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = seoPlanningJsonWriteChain.then(operation, operation);
  seoPlanningJsonWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Process-local queue serializing blog post/category file mutations with E2
 * image-prompt write-boundary article reads (Planning lock alone is not enough).
 */
let blogContentJsonWriteChain: Promise<void> = Promise.resolve();

function withBlogContentJsonWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = blogContentJsonWriteChain.then(operation, operation);
  blogContentJsonWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ensureJsonManagedRedirects(items: RedirectRule[]) {
  const flag = await readJsonFile<{ seeded?: boolean }>(REDIRECT_SEED_FILE, {});
  if (flag.seeded) return items;
  const now = new Date().toISOString();
  const next = [...items];
  for (const seed of MANAGED_REDIRECTS) {
    if (next.some((item) => item.sourcePath === seed.sourcePath)) continue;
    next.push(toRedirectRule(seed, now));
  }
  if (!isProductionBuildPhase()) {
    await saveList(REDIRECTS_FILE, next);
    await writeJsonFile(REDIRECT_SEED_FILE, { seeded: true, key: MANAGED_REDIRECT_SEED_KEY });
  }
  return next;
}

async function saveList<T>(file: string, items: T[]) {
  await writeJsonFile(file, items);
  return items;
}

export class JsonCatalogRepository implements CatalogRepository {
  async listPlans() {
    const items = await readJsonFile<PricingPlan[]>(PLANS_FILE, defaultPricingPlans());
    const source = Array.isArray(items) ? items : defaultPricingPlans();
    let changed = false;
    const next = source.map((item) => {
      const result = applyPublicCopyCleanupToPlan(item);
      if (result.changed) changed = true;
      return sanitizePricingPlan(result.plan);
    });
    if (changed && !isProductionBuildPhase()) await saveList(PLANS_FILE, next);
    return next;
  }
  async savePlan(plan: PricingPlan) {
    const safe = sanitizePricingPlan(plan);
    const items = await this.listPlans();
    const next = items.some((item) => item.id === safe.id)
      ? items.map((item) => (item.id === safe.id ? safe : item))
      : [...items, safe];
    await saveList(PLANS_FILE, next);
    return safe;
  }
  async deletePlan(id: string) {
    const items = await this.listPlans();
    await saveList(
      PLANS_FILE,
      items.filter((item) => item.id !== id),
    );
  }
  async listFaqs() {
    const items = await readJsonFile<FaqItem[]>(FAQS_FILE, defaultFaqs());
    const source = Array.isArray(items) ? items : defaultFaqs();
    let changed = false;
    const next = source.map((item) => {
      const result = applyPublicCopyCleanupToFaq(item);
      if (result.changed) changed = true;
      return sanitizeFaq(result.item);
    });
    if (changed && !isProductionBuildPhase()) await saveList(FAQS_FILE, next);
    return next;
  }
  async saveFaq(item: FaqItem) {
    const safe = sanitizeFaq(item);
    const items = await this.listFaqs();
    const next = items.some((row) => row.id === safe.id)
      ? items.map((row) => (row.id === safe.id ? safe : row))
      : [...items, safe];
    await saveList(FAQS_FILE, next);
    return safe;
  }
  async deleteFaq(id: string) {
    const items = await this.listFaqs();
    await saveList(
      FAQS_FILE,
      items.filter((item) => item.id !== id),
    );
  }
  async listCategories() {
    const items = await readJsonFile<BlogCategory[]>(CATEGORIES_FILE, defaultBlogCategories());
    return (Array.isArray(items) ? items : defaultBlogCategories()).map(sanitizeCategory);
  }
  async saveCategory(category: BlogCategory) {
    return withBlogContentJsonWriteLock(async () => {
      const safe = sanitizeCategory(category);
      const items = await this.listCategories();
      const next = items.some((row) => row.id === safe.id)
        ? items.map((row) => (row.id === safe.id ? safe : row))
        : [...items, safe];
      await saveList(CATEGORIES_FILE, next);
      return safe;
    });
  }
  async deleteCategory(id: string) {
    return withBlogContentJsonWriteLock(async () => {
      const items = await this.listCategories();
      await saveList(
        CATEGORIES_FILE,
        items.filter((item) => item.id !== id),
      );
    });
  }
  async listPosts() {
    const items = await readJsonFile<BlogPost[]>(POSTS_FILE, defaultBlogPosts());
    const source = Array.isArray(items) ? items : defaultBlogPosts();
    let changed = false;
    const next = source.map((item) => {
      const result = applyPublicCopyCleanupToPost(item);
      if (result.changed) changed = true;
      return sanitizePost(result.post);
    });
    if (changed && !isProductionBuildPhase()) await saveList(POSTS_FILE, next);
    return next;
  }
  async getPostBySlug(slug: string) {
    const items = await this.listPosts();
    return items.find((item) => item.slug === slug) ?? null;
  }
  async getPostById(id: string) {
    const items = await this.listPosts();
    return items.find((item) => item.id === id) ?? null;
  }
  async savePost(post: BlogPost) {
    return withBlogContentJsonWriteLock(async () => {
      const safe = sanitizePost(post);
      const items = await this.listPosts();
      if (items.some((item) => item.slug === safe.slug && item.id !== safe.id)) {
        throw new Error("That blog slug is already in use.");
      }
      const next = items.some((item) => item.id === safe.id)
        ? items.map((item) => (item.id === safe.id ? safe : item))
        : [...items, safe];
      await saveList(POSTS_FILE, next);
      return safe;
    });
  }
  async deletePost(id: string) {
    return withBlogContentJsonWriteLock(async () => {
      const items = await this.listPosts();
      await saveList(
        POSTS_FILE,
        items.filter((item) => item.id !== id),
      );
    });
  }
  async listRedirects() {
    const items = await readJsonFile<RedirectRule[]>(REDIRECTS_FILE, []);
    const list = Array.isArray(items) ? items : [];
    const seeded = await ensureJsonManagedRedirects(list);
    const migrated = applySubscriptionRedirectMigration(seeded);
    const blog = applyBlogIndexRedirectUpsert(migrated.rules);
    if ((migrated.changed || blog.changed) && !isProductionBuildPhase()) {
      await saveList(REDIRECTS_FILE, blog.rules);
    }
    return blog.rules.map(sanitizeRedirect);
  }
  async listActiveRedirects() {
    const items = await this.listRedirects();
    return items.filter((item) => item.active);
  }
  async getActiveRedirectBySourcePath(sourcePath: string) {
    const items = await this.listRedirects();
    return findActiveRedirectBySourcePath(items, sourcePath);
  }
  async saveRedirect(rule: RedirectRule) {
    const safe = sanitizeRedirect(rule);
    if (!safe.sourcePath || isReservedRedirectSource(safe.sourcePath)) {
      throw new ClientError(REDIRECT_ERRORS.reserved);
    }
    if (isSelfRedirect(safe.sourcePath, sanitizeRedirectDestination(rule.destinationPath))) {
      throw new ClientError(REDIRECT_ERRORS.self);
    }
    const items = await this.listRedirects();
    if (wouldCreateRedirectLoop(safe, items)) {
      throw new ClientError(REDIRECT_ERRORS.loop);
    }
    if (items.some((item) => item.sourcePath === safe.sourcePath && item.id !== safe.id && item.active && safe.active)) {
      throw new ClientError(REDIRECT_ERRORS.duplicate);
    }
    const next = items.some((item) => item.id === safe.id)
      ? items.map((item) => (item.id === safe.id ? safe : item))
      : [...items, safe];
    await saveList(REDIRECTS_FILE, next);
    return safe;
  }
  async deleteRedirect(id: string) {
    const items = await this.listRedirects();
    await saveList(
      REDIRECTS_FILE,
      items.filter((item) => item.id !== id),
    );
  }
  async listMessages() {
    const items = await readJsonFile<ContactMessage[]>(MESSAGES_FILE, []);
    return (Array.isArray(items) ? items : []).map(sanitizeMessage);
  }
  async addMessage(message: ContactMessage) {
    const safe = sanitizeMessage(message);
    const items = await this.listMessages();
    await saveList(MESSAGES_FILE, [safe, ...items]);
    return safe;
  }
  async listSeoPlanningDrafts(options?: { lifecycle?: SeoPlanningListLifecycle }) {
    const lifecycle = options?.lifecycle || "active";
    const items = await readJsonFile<SeoPlanningDraft[]>(SEO_PLANNING_FILE, []);
    const all = (Array.isArray(items) ? items : [])
      .map(sanitizeSeoPlanningDraft)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return filterSeoPlanningDraftsByLifecycle(all, lifecycle);
  }
  async #readAllSeoPlanningDrafts() {
    const items = await readJsonFile<SeoPlanningDraft[]>(SEO_PLANNING_FILE, []);
    return (Array.isArray(items) ? items : [])
      .map(sanitizeSeoPlanningDraft)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }
  async getSeoPlanningDraftById(id: string) {
    const items = await this.#readAllSeoPlanningDrafts();
    return items.find((item) => item.id === id) || null;
  }
  async getSeoPlanningDraftByFingerprint(fingerprint: string) {
    const fp = String(fingerprint || "").trim();
    if (!fp) return null;
    const items = await this.#readAllSeoPlanningDrafts();
    return items.find((item) => item.fingerprint === fp) || null;
  }
  async saveSeoPlanningDraft(draft: SeoPlanningDraft) {
    const safe = sanitizeSeoPlanningDraft(draft);
    if (!safe.id || !safe.fingerprint) {
      throw new Error("Planning draft requires id and fingerprint.");
    }
    return withSeoPlanningJsonWriteLock(async () => {
      // Re-read inside the lock so waiters observe the prior writer's commit.
      const items = await this.#readAllSeoPlanningDrafts();
      const fingerprintOwner = items.find(
        (item) => item.fingerprint === safe.fingerprint && item.id !== safe.id,
      );
      if (fingerprintOwner) {
        throw new Error("Planning draft fingerprint already exists.");
      }
      const existing = items.find((item) => item.id === safe.id);
      if (existing) {
        // Final boundary: ordinary save cannot clear Archive or mutate archived drafts.
        assertSeoPlanningDraftMutableForOrdinarySave(existing);
        const toWrite = sanitizeSeoPlanningDraft({
          ...safe,
          // Preserve authoritative lifecycle; only Restore may clear archivedAt.
          archivedAt: existing.archivedAt ?? null,
        });
        const next = items.map((item) => (item.id === safe.id ? toWrite : item));
        await saveList(SEO_PLANNING_FILE, next);
        return toWrite;
      }
      const next = [...items, safe];
      await saveList(SEO_PLANNING_FILE, next);
      return safe;
    });
  }
  async archiveSeoPlanningDraft(id: string) {
    const want = String(id || "").trim();
    if (!want) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
    return withSeoPlanningJsonWriteLock(async () => {
      const items = await this.#readAllSeoPlanningDrafts();
      const index = items.findIndex((item) => item.id === want);
      if (index < 0) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
      const applied = archiveSeoPlanningDraftRecord(items[index]!);
      if (!applied.ok) return applied;
      const safe = sanitizeSeoPlanningDraft(applied.draft);
      const next = items.map((item, i) => (i === index ? safe : item));
      await saveList(SEO_PLANNING_FILE, next);
      return { ok: true as const, draft: safe };
    });
  }
  async restoreSeoPlanningDraft(id: string) {
    const want = String(id || "").trim();
    if (!want) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
    return withSeoPlanningJsonWriteLock(async () => {
      const items = await this.#readAllSeoPlanningDrafts();
      const index = items.findIndex((item) => item.id === want);
      if (index < 0) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
      const applied = restoreSeoPlanningDraftRecord(items[index]!);
      if (!applied.ok) return applied;
      const safe = sanitizeSeoPlanningDraft(applied.draft);
      const next = items.map((item, i) => (i === index ? safe : item));
      await saveList(SEO_PLANNING_FILE, next);
      return { ok: true as const, draft: safe };
    });
  }
  async deleteSeoPlanningDraftPermanently(id: string) {
    const want = String(id || "").trim();
    if (!want) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
    return withSeoPlanningJsonWriteLock(async () => {
      const items = await this.#readAllSeoPlanningDrafts();
      const index = items.findIndex((item) => item.id === want);
      if (index < 0) return { ok: false as const, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE };
      const gate = assertArchivedForPermanentDelete(items[index]!);
      if (!gate.ok) return gate;
      const next = items.filter((_, i) => i !== index);
      await saveList(SEO_PLANNING_FILE, next);
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
    const id = String(args.id || "").trim();
    if (!id) return { ok: false, reason: "not_found" };
    if (args.provider !== "gemini" && args.provider !== "openai") {
      return { ok: false, reason: "rejected" };
    }

    // Lock order: Planning file → blog content files (same as Image Prompt / MySQL).
    return withSeoPlanningJsonWriteLock(() =>
      withBlogContentJsonWriteLock(async () => {
        const items = await this.#readAllSeoPlanningDrafts();
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) return { ok: false, reason: "not_found" };

        const latest = items[index]!;
        if (latest.archivedAt) return { ok: false, reason: "rejected" };
        const readers: SeoPlanningPromptAcceptReaders = {
          getPostById: (postId) => this.getPostById(postId),
          listCategories: () => this.listCategories(),
        };
        if (args.acceptLatest && !(await args.acceptLatest(latest, readers))) {
          return { ok: false, reason: "rejected" };
        }

        const basePayload =
          latest.payload && typeof latest.payload === "object" && !Array.isArray(latest.payload)
            ? { ...(latest.payload as Record<string, unknown>) }
            : {};
        const nextPayload = mergeWritingPromptCache(basePayload, args.provider, args.entry);
        const updatedAt = new Date().toISOString();
        const nextDraft = sanitizeSeoPlanningDraft({
          ...latest,
          payload: nextPayload,
          updatedAt,
        });
        const next = items.map((item, i) => (i === index ? nextDraft : item));
        await saveList(SEO_PLANNING_FILE, next);
        return { ok: true, draft: nextDraft };
      }),
    );
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
    const id = String(args.id || "").trim();
    if (!id) return { ok: false, reason: "not_found" };
    if (args.provider !== "gemini" && args.provider !== "openai") {
      return { ok: false, reason: "rejected" };
    }

    // Lock order: Planning file → blog content files (mirrors MySQL Planning → Post → Category).
    return withSeoPlanningJsonWriteLock(() =>
      withBlogContentJsonWriteLock(async () => {
        const items = await this.#readAllSeoPlanningDrafts();
        const index = items.findIndex((item) => item.id === id);
        if (index < 0) return { ok: false, reason: "not_found" };

        const latest = items[index]!;
        if (latest.archivedAt) return { ok: false, reason: "rejected" };
        const readers: SeoPlanningPromptAcceptReaders = {
          getPostById: (postId) => this.getPostById(postId),
          listCategories: () => this.listCategories(),
        };
        if (args.acceptLatest && !(await args.acceptLatest(latest, readers))) {
          return { ok: false, reason: "rejected" };
        }

        const basePayload =
          latest.payload && typeof latest.payload === "object" && !Array.isArray(latest.payload)
            ? { ...(latest.payload as Record<string, unknown>) }
            : {};
        const nextPayload = mergeImagePromptCache(basePayload, args.provider, args.entry);
        const updatedAt = new Date().toISOString();
        const nextDraft = sanitizeSeoPlanningDraft({
          ...latest,
          payload: nextPayload,
          updatedAt,
        });
        const next = items.map((item, i) => (i === index ? nextDraft : item));
        await saveList(SEO_PLANNING_FILE, next);
        return { ok: true, draft: nextDraft };
      }),
    );
  }
  async handoffSeoPlanningToBlog(planningDraftId: string): Promise<SeoPlanningHandoffResult> {
    const id = String(planningDraftId || "").trim();
    if (!id) {
      return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE, code: "planning_not_found" };
    }

    // Lock order: Planning → Blog (same as prompt-cache write boundary).
    return withSeoPlanningJsonWriteLock(() =>
      withBlogContentJsonWriteLock(async () => {
        const planningItems = await this.#readAllSeoPlanningDrafts();
        const index = planningItems.findIndex((item) => item.id === id);
        if (index < 0) {
          return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE, code: "planning_not_found" };
        }
        const latest = planningItems[index]!;
        const eligible = evaluateSeoPlanningHandoffEligibility(latest);
        if (!eligible.ok) return eligible;

        const posts = (await readJsonFile<BlogPost[]>(POSTS_FILE, [])).map(sanitizePost);

        if (eligible.draft.recommendation === "REFRESH_EXISTING") {
          const targetId = String(eligible.draft.targetPostId || "").trim();
          if (!targetId) {
            return {
              ok: false,
              error: SEO_PLANNING_HANDOFF_REFRESH_TARGET_REQUIRED_MESSAGE,
              code: "refresh_target_required",
            };
          }
          const target = posts.find((post) => post.id === targetId);
          if (!target) {
            return {
              ok: false,
              error: SEO_PLANNING_HANDOFF_REFRESH_TARGET_MISSING_MESSAGE,
              code: "refresh_target_missing",
            };
          }
          return handoffSuccess({
            postId: target.id,
            created: false,
            recommendation: "REFRESH_EXISTING",
          });
        }

        // NEW_BLOG
        const linkedId = String(eligible.draft.linkedPostId || "").trim();
        if (linkedId) {
          const linked = posts.find((post) => post.id === linkedId);
          if (!linked) {
            return {
              ok: false,
              error: SEO_PLANNING_HANDOFF_LINKED_POST_MISSING_MESSAGE,
              code: "linked_post_missing",
            };
          }
          return handoffSuccess({
            postId: linked.id,
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

        if (posts.some((post) => post.slug === draftPost.slug && post.id !== draftPost.id)) {
          return {
            ok: false,
            error: SEO_PLANNING_HANDOFF_SLUG_CONFLICT_MESSAGE,
            code: "slug_conflict",
          };
        }

        // Final Archive boundary before any durable write (lock already held).
        assertSeoPlanningDraftMutableForOrdinarySave(latest);

        const updatedAt = new Date().toISOString();
        const nextPlanning = sanitizeSeoPlanningDraft({
          ...latest,
          linkedPostId: draftPost.id,
          updatedAt,
        });

        // Reserve linkedPostId first so a Blog write failure cannot create a second draft on retry.
        const nextPlanningItems = planningItems.map((item, i) => (i === index ? nextPlanning : item));
        await saveList(SEO_PLANNING_FILE, nextPlanningItems);
        await saveList(POSTS_FILE, [...posts, draftPost]);

        return handoffSuccess({
          postId: draftPost.id,
          created: true,
          recommendation: "NEW_BLOG",
        });
      }),
    );
  }
  async dashboardStats(): Promise<CmsDashboardStats> {
    const [pages, posts, faqs, plans, media, redirects, messages] = await Promise.all([
      readJsonFile<{ pages: unknown[] }>("pages.json", { pages: [] }),
      this.listPosts(),
      this.listFaqs(),
      this.listPlans(),
      readJsonFile<{ assets: unknown[] }>("media.json", { assets: [] }),
      this.listRedirects(),
      this.listMessages(),
    ]);
    return {
      pages: Array.isArray(pages.pages) ? pages.pages.length : 0,
      posts: posts.length,
      drafts: posts.filter((post) => post.status === "draft").length,
      publishedPosts: posts.filter((post) => post.status === "published").length,
      faqs: faqs.length,
      plans: plans.length,
      media: Array.isArray(media.assets) ? media.assets.length : 0,
      redirects: redirects.length,
      messages: messages.length,
    };
  }
}
