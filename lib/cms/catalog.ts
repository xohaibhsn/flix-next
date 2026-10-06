import type { WritingPromptCacheEntry } from "@/lib/cms/seo-planning/writing-prompt-cache";
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

/** Result of an atomic Planning writing-prompt cache merge (payload.writingPrompts.gemini only). */
export type MergeSeoPlanningGeminiWritingPromptResult =
  | { ok: true; draft: SeoPlanningDraft }
  | { ok: false; reason: "not_found" | "rejected" };

export interface CatalogRepository {
  listPlans(): Promise<PricingPlan[]>;
  savePlan(plan: PricingPlan): Promise<PricingPlan>;
  deletePlan(id: string): Promise<void>;
  listFaqs(): Promise<FaqItem[]>;
  saveFaq(item: FaqItem): Promise<FaqItem>;
  deleteFaq(id: string): Promise<void>;
  listCategories(): Promise<BlogCategory[]>;
  saveCategory(category: BlogCategory): Promise<BlogCategory>;
  deleteCategory(id: string): Promise<void>;
  listPosts(): Promise<BlogPost[]>;
  getPostBySlug(slug: string): Promise<BlogPost | null>;
  getPostById(id: string): Promise<BlogPost | null>;
  savePost(post: BlogPost): Promise<BlogPost>;
  deletePost(id: string): Promise<void>;
  listRedirects(): Promise<RedirectRule[]>;
  listActiveRedirects(): Promise<RedirectRule[]>;
  getActiveRedirectBySourcePath(sourcePath: string): Promise<RedirectRule | null>;
  saveRedirect(rule: RedirectRule): Promise<RedirectRule>;
  deleteRedirect(id: string): Promise<void>;
  listMessages(): Promise<ContactMessage[]>;
  addMessage(message: ContactMessage): Promise<ContactMessage>;
  listSeoPlanningDrafts(): Promise<SeoPlanningDraft[]>;
  getSeoPlanningDraftById(id: string): Promise<SeoPlanningDraft | null>;
  getSeoPlanningDraftByFingerprint(fingerprint: string): Promise<SeoPlanningDraft | null>;
  saveSeoPlanningDraft(draft: SeoPlanningDraft): Promise<SeoPlanningDraft>;
  /**
   * Atomic D2 prompt-cache write: re-read latest under write lock/transaction,
   * merge ONLY payload.writingPrompts.gemini, preserve all other latest fields/siblings.
   */
  mergeSeoPlanningGeminiWritingPromptCache(args: {
    id: string;
    entry: WritingPromptCacheEntry;
    acceptLatest?: (latest: SeoPlanningDraft) => boolean | Promise<boolean>;
  }): Promise<MergeSeoPlanningGeminiWritingPromptResult>;
  dashboardStats(): Promise<CmsDashboardStats>;
}
