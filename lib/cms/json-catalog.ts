import type { CatalogRepository } from "@/lib/cms/catalog";
import {
  defaultBlogCategories,
  defaultBlogPosts,
  defaultFaqs,
  defaultPricingPlans,
} from "@/lib/cms/defaults";
import { MANAGED_REDIRECT_SEED_KEY, MANAGED_REDIRECTS, toRedirectRule } from "@/lib/cms/managed-redirects";
import { readJsonFile, writeJsonFile } from "@/lib/cms/json-store";
import {
  sanitizeCategory,
  sanitizeFaq,
  sanitizeMessage,
  sanitizePricingPlan,
  sanitizePost,
  sanitizeRedirect,
} from "@/lib/cms/validation";
import { isReservedRedirectSource, isSelfRedirect, sanitizeRedirectDestination, wouldCreateRedirectLoop } from "@/lib/cms/redirects";
import type {
  BlogCategory,
  BlogPost,
  CmsDashboardStats,
  ContactMessage,
  FaqItem,
  PricingPlan,
  RedirectRule,
} from "@/lib/cms/types";

const PLANS_FILE = "pricing-plans.json";
const FAQS_FILE = "faqs.json";
const CATEGORIES_FILE = "blog-categories.json";
const POSTS_FILE = "blog-posts.json";
const REDIRECTS_FILE = "redirects.json";
const REDIRECT_SEED_FILE = "redirect-seeds.json";
const MESSAGES_FILE = "contact-messages.json";

async function ensureJsonManagedRedirects(items: RedirectRule[]) {
  const flag = await readJsonFile<{ seeded?: boolean }>(REDIRECT_SEED_FILE, {});
  if (flag.seeded) return items;
  const now = new Date().toISOString();
  const next = [...items];
  for (const seed of MANAGED_REDIRECTS) {
    if (next.some((item) => item.sourcePath === seed.sourcePath)) continue;
    next.push(toRedirectRule(seed, now));
  }
  await saveList(REDIRECTS_FILE, next);
  await writeJsonFile(REDIRECT_SEED_FILE, { seeded: true, key: MANAGED_REDIRECT_SEED_KEY });
  return next;
}

async function saveList<T>(file: string, items: T[]) {
  await writeJsonFile(file, items);
  return items;
}

export class JsonCatalogRepository implements CatalogRepository {
  async listPlans() {
    const items = await readJsonFile<PricingPlan[]>(PLANS_FILE, defaultPricingPlans());
    return (Array.isArray(items) ? items : defaultPricingPlans()).map(sanitizePricingPlan);
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
    return (Array.isArray(items) ? items : defaultFaqs()).map(sanitizeFaq);
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
    const safe = sanitizeCategory(category);
    const items = await this.listCategories();
    const next = items.some((row) => row.id === safe.id)
      ? items.map((row) => (row.id === safe.id ? safe : row))
      : [...items, safe];
    await saveList(CATEGORIES_FILE, next);
    return safe;
  }
  async deleteCategory(id: string) {
    const items = await this.listCategories();
    await saveList(
      CATEGORIES_FILE,
      items.filter((item) => item.id !== id),
    );
  }
  async listPosts() {
    const items = await readJsonFile<BlogPost[]>(POSTS_FILE, defaultBlogPosts());
    return (Array.isArray(items) ? items : defaultBlogPosts()).map(sanitizePost);
  }
  async getPostBySlug(slug: string) {
    const items = await this.listPosts();
    return items.find((item) => item.slug === slug) ?? null;
  }
  async savePost(post: BlogPost) {
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
  }
  async deletePost(id: string) {
    const items = await this.listPosts();
    await saveList(
      POSTS_FILE,
      items.filter((item) => item.id !== id),
    );
  }
  async listRedirects() {
    const items = await readJsonFile<RedirectRule[]>(REDIRECTS_FILE, []);
    const list = Array.isArray(items) ? items : [];
    const seeded = await ensureJsonManagedRedirects(list);
    return seeded.map(sanitizeRedirect);
  }
  async listActiveRedirects() {
    const items = await this.listRedirects();
    return items.filter((item) => item.active);
  }
  async saveRedirect(rule: RedirectRule) {
    const safe = sanitizeRedirect(rule);
    if (!safe.sourcePath || isReservedRedirectSource(safe.sourcePath)) {
      throw new Error("That source path is reserved.");
    }
    if (isSelfRedirect(safe.sourcePath, sanitizeRedirectDestination(rule.destinationPath))) {
      throw new Error("Source and destination cannot be the same.");
    }
    const items = await this.listRedirects();
    if (wouldCreateRedirectLoop(safe, items)) {
      throw new Error("That redirect would create a loop.");
    }
    if (items.some((item) => item.sourcePath === safe.sourcePath && item.id !== safe.id && item.active && safe.active)) {
      throw new Error("An active redirect already uses that source path.");
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
