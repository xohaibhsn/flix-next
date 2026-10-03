import {
  isFilenameLikeAlt,
  isPlaceholderAlt,
  isUrlLikeAlt,
  type ImageIssue,
} from "@/lib/cms/image-diagnostics";
import {
  editorialDescriptionHint,
  editorialTitleHint,
  parseCanonicalTarget,
  type MetadataIssue,
} from "@/lib/cms/metadata-diagnostics";
import { blogPostPath } from "@/lib/cms/blog-paths";
import {
  categoryEffectiveRobotsIndex,
  categoryEffectiveSitemapInclude,
  categoryPublicPath,
} from "@/lib/cms/category-seo";
import { PAGE_SEO_META, type PageSeoKey } from "@/lib/cms/page-seo";
import { withSlash } from "@/lib/cms/redirects";
import {
  IMAGE_ISSUE_DEFINITIONS,
  METADATA_ISSUE_DEFINITIONS,
  type SeoHealthSeverity,
} from "@/lib/cms/seo-health";
import { sidhuCanonicalIssue, sidhuPagePreviewPath, sidhuPreviewFromCategory, sidhuPreviewFromPageSeo, sidhuPreviewFromPost } from "@/lib/cms/sidhu-seo-preview";
import type { BlogCategory, BlogPost, MediaAsset, PageSeo } from "@/lib/cms/types";

export const SEO_POST_SAVE_HEALTH_HREF = "/sidhu/seo/health/";

export type SeoPostSaveFinding = {
  issueCode: string;
  severity: Exclude<SeoHealthSeverity, "healthy">;
  field: string;
  title: string;
  explanation: string;
};

export type SeoPostSaveAdvisory = {
  status: "healthy" | "findings" | "unavailable";
  summary: {
    needsAttention: number;
    review: number;
    editorial: number;
  };
  findings: SeoPostSaveFinding[];
  healthHref: string;
  message: string;
};

const UNAVAILABLE_MESSAGE = "Saved successfully. SEO advisory could not be generated.";

function emptySummary() {
  return { needsAttention: 0, review: 0, editorial: 0 };
}

function summarize(findings: SeoPostSaveFinding[]) {
  const summary = emptySummary();
  for (const finding of findings) {
    if (finding.severity === "needs-attention") summary.needsAttention += 1;
    else if (finding.severity === "review") summary.review += 1;
    else summary.editorial += 1;
  }
  return summary;
}

function advisoryMessage(summary: ReturnType<typeof summarize>, findings: SeoPostSaveFinding[]) {
  if (!findings.length) return "No important SEO problems found.";
  if (summary.needsAttention > 0) {
    return `${summary.needsAttention} ${summary.needsAttention === 1 ? "item needs" : "items need"} attention. Review ${summary.needsAttention === 1 ? "it" : "them"} when you can — nothing was changed automatically.`;
  }
  if (summary.review > 0) {
    return "Saved successfully. A few SEO settings are worth a quick review.";
  }
  return "Saved successfully. Optional editorial SEO suggestions are listed below.";
}

export function buildSeoPostSaveAdvisory(findings: SeoPostSaveFinding[]): SeoPostSaveAdvisory {
  const actionable = findings.filter((f) => f.severity !== ("healthy" as string));
  const summary = summarize(actionable);
  return {
    status: actionable.length ? "findings" : "healthy",
    summary,
    findings: actionable,
    healthHref: SEO_POST_SAVE_HEALTH_HREF,
    message: advisoryMessage(summary, actionable),
  };
}

export function unavailableSeoPostSaveAdvisory(): SeoPostSaveAdvisory {
  return {
    status: "unavailable",
    summary: emptySummary(),
    findings: [],
    healthHref: SEO_POST_SAVE_HEALTH_HREF,
    message: UNAVAILABLE_MESSAGE,
  };
}

/** Never throws — save callers wrap evaluation with this helper. */
export function safeSeoPostSaveAdvisory(evaluate: () => SeoPostSaveFinding[]): SeoPostSaveAdvisory {
  try {
    return buildSeoPostSaveAdvisory(evaluate());
  } catch {
    return unavailableSeoPostSaveAdvisory();
  }
}

function pushMetadata(
  findings: SeoPostSaveFinding[],
  issue: MetadataIssue,
  field: string,
) {
  const definition = METADATA_ISSUE_DEFINITIONS[issue];
  findings.push({
    issueCode: issue,
    severity: definition.severity,
    field,
    title: definition.title,
    explanation: definition.explanation,
  });
}

function pushImage(findings: SeoPostSaveFinding[], issue: ImageIssue, field: string) {
  const definition = IMAGE_ISSUE_DEFINITIONS[issue];
  findings.push({
    issueCode: issue,
    severity: definition.severity as Exclude<SeoHealthSeverity, "healthy">,
    field,
    title: definition.title,
    explanation: definition.explanation,
  });
}

/**
 * Entity-scoped metadata rules only — no corpus duplicates, collisions, or redirect/target indexes.
 * Reuses the same issue codes and length/canonical helpers as SEO Health.
 */
export function classifyEntityScopedMetadataIssues(input: {
  effectiveTitle: string;
  effectiveDescription: string;
  storedCanonical: string;
  publicPath: string;
  robotsIndex: boolean;
  sitemapInclude: boolean;
  visibleH1?: string | null;
}): MetadataIssue[] {
  const issues: MetadataIssue[] = [];
  const storedIssue = sidhuCanonicalIssue(input.storedCanonical);
  if (storedIssue?.id === "canonical-http") issues.push("CANONICAL_HTTP");
  if (storedIssue?.id === "canonical-www") issues.push("CANONICAL_WWW");
  if (storedIssue?.id === "canonical-malformed") issues.push("CANONICAL_MALFORMED");

  const publicPath = withSlash(input.publicPath);
  const canon = parseCanonicalTarget(input.storedCanonical, publicPath);
  if (canon.path && canon.path !== publicPath) {
    issues.push("CANONICAL_TO_OTHER");
    if (input.robotsIndex) issues.push("INDEXABLE_TO_OTHER_CANONICAL");
  }

  if (!input.robotsIndex && input.sitemapInclude) {
    issues.push("NOINDEX_SITEMAP_INCLUDED");
  }

  const titleHint = editorialTitleHint(input.effectiveTitle.length);
  const descriptionHint = editorialDescriptionHint(input.effectiveDescription.length);
  if (titleHint === "SHORT") issues.push("TITLE_SHORT");
  if (titleHint === "LONG") issues.push("TITLE_LONG");
  if (descriptionHint === "SHORT") issues.push("DESCRIPTION_SHORT");
  if (descriptionHint === "LONG") issues.push("DESCRIPTION_LONG");

  if (input.visibleH1 !== undefined && input.visibleH1 !== null && !String(input.visibleH1).trim()) {
    issues.push("MISSING_VISIBLE_H1");
  }

  return issues;
}

function fieldForMetadataIssue(issue: MetadataIssue): string {
  if (issue.startsWith("TITLE_") || issue === "MISSING_VISIBLE_H1") return "Search title / heading";
  if (issue.startsWith("DESCRIPTION_")) return "Meta description";
  if (issue.startsWith("CANONICAL_") || issue === "INDEXABLE_TO_OTHER_CANONICAL") return "Canonical URL";
  if (issue === "NOINDEX_SITEMAP_INCLUDED") return "Indexing / sitemap";
  return "SEO settings";
}

function findingsFromMetadataIssues(issues: MetadataIssue[]): SeoPostSaveFinding[] {
  const findings: SeoPostSaveFinding[] = [];
  for (const issue of issues) {
    pushMetadata(findings, issue, fieldForMetadataIssue(issue));
  }
  return findings;
}

export function evaluatePageSeoPostSave(input: {
  key: PageSeoKey;
  seo: PageSeo;
  siteName: string;
  siteTagline?: string;
  fallbackTitle?: string;
  fallbackDescription?: string;
  visibleH1?: string;
}): SeoPostSaveFinding[] {
  const meta = PAGE_SEO_META[input.key];
  const publicPath = sidhuPagePreviewPath(input.key);
  const preview = sidhuPreviewFromPageSeo(input.seo, {
    key: input.key,
    fallbackTitle: input.fallbackTitle || meta.label,
    fallbackDescription: input.fallbackDescription || "",
    siteName: input.siteName,
    siteTagline: input.siteTagline,
    contentTitle: input.visibleH1,
  });
  const issues = classifyEntityScopedMetadataIssues({
    effectiveTitle: preview.effectiveTitle,
    effectiveDescription: preview.effectiveDescription,
    storedCanonical: input.seo.canonicalUrl,
    publicPath,
    robotsIndex: preview.robotsIndex,
    sitemapInclude: preview.sitemapInclude,
    visibleH1: input.visibleH1,
  });
  return findingsFromMetadataIssues(issues);
}

export function evaluatePostSeoPostSave(input: {
  post: BlogPost;
  siteName: string;
  siteTagline?: string;
  featuredMedia?: MediaAsset | null;
}): SeoPostSaveFinding[] {
  const { post } = input;
  const findings: SeoPostSaveFinding[] = [];

  if (!String(post.slug || "").trim()) {
    findings.push({
      issueCode: "SLUG_MISSING",
      severity: "needs-attention",
      field: "Slug",
      title: "The post slug is missing",
      explanation: "Public blog URLs need a slug. Add one so the post can publish to a stable address.",
    });
  }

  const preview = sidhuPreviewFromPost(post, {
    siteName: input.siteName,
    siteTagline: input.siteTagline,
  });
  const issues = classifyEntityScopedMetadataIssues({
    effectiveTitle: preview.effectiveTitle,
    effectiveDescription: preview.effectiveDescription,
    storedCanonical: post.canonicalUrl,
    publicPath: blogPostPath(post.slug || "post"),
    robotsIndex: post.robotsIndex,
    sitemapInclude: post.sitemapInclude,
    visibleH1: post.title,
  });
  findings.push(...findingsFromMetadataIssues(issues));

  if (input.featuredMedia) {
    findings.push(...evaluateMediaAltPostSave({ asset: input.featuredMedia, fieldLabel: "Featured image alt" }));
  }

  return findings;
}

export function evaluateCategorySeoPostSave(input: {
  category: BlogCategory;
  siteName: string;
  siteTagline?: string;
}): SeoPostSaveFinding[] {
  const { category } = input;
  const findings: SeoPostSaveFinding[] = [];

  if (!String(category.slug || "").trim()) {
    findings.push({
      issueCode: "SLUG_MISSING",
      severity: "needs-attention",
      field: "Slug",
      title: "The category slug is missing",
      explanation: "Public category URLs need a slug. Add one so the archive can keep a stable address.",
    });
  }

  const preview = sidhuPreviewFromCategory(category, {
    siteName: input.siteName,
    siteTagline: input.siteTagline,
  });
  const issues = classifyEntityScopedMetadataIssues({
    effectiveTitle: preview.effectiveTitle,
    effectiveDescription: preview.effectiveDescription,
    storedCanonical: category.canonicalUrl,
    publicPath: categoryPublicPath(category.slug || "category"),
    robotsIndex: categoryEffectiveRobotsIndex(category),
    sitemapInclude: categoryEffectiveSitemapInclude(category),
    visibleH1: category.name,
  });
  findings.push(...findingsFromMetadataIssues(issues));
  return findings;
}

export function evaluateMediaAltPostSave(input: {
  asset: Pick<MediaAsset, "alt" | "originalFilename">;
  fieldLabel?: string;
}): SeoPostSaveFinding[] {
  const findings: SeoPostSaveFinding[] = [];
  const field = input.fieldLabel || "Alt text";
  const alt = String(input.asset.alt || "").trim();

  if (!alt) {
    pushImage(findings, "MEDIA_ALT_NOT_SET", field);
    return findings;
  }

  if (isFilenameLikeAlt(alt)) pushImage(findings, "FILENAME_ALT", field);
  if (isUrlLikeAlt(alt)) pushImage(findings, "URL_LIKE_ALT", field);
  if (isPlaceholderAlt(alt)) pushImage(findings, "PLACEHOLDER_ALT", field);

  return findings;
}
