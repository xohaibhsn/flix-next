/** Server-only loader for UK opportunity research. Not imported by client modules. */

import "server-only";

import {
  researchUkContentOpportunities,
  type ResearchUkOpportunitiesResult,
} from "@/lib/cms/ai-seo/research";
import type { OpenAiSeoConfig } from "@/lib/cms/ai-seo/config";
import { classifyGscPageUrls } from "@/lib/cms/gsc/classify-url";
import {
  buildUkGscEvidencePack,
  type GscSearchAnalyticsQuerier,
} from "@/lib/cms/gsc/evidence-pack";
import type { GscConfig } from "@/lib/cms/gsc/config";
import {
  buildGscResearchFusionContext,
  collectGscPackPageUrls,
} from "@/lib/cms/gsc/research-fusion";
import { buildGscSiteUrlIndex } from "@/lib/cms/gsc/site-url-index";
import { cms } from "@/lib/cms/repository";

/**
 * Loads a bounded CMS inventory, builds GSC evidence (GSC-2) + URL classification
 * (GSC-3) once, then runs a single OpenAI Opportunities research call (GSC-4).
 * Read-only CMS access — no writes. No GSC work on page load.
 */
export async function researchUkContentOpportunitiesFromCms(args: {
  adminId: string;
  ip: string;
  fetchImpl?: typeof fetch;
  config?: OpenAiSeoConfig;
  /** Test injection: replace GSC evidence-pack builder. */
  buildGscPack?: typeof buildUkGscEvidencePack;
  gscConfig?: GscConfig;
  gscQuery?: GscSearchAnalyticsQuerier;
}): Promise<ResearchUkOpportunitiesResult> {
  const [settings, posts, categories, pages, redirects] = await Promise.all([
    cms.getSettings(),
    cms.listPosts(),
    cms.listCategories(),
    cms.listPages(),
    cms.listActiveRedirects(),
  ]);

  const buildPack = args.buildGscPack ?? buildUkGscEvidencePack;
  const pack = await buildPack({
    config: args.gscConfig,
    query: args.gscQuery,
  });

  const pageUrls = collectGscPackPageUrls(pack);
  const siteIndex = buildGscSiteUrlIndex({
    pages,
    posts,
    categories,
    redirects,
  });
  const classifications =
    pageUrls.length > 0 ? classifyGscPageUrls(pageUrls, siteIndex) : [];

  const gscFusion = buildGscResearchFusionContext({
    pack,
    classifications,
  });

  return researchUkContentOpportunities({
    adminId: args.adminId,
    ip: args.ip,
    settings,
    posts,
    categories,
    fetchImpl: args.fetchImpl,
    config: args.config,
    gscFusion,
  });
}
