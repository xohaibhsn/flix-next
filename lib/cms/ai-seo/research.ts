import type { OpenAiSeoConfig } from "@/lib/cms/ai-seo/config";
import { requestOpenAiUkOpportunityResearch } from "@/lib/cms/ai-seo/provider";
import { checkAiSeoResearchRateLimit } from "@/lib/cms/ai-seo/rate-limit";
import {
  buildSeoResearchInventory,
  type SeoResearchInventory,
} from "@/lib/cms/ai-seo/research-inventory";
import type { SeoResearchResult } from "@/lib/cms/ai-seo/research-schemas";
import type { BlogCategory, BlogPost, SiteSettings } from "@/lib/cms/types";

export type ResearchUkOpportunitiesSuccess = {
  ok: true;
  research: SeoResearchResult;
};

export type ResearchUkOpportunitiesFailure = {
  ok: false;
  error: string;
  code?:
    | "not_configured"
    | "unauthorized"
    | "rate_limited"
    | "timeout"
    | "unavailable"
    | "invalid_response"
    | "empty";
};

export type ResearchUkOpportunitiesResult =
  | ResearchUkOpportunitiesSuccess
  | ResearchUkOpportunitiesFailure;

/**
 * Explicit user-triggered UK opportunity research.
 * Read-only — never writes CMS content or SEO Health memory.
 */
export async function researchUkContentOpportunities(args: {
  adminId: string;
  ip: string;
  fetchImpl?: typeof fetch;
  config?: OpenAiSeoConfig;
  inventory?: SeoResearchInventory;
  settings?: SiteSettings;
  posts?: BlogPost[];
  categories?: BlogCategory[];
}): Promise<ResearchUkOpportunitiesResult> {
  const limited = checkAiSeoResearchRateLimit(args.adminId, args.ip);
  if (!limited.ok) {
    return {
      ok: false,
      code: "rate_limited",
      error: "Research limit reached. Please try again later.",
    };
  }

  if (!args.inventory && !args.settings) {
    return {
      ok: false,
      code: "invalid_response",
      error: "Research inventory was not provided.",
    };
  }

  const inventory =
    args.inventory ??
    buildSeoResearchInventory({
      settings: args.settings as SiteSettings,
      posts: args.posts || [],
      categories: args.categories || [],
    });

  const provider = await requestOpenAiUkOpportunityResearch(inventory, {
    fetchImpl: args.fetchImpl,
    config: args.config,
  });
  if (!provider.ok) {
    return { ok: false, code: provider.code, error: provider.message };
  }

  if (!provider.research.opportunities.length) {
    return {
      ok: false,
      code: "empty",
      error: "No useful UK content opportunities were found in this research run.",
    };
  }

  return { ok: true, research: provider.research };
}
