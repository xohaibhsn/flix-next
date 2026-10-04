/** Server-only loader for UK opportunity research. Not imported by client modules. */

import {
  researchUkContentOpportunities,
  type ResearchUkOpportunitiesResult,
} from "@/lib/cms/ai-seo/research";
import { cms } from "@/lib/cms/repository";

/**
 * Loads a bounded CMS inventory then runs opportunity research.
 * Read-only CMS access — no writes.
 */
export async function researchUkContentOpportunitiesFromCms(args: {
  adminId: string;
  ip: string;
}): Promise<ResearchUkOpportunitiesResult> {
  const [settings, posts, categories] = await Promise.all([
    cms.getSettings(),
    cms.listPosts(),
    cms.listCategories(),
  ]);

  return researchUkContentOpportunities({
    adminId: args.adminId,
    ip: args.ip,
    settings,
    posts,
    categories,
  });
}
