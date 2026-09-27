import {
  resolveInternalRedirectPath,
  buildPublicTargetIndex,
} from "@/lib/cms/internal-links";
import { resolveBlogPostCanonical } from "@/lib/cms/blog-paths";
import { withSlash } from "@/lib/cms/redirects";
import {
  PAGE_SEO_KEYS,
  PAGE_SEO_META,
  type PageSeoKey,
} from "@/lib/cms/page-seo";
import {
  SIDHU_SEO_DESCRIPTION_GUIDE,
  SIDHU_SEO_PUBLIC_ORIGIN,
  SIDHU_SEO_TITLE_GUIDE,
  sidhuBodyFromSections,
  sidhuCanonicalIssue,
  sidhuHeadingFromSections,
  sidhuPagePreviewPath,
  sidhuPreviewFromCategory,
  sidhuPreviewFromPageSeo,
  sidhuPreviewFromPost,
} from "@/lib/cms/sidhu-seo-preview";
import { publicPagePath } from "@/lib/site-url";
import type {
  BlogCategory,
  BlogPost,
  CmsPage,
  RedirectRule,
  SiteSettings,
} from "@/lib/cms/types";

export type MetadataEntityKind = "page" | "post" | "category";

export type MetadataIssue =
  | "DUPLICATE_TITLE"
  | "DUPLICATE_DESCRIPTION"
  | "CANONICAL_COLLISION"
  | "CANONICAL_TO_OTHER"
  | "CANONICAL_TO_REDIRECT"
  | "CANONICAL_MISSING_TARGET"
  | "CANONICAL_HTTP"
  | "CANONICAL_WWW"
  | "CANONICAL_MALFORMED"
  | "CANONICAL_TARGET_NOINDEX"
  | "INDEXABLE_TO_OTHER_CANONICAL"
  | "NOINDEX_SITEMAP_INCLUDED"
  | "TITLE_SHORT"
  | "TITLE_LONG"
  | "DESCRIPTION_SHORT"
  | "DESCRIPTION_LONG"
  | "MISSING_VISIBLE_H1";

export type LengthHint = "SHORT" | "LONG" | "WITHIN_EDITORIAL_RANGE";

export type SeoMetadataEntity = {
  id: string;
  kind: MetadataEntityKind;
  label: string;
  publicPath: string;
  publicUrl: string;
  effectiveTitle: string;
  effectiveDescription: string;
  titleLength: number;
  descriptionLength: number;
  titleLengthHint: LengthHint;
  descriptionLengthHint: LengthHint;
  /** Absolute URL Google would see for canonical (after fallbacks). */
  effectiveCanonical: string;
  /** Path-only form of effective canonical when same-site; otherwise "". */
  effectiveCanonicalPath: string;
  storedCanonical: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  sitemapInclude: boolean;
  visibleH1: string;
  editHref: string | null;
  issues: MetadataIssue[];
};

export type DuplicateGroup = {
  key: string;
  value: string;
  entityIds: string[];
  urls: string[];
  note: string;
};

export type MetadataDiagnosticsSummary = {
  indexable: number;
  noindex: number;
  duplicateTitleGroups: number;
  duplicateDescriptionGroups: number;
  canonicalCollisions: number;
  canonicalToRedirect: number;
  canonicalHttp: number;
  canonicalWww: number;
  missingMetadata: number;
  lengthWarnings: number;
  indexCanonicalConflicts: number;
};

export type MetadataDiagnosticsReport = {
  entities: SeoMetadataEntity[];
  summary: MetadataDiagnosticsSummary;
  duplicateTitles: DuplicateGroup[];
  duplicateDescriptions: DuplicateGroup[];
  noindexDuplicateTitles: DuplicateGroup[];
  noindexDuplicateDescriptions: DuplicateGroup[];
};

const TITLE_SHORT_BELOW = 30;
const DESCRIPTION_SHORT_BELOW = 70;

function trim(value: string | undefined | null) {
  return String(value || "").trim();
}

/** Exact duplicate key: trim, collapse whitespace, case-insensitive. Keeps brand words. */
export function normalizeMetadataText(value: string) {
  return trim(value).replace(/\s+/g, " ").toLowerCase();
}

export function editorialTitleHint(length: number): LengthHint {
  if (length < TITLE_SHORT_BELOW) return "SHORT";
  if (length > SIDHU_SEO_TITLE_GUIDE) return "LONG";
  return "WITHIN_EDITORIAL_RANGE";
}

export function editorialDescriptionHint(length: number): LengthHint {
  if (length < DESCRIPTION_SHORT_BELOW) return "SHORT";
  if (length > SIDHU_SEO_DESCRIPTION_GUIDE) return "LONG";
  return "WITHIN_EDITORIAL_RANGE";
}

export function parseCanonicalTarget(
  storedCanonical: string,
  publicPath: string,
  origin = SIDHU_SEO_PUBLIC_ORIGIN,
): {
  absolute: string;
  path: string;
  sameSite: boolean;
  malformed: boolean;
  http: boolean;
  www: boolean;
} {
  const value = trim(storedCanonical);
  const fallbackPath = withSlash(publicPath);
  const fallbackAbsolute = `${origin.replace(/\/$/, "")}${fallbackPath}`;

  if (!value) {
    return {
      absolute: fallbackAbsolute,
      path: fallbackPath,
      sameSite: true,
      malformed: false,
      http: false,
      www: false,
    };
  }

  if (value.startsWith("/") && !value.startsWith("//")) {
    if (/\s/.test(value)) {
      return {
        absolute: value,
        path: "",
        sameSite: false,
        malformed: true,
        http: false,
        www: false,
      };
    }
    const path = withSlash(value.split("?")[0]?.split("#")[0] || "/");
    return {
      absolute: `${origin.replace(/\/$/, "")}${path}`,
      path,
      sameSite: true,
      malformed: false,
      http: false,
      www: false,
    };
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const apex = "theflixiptv.com";
    const bare = host.replace(/^www\./, "");
    const sameSite = bare === apex;
    const path = sameSite ? withSlash(url.pathname || "/") : "";
    return {
      absolute: url.toString(),
      path,
      sameSite,
      malformed: url.protocol !== "http:" && url.protocol !== "https:",
      http: url.protocol === "http:",
      www: host === "www.theflixiptv.com",
    };
  } catch {
    return {
      absolute: value,
      path: "",
      sameSite: false,
      malformed: true,
      http: false,
      www: false,
    };
  }
}

function pageFallbackTitle(key: PageSeoKey, pages: CmsPage[]) {
  if (key === "home") {
    const home = pages.find((p) => p.id === "page-home" || p.slug === "/");
    return home?.name || PAGE_SEO_META[key].label;
  }
  if (key === "subscriptions") {
    const page = pages.find((p) => p.id === "page-subscriptions" || p.slug === "/iptv-subscription-uk/");
    return page?.name || PAGE_SEO_META[key].label;
  }
  if (key === "contact") {
    const page = pages.find((p) => p.id === "page-contact" || p.slug === "/contact/");
    return page?.name || PAGE_SEO_META[key].label;
  }
  if (key === "blog") return "Blog";
  const meta = PAGE_SEO_META[key];
  const leaf = sidhuPagePreviewPath(key);
  const page = pages.find((p) => withSlash(p.slug) === withSlash(leaf));
  return page?.name || meta.label;
}

function pageFallbackDescription(key: PageSeoKey, settings: SiteSettings, pages: CmsPage[]) {
  const seo = settings.pageSeo[key];
  if (trim(seo.description)) return seo.description;
  if (key === "home") return settings.tagline || "";
  if (key === "blog") return "Guides and updates from Flix IPTV.";
  const leaf = sidhuPagePreviewPath(key);
  const page = pages.find((p) => withSlash(p.slug) === withSlash(leaf));
  const heading = page ? sidhuHeadingFromSections(page.sections) : "";
  return heading || "";
}

function pageVisibleH1(key: PageSeoKey, pages: CmsPage[]) {
  const leaf = sidhuPagePreviewPath(key);
  const page = pages.find((p) => {
    if (key === "home") return p.id === "page-home" || p.slug === "/" || withSlash(p.slug) === "/welcome/";
    return withSlash(p.slug) === withSlash(leaf);
  });
  if (!page) return key === "blog" ? "Blog" : "";
  return sidhuHeadingFromSections(page.sections) || page.name || "";
}

export function buildSeoMetadataEntities(input: {
  settings: SiteSettings;
  pages: CmsPage[];
  posts: BlogPost[];
  categories: BlogCategory[];
}): SeoMetadataEntity[] {
  const { settings, pages, posts, categories } = input;
  const opts = {
    siteName: settings.siteName,
    siteTagline: settings.tagline,
    defaultOgImage: settings.branding.defaultOgImage,
  };
  const entities: SeoMetadataEntity[] = [];

  for (const key of PAGE_SEO_KEYS) {
    const seo = settings.pageSeo[key];
    const publicPath = sidhuPagePreviewPath(key);
    const preview = sidhuPreviewFromPageSeo(seo, {
      key,
      fallbackTitle: pageFallbackTitle(key, pages),
      fallbackDescription: pageFallbackDescription(key, settings, pages),
      ...opts,
      contentTitle: pageVisibleH1(key, pages),
      bodyHtml: (() => {
        const leaf = publicPath;
        const page = pages.find((p) => withSlash(p.slug) === withSlash(leaf) || (key === "home" && p.slug === "/"));
        return page ? sidhuBodyFromSections(page.sections) : "";
      })(),
    });
    const stored = trim(seo.canonicalUrl);
    const canon = parseCanonicalTarget(stored, publicPath);
    entities.push({
      id: `page-${key}`,
      kind: "page",
      label: PAGE_SEO_META[key].label,
      publicPath,
      publicUrl: `${SIDHU_SEO_PUBLIC_ORIGIN}${publicPath}`,
      effectiveTitle: preview.effectiveTitle,
      effectiveDescription: preview.effectiveDescription,
      titleLength: preview.effectiveTitle.length,
      descriptionLength: preview.effectiveDescription.length,
      titleLengthHint: editorialTitleHint(preview.effectiveTitle.length),
      descriptionLengthHint: editorialDescriptionHint(preview.effectiveDescription.length),
      effectiveCanonical: canon.absolute,
      effectiveCanonicalPath: canon.path,
      storedCanonical: stored,
      robotsIndex: preview.robotsIndex,
      robotsFollow: preview.robotsFollow,
      sitemapInclude: preview.sitemapInclude,
      visibleH1: pageVisibleH1(key, pages),
      editHref: PAGE_SEO_META[key].editorHref,
      issues: [],
    });
  }

  for (const post of posts) {
    if (post.status !== "published") continue;
    const resolvedCanonical = resolveBlogPostCanonical(post);
    const publicPath = resolvedCanonical.startsWith("http")
      ? parseCanonicalTarget(resolvedCanonical, `/blogs/${post.slug}/`).path || `/blogs/${post.slug}/`
      : withSlash(resolvedCanonical);
    const preview = sidhuPreviewFromPost(post, opts);
    const stored = trim(post.canonicalUrl);
    const canon = resolvedCanonical.startsWith("http")
      ? parseCanonicalTarget(resolvedCanonical, `/blogs/${post.slug}/`)
      : parseCanonicalTarget("", publicPath);

    entities.push({
      id: `post-${post.id}`,
      kind: "post",
      label: post.title || post.slug,
      publicPath,
      publicUrl: resolvedCanonical.startsWith("http")
        ? resolvedCanonical
        : `${SIDHU_SEO_PUBLIC_ORIGIN}${publicPath}`,
      effectiveTitle: preview.effectiveTitle,
      effectiveDescription: preview.effectiveDescription,
      titleLength: preview.effectiveTitle.length,
      descriptionLength: preview.effectiveDescription.length,
      titleLengthHint: editorialTitleHint(preview.effectiveTitle.length),
      descriptionLengthHint: editorialDescriptionHint(preview.effectiveDescription.length),
      effectiveCanonical: canon.absolute,
      effectiveCanonicalPath: canon.path,
      storedCanonical: stored,
      robotsIndex: post.robotsIndex,
      robotsFollow: post.robotsFollow,
      sitemapInclude: post.sitemapInclude,
      visibleH1: post.title || "",
      editHref: `/sidhu/blog/${post.id}/`,
      issues: [],
    });
  }

  for (const category of categories) {
    if (!category.active) continue;
    const publicPath = withSlash(`/category/${category.slug}/`);
    const preview = sidhuPreviewFromCategory(category, opts);
    const stored = trim(category.canonicalUrl);
    const canon = parseCanonicalTarget(stored, publicPath);
    entities.push({
      id: `category-${category.id}`,
      kind: "category",
      label: category.name || category.slug,
      publicPath,
      publicUrl: `${SIDHU_SEO_PUBLIC_ORIGIN}${publicPath}`,
      effectiveTitle: preview.effectiveTitle,
      effectiveDescription: preview.effectiveDescription,
      titleLength: preview.effectiveTitle.length,
      descriptionLength: preview.effectiveDescription.length,
      titleLengthHint: editorialTitleHint(preview.effectiveTitle.length),
      descriptionLengthHint: editorialDescriptionHint(preview.effectiveDescription.length),
      effectiveCanonical: canon.absolute,
      effectiveCanonicalPath: canon.path,
      storedCanonical: stored,
      robotsIndex: preview.robotsIndex,
      robotsFollow: preview.robotsFollow,
      sitemapInclude: preview.sitemapInclude,
      visibleH1: category.name || "",
      editHref: `/sidhu/blog/category/${category.id}/`,
      issues: [],
    });
  }

  return entities;
}

function groupDuplicates(
  entities: SeoMetadataEntity[],
  field: "effectiveTitle" | "effectiveDescription",
  note: string,
): DuplicateGroup[] {
  const map = new Map<string, SeoMetadataEntity[]>();
  for (const entity of entities) {
    const raw = entity[field];
    if (!trim(raw)) continue;
    const key = normalizeMetadataText(raw);
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(entity);
    map.set(key, list);
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, list] of map) {
    if (list.length < 2) continue;
    groups.push({
      key,
      value: list[0][field],
      entityIds: list.map((e) => e.id),
      urls: list.map((e) => e.publicUrl),
      note,
    });
  }
  return groups.sort((a, b) => b.entityIds.length - a.entityIds.length || a.value.localeCompare(b.value));
}

function classifyEntityIssues(
  entity: SeoMetadataEntity,
  all: SeoMetadataEntity[],
  redirects: RedirectRule[],
  targets: ReturnType<typeof buildPublicTargetIndex>,
): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  const storedIssue = sidhuCanonicalIssue(entity.storedCanonical);
  if (storedIssue?.id === "canonical-http") issues.push("CANONICAL_HTTP");
  if (storedIssue?.id === "canonical-www") issues.push("CANONICAL_WWW");
  if (storedIssue?.id === "canonical-malformed") issues.push("CANONICAL_MALFORMED");

  const path = entity.effectiveCanonicalPath;
  const publicPath = withSlash(entity.publicPath);

  if (path && path !== publicPath) {
    issues.push("CANONICAL_TO_OTHER");
    if (entity.robotsIndex) issues.push("INDEXABLE_TO_OTHER_CANONICAL");
  }

  if (path) {
    const resolved = resolveInternalRedirectPath(path, redirects);
    if (resolved.redirected) {
      issues.push("CANONICAL_TO_REDIRECT");
    }
    const checkPath = resolved.redirected ? resolved.finalPath : path;
    const target = targets.get(checkPath);
    if (!target) {
      issues.push("CANONICAL_MISSING_TARGET");
    } else if (!target.indexable) {
      issues.push("CANONICAL_TARGET_NOINDEX");
    }
  }

  if (!entity.robotsIndex && entity.sitemapInclude) {
    issues.push("NOINDEX_SITEMAP_INCLUDED");
  }

  if (entity.titleLengthHint === "SHORT") issues.push("TITLE_SHORT");
  if (entity.titleLengthHint === "LONG") issues.push("TITLE_LONG");
  if (entity.descriptionLengthHint === "SHORT") issues.push("DESCRIPTION_SHORT");
  if (entity.descriptionLengthHint === "LONG") issues.push("DESCRIPTION_LONG");

  if (!trim(entity.visibleH1)) issues.push("MISSING_VISIBLE_H1");

  // Collision / duplicate flags applied later by scan
  void all;
  return issues;
}

export function scanMetadataDiagnostics(input: {
  settings: SiteSettings;
  pages: CmsPage[];
  posts: BlogPost[];
  categories: BlogCategory[];
  redirects: RedirectRule[];
}): MetadataDiagnosticsReport {
  const entities = buildSeoMetadataEntities(input);
  const targets = buildPublicTargetIndex(input.pages, input.posts, input.categories, input.settings);

  for (const entity of entities) {
    entity.issues = classifyEntityIssues(entity, entities, input.redirects, targets);
  }

  const indexable = entities.filter((e) => e.robotsIndex);
  const noindex = entities.filter((e) => !e.robotsIndex);

  const duplicateTitles = groupDuplicates(
    indexable,
    "effectiveTitle",
    "Same effective SEO title used by multiple indexable URLs.",
  );
  const duplicateDescriptions = groupDuplicates(
    indexable,
    "effectiveDescription",
    "Same effective meta description used by multiple indexable URLs.",
  );
  const noindexDuplicateTitles = groupDuplicates(
    noindex,
    "effectiveTitle",
    "Same effective SEO title among noindex URLs (excluded from primary totals).",
  );
  const noindexDuplicateDescriptions = groupDuplicates(
    noindex,
    "effectiveDescription",
    "Same effective meta description among noindex URLs (excluded from primary totals).",
  );

  const titleIds = new Set(duplicateTitles.flatMap((g) => g.entityIds));
  const descIds = new Set(duplicateDescriptions.flatMap((g) => g.entityIds));

  // Canonical collisions among indexable
  const canonMap = new Map<string, SeoMetadataEntity[]>();
  for (const entity of indexable) {
    const key = normalizeMetadataText(entity.effectiveCanonical);
    if (!key) continue;
    const list = canonMap.get(key) || [];
    list.push(entity);
    canonMap.set(key, list);
  }
  let canonicalCollisions = 0;
  for (const [, list] of canonMap) {
    if (list.length < 2) continue;
    canonicalCollisions += 1;
    for (const entity of list) {
      if (!entity.issues.includes("CANONICAL_COLLISION")) entity.issues.push("CANONICAL_COLLISION");
    }
  }

  for (const entity of entities) {
    if (titleIds.has(entity.id) && !entity.issues.includes("DUPLICATE_TITLE")) {
      entity.issues.push("DUPLICATE_TITLE");
    }
    if (descIds.has(entity.id) && !entity.issues.includes("DUPLICATE_DESCRIPTION")) {
      entity.issues.push("DUPLICATE_DESCRIPTION");
    }
  }

  const summary: MetadataDiagnosticsSummary = {
    indexable: indexable.length,
    noindex: noindex.length,
    duplicateTitleGroups: duplicateTitles.length,
    duplicateDescriptionGroups: duplicateDescriptions.length,
    canonicalCollisions,
    canonicalToRedirect: entities.filter((e) => e.issues.includes("CANONICAL_TO_REDIRECT")).length,
    canonicalHttp: entities.filter((e) => e.issues.includes("CANONICAL_HTTP")).length,
    canonicalWww: entities.filter((e) => e.issues.includes("CANONICAL_WWW")).length,
    missingMetadata: entities.filter(
      (e) =>
        !trim(e.effectiveTitle) ||
        !trim(e.effectiveDescription) ||
        e.issues.includes("MISSING_VISIBLE_H1"),
    ).length,
    lengthWarnings: entities.filter((e) =>
      e.issues.some((i) => i === "TITLE_SHORT" || i === "TITLE_LONG" || i === "DESCRIPTION_SHORT" || i === "DESCRIPTION_LONG"),
    ).length,
    indexCanonicalConflicts: entities.filter((e) =>
      e.issues.some(
        (i) =>
          i === "INDEXABLE_TO_OTHER_CANONICAL" ||
          i === "CANONICAL_TARGET_NOINDEX" ||
          i === "NOINDEX_SITEMAP_INCLUDED" ||
          i === "CANONICAL_COLLISION",
      ),
    ).length,
  };

  return {
    entities,
    summary,
    duplicateTitles,
    duplicateDescriptions,
    noindexDuplicateTitles,
    noindexDuplicateDescriptions,
  };
}

export type MetadataFilter =
  | "all"
  | "duplicates"
  | "canonical"
  | "missing"
  | "warnings"
  | "noindex";

export function filterMetadataEntities(
  entities: SeoMetadataEntity[],
  filter: MetadataFilter,
  query = "",
) {
  const q = query.trim().toLowerCase();
  return entities.filter((entity) => {
    if (filter === "duplicates") {
      if (!entity.issues.some((i) => i === "DUPLICATE_TITLE" || i === "DUPLICATE_DESCRIPTION" || i === "CANONICAL_COLLISION")) {
        return false;
      }
    } else if (filter === "canonical") {
      if (
        !entity.issues.some((i) =>
          [
            "CANONICAL_COLLISION",
            "CANONICAL_TO_OTHER",
            "CANONICAL_TO_REDIRECT",
            "CANONICAL_MISSING_TARGET",
            "CANONICAL_HTTP",
            "CANONICAL_WWW",
            "CANONICAL_MALFORMED",
            "CANONICAL_TARGET_NOINDEX",
            "INDEXABLE_TO_OTHER_CANONICAL",
          ].includes(i),
        )
      ) {
        return false;
      }
    } else if (filter === "missing") {
      if (!entity.issues.includes("MISSING_VISIBLE_H1")) return false;
    } else if (filter === "warnings") {
      if (
        !entity.issues.some((i) =>
          ["TITLE_SHORT", "TITLE_LONG", "DESCRIPTION_SHORT", "DESCRIPTION_LONG", "NOINDEX_SITEMAP_INCLUDED"].includes(i),
        )
      ) {
        return false;
      }
    } else if (filter === "noindex") {
      if (entity.robotsIndex) return false;
    }

    if (!q) return true;
    const hay = [
      entity.label,
      entity.publicUrl,
      entity.effectiveTitle,
      entity.effectiveDescription,
      entity.effectiveCanonical,
      entity.kind,
      ...entity.issues,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Exported for tests: post public path uses resolveBlogPostCanonical. */
export function postPublicPathForDiagnostics(post: Pick<BlogPost, "slug" | "canonicalUrl">) {
  return resolveBlogPostCanonical(post);
}

export function pagePublicPathForDiagnostics(slug: string) {
  return publicPagePath(slug);
}
