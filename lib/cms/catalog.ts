import type {
  BlogCategory,
  BlogPost,
  CmsDashboardStats,
  ContactMessage,
  FaqItem,
  PricingPlan,
  RedirectRule,
} from "@/lib/cms/types";

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
  savePost(post: BlogPost): Promise<BlogPost>;
  deletePost(id: string): Promise<void>;
  listRedirects(): Promise<RedirectRule[]>;
  listActiveRedirects(): Promise<RedirectRule[]>;
  saveRedirect(rule: RedirectRule): Promise<RedirectRule>;
  deleteRedirect(id: string): Promise<void>;
  listMessages(): Promise<ContactMessage[]>;
  addMessage(message: ContactMessage): Promise<ContactMessage>;
  dashboardStats(): Promise<CmsDashboardStats>;
}
