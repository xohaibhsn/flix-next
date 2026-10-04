/**
 * Bounded in-memory site URL index for GSC-3 classification.
 * Built once from CMS/public/redirect inputs; classify many URLs without reloads.
 */

import { blogPostPath } from "@/lib/cms/blog-paths";
import { BLOG_INDEX_SLUG } from "@/lib/cms/blog-index";
import { categoryPublicPath } from "@/lib/cms/category-seo";
import {
  GSC_KNOWN_HISTORICAL_URLS,
  gscKnownHistoricalPathSet,
  type GscKnownHistoricalEntry,
} from "@/lib/cms/gsc/historical-registry";
import { withSlash } from "@/lib/cms/redirects";
import { publicPagePath } from "@/lib/site-url";
import type { BlogCategory, BlogPost, CmsPage, RedirectRule } from "@/lib/cms/types";

export type GscCmsPathMeta = {
  kind: "page" | "post" | "category";
  id: string;
  label: string;
  /** Canonical current public path (trailing slash). */
  path: string;
};

export type GscPublicRouteMeta = {
  path: string;
  label: string;
};

export type GscRedirectEvidence = {
  sourcePath: string;
  destinationPath: string;
  statusCode?: number;
  id?: string;
  source: "built_in" | "cms_redirect";
};

export type GscSiteUrlIndex = {
  currentCmsByPath: Map<string, GscCmsPathMeta>;
  currentPublicNonCmsByPath: Map<string, GscPublicRouteMeta>;
  /** Active CMS redirects only (inactive excluded). */
  activeRedirectsBySource: Map<string, GscRedirectEvidence>;
  knownHistoricalByPath: Map<string, GscKnownHistoricalEntry>;
  /** Diagnostic counters for tests / resource-safety proofs. */
  stats: {
    cmsPaths: number;
    publicPaths: number;
    activeRedirects: number;
    knownHistorical: number;
  };
};

export type GscSiteUrlIndexInput = {
  pages?: Array<Pick<CmsPage, "id" | "name" | "slug" | "status">>;
  posts?: Array<Pick<BlogPost, "id" | "title" | "slug" | "status">>;
  categories?: Array<Pick<BlogCategory, "id" | "name" | "slug" | "active">>;
  redirects?: Array<Pick<RedirectRule, "id" | "sourcePath" | "destinationPath" | "statusCode" | "active">>;
  /** Override historical registry in tests. */
  knownHistorical?: readonly GscKnownHistoricalEntry[];
  /**
   * Extra focused public non-CMS routes.
   * Defaults include the generated blog index `/blogs/`.
   */
  publicNonCmsPaths?: readonly GscPublicRouteMeta[];
};

const DEFAULT_PUBLIC_NON_CMS: readonly GscPublicRouteMeta[] = [
  { path: BLOG_INDEX_SLUG, label: "Blog listing" },
];

/**
 * Build the classification index once from read-only CMS/public inputs.
 * No network existence checks. No mutations.
 */
export function buildGscSiteUrlIndex(input: GscSiteUrlIndexInput = {}): GscSiteUrlIndex {
  const pages = input.pages || [];
  const posts = input.posts || [];
  const categories = input.categories || [];
  const redirects = input.redirects || [];
  const knownHistorical = gscKnownHistoricalPathSet(input.knownHistorical || GSC_KNOWN_HISTORICAL_URLS);

  const currentCmsByPath = new Map<string, GscCmsPathMeta>();
  const currentPublicNonCmsByPath = new Map<string, GscPublicRouteMeta>();
  const activeRedirectsBySource = new Map<string, GscRedirectEvidence>();

  for (const page of pages) {
    if (page.status !== "published") continue;
    const path = publicPagePath(page.slug);
    // Home slug `/` publishes at `/welcome/` — never register bare `/` as CURRENT_CMS.
    currentCmsByPath.set(withSlash(path), {
      kind: "page",
      id: page.id,
      label: page.name,
      path: withSlash(path),
    });
  }

  for (const post of posts) {
    if (post.status !== "published") continue;
    const path = withSlash(blogPostPath(post.slug));
    currentCmsByPath.set(path, {
      kind: "post",
      id: post.id,
      label: post.title,
      path,
    });
  }

  for (const category of categories) {
    if (category.active === false) continue;
    const path = categoryPublicPath(category.slug);
    currentCmsByPath.set(path, {
      kind: "category",
      id: category.id,
      label: category.name,
      path,
    });
  }

  for (const route of input.publicNonCmsPaths || DEFAULT_PUBLIC_NON_CMS) {
    const path = withSlash(route.path);
    // Prefer CURRENT_CMS when the same path is also a published CMS surface.
    if (currentCmsByPath.has(path)) continue;
    currentPublicNonCmsByPath.set(path, { path, label: route.label });
  }

  for (const rule of redirects) {
    if (!rule.active) continue;
    const sourcePath = withSlash(rule.sourcePath);
    // Never treat admin/API as redirect evidence for public GSC classification.
    if (sourcePath === "/sidhu/" || sourcePath.startsWith("/sidhu/")) continue;
    if (sourcePath === "/api/" || sourcePath.startsWith("/api/")) continue;
    const destinationPath = String(rule.destinationPath || "").trim();
    if (!destinationPath) continue;
    activeRedirectsBySource.set(sourcePath, {
      sourcePath,
      destinationPath: /^https?:\/\//i.test(destinationPath)
        ? destinationPath
        : withSlash(destinationPath.split("?")[0] || "/"),
      statusCode: rule.statusCode,
      id: rule.id,
      source: "cms_redirect",
    });
  }

  return {
    currentCmsByPath,
    currentPublicNonCmsByPath,
    activeRedirectsBySource,
    knownHistoricalByPath: knownHistorical,
    stats: {
      cmsPaths: currentCmsByPath.size,
      publicPaths: currentPublicNonCmsByPath.size,
      activeRedirects: activeRedirectsBySource.size,
      knownHistorical: knownHistorical.size,
    },
  };
}
