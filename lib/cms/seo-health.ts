import {
  scanImageDiagnostics,
  type ImageFinding,
  type ImageIssue,
} from "@/lib/cms/image-diagnostics";
import {
  scanInternalLinks,
  type InternalLinkFinding,
  type InternalLinkIssue,
} from "@/lib/cms/internal-links";
import {
  scanMetadataDiagnostics,
  type MetadataDiagnosticsReport,
  type MetadataIssue,
  type SeoMetadataEntity,
} from "@/lib/cms/metadata-diagnostics";
import type {
  BlogCategory,
  BlogPost,
  CmsPage,
  MediaAsset,
  RedirectRule,
  SiteSettings,
} from "@/lib/cms/types";

export type SeoHealthSource = "metadata" | "internal-link" | "image";
export type SeoHealthSeverity = "needs-attention" | "review" | "editorial" | "healthy";
export type SeoHealthCategory = "search-preview" | "canonical-indexing" | "internal-links" | "images";
export type SeoHealthAction = "required" | "review" | "suggested" | "none";

export type SeoHealthFinding = {
  id: string;
  source: SeoHealthSource;
  issueCode: string;
  category: SeoHealthCategory;
  severity: SeoHealthSeverity;
  entity: {
    type: string;
    id: string;
    label: string;
  };
  publicUrl: string;
  title: string;
  explanation: string;
  evidence: string[];
  reviewHref: string | null;
  detailHref: string;
  action: SeoHealthAction;
  imageAltStatus?: string;
  usageContexts?: string[];
};

export type SeoHealthSummary = {
  needsAttention: number;
  review: number;
  editorial: number;
  healthy: number;
  total: number;
  noActionNeeded: boolean;
  healthyBySource: Record<SeoHealthSource, number>;
};

export type SeoHealthReport = {
  findings: SeoHealthFinding[];
  summary: SeoHealthSummary;
};

export type SeoHealthInput = {
  settings: SiteSettings;
  pages: CmsPage[];
  posts: BlogPost[];
  categories: BlogCategory[];
  redirects: RedirectRule[];
  media: MediaAsset[];
};

/** Read-only contract: the health loader cannot receive any CMS write methods. */
export type SeoHealthReader = {
  getSettings(): Promise<SiteSettings>;
  listPages(): Promise<CmsPage[]>;
  listPosts(): Promise<BlogPost[]>;
  listCategories(): Promise<BlogCategory[]>;
  listRedirects(): Promise<RedirectRule[]>;
  listMedia(): Promise<MediaAsset[]>;
};

export type SeoHealthScannerReports = {
  metadata: MetadataDiagnosticsReport;
  internalLinks: ReturnType<typeof scanInternalLinks>;
  images: ReturnType<typeof scanImageDiagnostics>;
};

export type IssueDefinition = {
  category: SeoHealthCategory;
  severity: SeoHealthSeverity;
  action: SeoHealthAction;
  title: string;
  explanation: string;
};

const DETAIL_HREFS: Record<SeoHealthSource, string> = {
  metadata: "/sidhu/seo/metadata-diagnostics/",
  "internal-link": "/sidhu/seo/internal-links/",
  image: "/sidhu/seo/image-diagnostics/",
};

/** Shared issue copy/severity map — reused by Post-save SEO Guard. */
export const METADATA_ISSUE_DEFINITIONS = {
  DUPLICATE_TITLE: {
    category: "search-preview",
    severity: "review",
    action: "review",
    title: "More than one page uses the same search title",
    explanation: "Similar titles can make it harder to tell these pages apart. Review whether each page needs a clearer title.",
  },
  DUPLICATE_DESCRIPTION: {
    category: "search-preview",
    severity: "editorial",
    action: "suggested",
    title: "More than one page uses the same search description",
    explanation: "Repeated descriptions may be intentional, but unique summaries can make each page easier to understand.",
  },
  CANONICAL_COLLISION: {
    category: "canonical-indexing",
    severity: "review",
    action: "review",
    title: "Several pages point to the same preferred URL",
    explanation: "This may be intentional, but it is worth checking that Google is being pointed to the correct main page.",
  },
  CANONICAL_TO_OTHER: {
    category: "canonical-indexing",
    severity: "review",
    action: "review",
    title: "This page points to a different preferred URL",
    explanation: "A different canonical can be valid. Review it if this page is meant to appear separately in search results.",
  },
  CANONICAL_TO_REDIRECT: {
    category: "canonical-indexing",
    severity: "review",
    action: "review",
    title: "The preferred URL goes through a redirect",
    explanation: "This page points Google to a URL that redirects somewhere else. Review the canonical target.",
  },
  CANONICAL_MISSING_TARGET: {
    category: "canonical-indexing",
    severity: "needs-attention",
    action: "required",
    title: "The preferred URL is not a known public page",
    explanation: "The canonical points to a local URL the CMS cannot find. Confirm the intended destination before changing anything.",
  },
  CANONICAL_HTTP: {
    category: "canonical-indexing",
    severity: "review",
    action: "review",
    title: "The preferred URL uses HTTP",
    explanation: "The public site uses HTTPS. Review whether this canonical should use the secure version.",
  },
  CANONICAL_WWW: {
    category: "canonical-indexing",
    severity: "review",
    action: "review",
    title: "The preferred URL uses the www host",
    explanation: "The live site uses the non-www address. Review this value so the host choice stays consistent.",
  },
  CANONICAL_MALFORMED: {
    category: "canonical-indexing",
    severity: "needs-attention",
    action: "required",
    title: "The preferred URL does not look valid",
    explanation: "The canonical cannot be read as a normal site path or HTTPS URL. It needs a careful manual review.",
  },
  CANONICAL_TARGET_NOINDEX: {
    category: "canonical-indexing",
    severity: "needs-attention",
    action: "required",
    title: "The preferred page is set to noindex",
    explanation: "This page points to a preferred URL that asks search engines not to index it. Review the two settings together.",
  },
  INDEXABLE_TO_OTHER_CANONICAL: {
    category: "canonical-indexing",
    severity: "review",
    action: "review",
    title: "An indexable page points to another preferred page",
    explanation: "This can be deliberate, but the indexing and canonical choices should be reviewed together.",
  },
  NOINDEX_SITEMAP_INCLUDED: {
    category: "canonical-indexing",
    severity: "review",
    action: "review",
    title: "A noindex page is included in the sitemap",
    explanation: "The page asks not to be indexed while the sitemap still advertises it. Review which setting reflects the intention.",
  },
  TITLE_SHORT: {
    category: "search-preview",
    severity: "editorial",
    action: "suggested",
    title: "The search title is quite short",
    explanation: "A little more context may help people understand the page. This is an editorial suggestion, not an error.",
  },
  TITLE_LONG: {
    category: "search-preview",
    severity: "editorial",
    action: "suggested",
    title: "The search title is quite long",
    explanation: "Search engines may shorten long titles. Consider making it more concise if the wording allows.",
  },
  DESCRIPTION_SHORT: {
    category: "search-preview",
    severity: "editorial",
    action: "suggested",
    title: "The search description is quite short",
    explanation: "A fuller summary may explain the page better. This is optional editorial guidance.",
  },
  DESCRIPTION_LONG: {
    category: "search-preview",
    severity: "editorial",
    action: "suggested",
    title: "The search description is quite long",
    explanation: "Search engines may shorten this description. Consider trimming it without losing the main point.",
  },
  MISSING_VISIBLE_H1: {
    category: "search-preview",
    severity: "editorial",
    action: "suggested",
    title: "No clear main page heading was found",
    explanation: "A visible main heading can help visitors understand the page. Review the page layout before adding or changing one.",
  },
} satisfies Record<MetadataIssue, IssueDefinition>;

const METADATA_ISSUES = METADATA_ISSUE_DEFINITIONS;

const INTERNAL_LINK_ISSUES = {
  VALID: {
    category: "internal-links",
    severity: "healthy",
    action: "none",
    title: "Internal link reaches a known page",
    explanation: "No action is needed for this link.",
  },
  BROKEN: {
    category: "internal-links",
    severity: "needs-attention",
    action: "required",
    title: "An internal link does not reach a known page",
    explanation: "Visitors may arrive at a missing page. Review the stored link and choose the intended destination.",
  },
  REDIRECTED: {
    category: "internal-links",
    severity: "review",
    action: "review",
    title: "An internal link goes through a redirect",
    explanation: "Linking directly to the final page may be cleaner. Keep it unchanged if the redirect is intentional.",
  },
  HTTP: {
    category: "internal-links",
    severity: "review",
    action: "review",
    title: "An internal link uses HTTP",
    explanation: "The public site uses HTTPS. Review whether this link should use the secure address.",
  },
  WWW: {
    category: "internal-links",
    severity: "review",
    action: "review",
    title: "An internal link uses the www host",
    explanation: "The live site uses the non-www address. A direct link to that host may be cleaner.",
  },
  LEGACY_BLOG: {
    category: "internal-links",
    severity: "review",
    action: "review",
    title: "An internal link uses an older blog address",
    explanation: "The link is handled by a redirect. Review whether it can point directly to the current blog address.",
  },
  LEGACY_SUBSCRIPTION: {
    category: "internal-links",
    severity: "review",
    action: "review",
    title: "An internal link uses an older subscription address",
    explanation: "The link is handled by a redirect. Review whether it can point directly to the current subscription page.",
  },
  SELF_LINK: {
    category: "internal-links",
    severity: "editorial",
    action: "suggested",
    title: "A page links back to itself",
    explanation: "This may be intentional navigation. Remove or reword it only if it does not help visitors.",
  },
  NOINDEX_TARGET: {
    category: "internal-links",
    severity: "review",
    action: "review",
    title: "An internal link points to a noindex page",
    explanation: "The link can still work for visitors, but it is worth confirming that the target should stay out of search results.",
  },
  EXTERNAL: {
    category: "internal-links",
    severity: "healthy",
    action: "none",
    title: "External link noted",
    explanation: "This health check does not test external websites. No action is suggested here.",
  },
} satisfies Record<InternalLinkIssue, IssueDefinition>;

/** Shared image issue copy/severity map — reused by Post-save SEO Guard. */
export const IMAGE_ISSUE_DEFINITIONS = {
  MISSING_ALT: {
    category: "images",
    severity: "needs-attention",
    action: "required",
    title: "A content image has no alternative text",
    explanation: "Useful alternative text can help people who cannot see the image. Review what the image communicates.",
  },
  EMPTY_CONTENT_ALT: {
    category: "images",
    severity: "review",
    action: "review",
    title: "A content image has empty alternative text",
    explanation: "Empty alt text is suitable for decorative images. Review whether this image carries useful information.",
  },
  MEDIA_ALT_NOT_SET: {
    category: "images",
    severity: "editorial",
    action: "suggested",
    title: "A Media Library item has no saved alternative text",
    explanation:
      "Some uses provide their own label or do not need one. Review this image in context before deciding whether to add text.",
  },
  FALLBACK_ALT: {
    category: "images",
    severity: "editorial",
    action: "suggested",
    title: "An image is using fallback alternative text",
    explanation:
      "An automatic fallback is currently being used. Adding a deliberate image description may improve accessibility and context.",
  },
  HTML_ALT_STALE: {
    category: "images",
    severity: "review",
    action: "review",
    title: "An article still uses older alternative text",
    explanation: "The saved Media Library text and the text embedded in the article differ. Review which wording is current.",
  },
  HTML_ALT_MISSING: {
    category: "images",
    severity: "needs-attention",
    action: "required",
    title: "An embedded image is missing its alt attribute",
    explanation: "The article HTML does not provide alternative text for this image. Review the image in its content context.",
  },
  FILENAME_ALT: {
    category: "images",
    severity: "editorial",
    action: "suggested",
    title: "Alternative text looks like a filename",
    explanation: "A short description of what the image shows may be more useful than its file name.",
  },
  URL_LIKE_ALT: {
    category: "images",
    severity: "editorial",
    action: "suggested",
    title: "Alternative text looks like a web address",
    explanation: "A plain-language image description may be more useful than a URL.",
  },
  PLACEHOLDER_ALT: {
    category: "images",
    severity: "editorial",
    action: "suggested",
    title: "Alternative text looks like placeholder wording",
    explanation: "Review whether a specific, useful image description can replace this placeholder.",
  },
  DECORATIVE_OK: {
    category: "images",
    severity: "healthy",
    action: "none",
    title: "Decorative image is handled appropriately",
    explanation: "No action is needed for this decorative image.",
  },
  BRAND_OK: {
    category: "images",
    severity: "healthy",
    action: "none",
    title: "Brand image has appropriate text",
    explanation: "No action is needed for this brand image.",
  },
  SOCIAL_ONLY: {
    category: "images",
    severity: "healthy",
    action: "none",
    title: "Social sharing image is configured",
    explanation: "This image is used for social previews and does not need page-content alt text.",
  },
  DUPLICATE_ALT_HINT: {
    category: "images",
    severity: "editorial",
    action: "suggested",
    title: "The same alternative text appears on several images",
    explanation: "Repeated wording can be correct. Review it only if the images communicate different things.",
  },
  VALID: {
    category: "images",
    severity: "healthy",
    action: "none",
    title: "Image alternative text looks useful",
    explanation: "No action is needed for this image check.",
  },
  UNMATCHED_EXTERNAL: {
    category: "images",
    severity: "review",
    action: "review",
    title: "An image is outside the Media Library",
    explanation: "The image can still work, but Sidhu cannot connect it to a Media Library record. Review how it is managed.",
  },
} satisfies Record<ImageIssue, IssueDefinition>;

const IMAGE_ISSUES = IMAGE_ISSUE_DEFINITIONS;

function text(value: string | null | undefined, fallback = "Not set") {
  const next = String(value || "").trim();
  return next || fallback;
}

function clip(value: string, max = 180) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function metadataEvidence(entity: SeoMetadataEntity) {
  return [
    `Search title: ${clip(text(entity.effectiveTitle))}`,
    `Title length: ${entity.titleLength} characters`,
    `Description: ${clip(text(entity.effectiveDescription))}`,
    `Description length: ${entity.descriptionLength} characters`,
    `Canonical: ${text(entity.effectiveCanonical)}`,
    `Indexing: ${entity.robotsIndex ? "Index" : "Noindex"}; sitemap: ${entity.sitemapInclude ? "Included" : "Excluded"}`,
  ];
}

function internalLinkEvidence(finding: InternalLinkFinding) {
  return [
    `Stored link: ${text(finding.storedHref)}`,
    finding.finalPath ? `Final target: ${finding.finalPath}` : "",
    finding.anchorText ? `Link text: ${clip(finding.anchorText)}` : "",
    finding.context ? `Found in: ${finding.context}` : "",
  ].filter(Boolean);
}

function imageEvidence(finding: ImageFinding) {
  const rendered = finding.altAttributeMissing
    ? "Alt attribute missing"
    : finding.renderedAlt === ""
      ? "Rendered alt is empty"
      : finding.renderedAlt == null
        ? "Rendered alt not applicable"
        : `Rendered alt: ${clip(finding.renderedAlt)}`;
  return [
    `Image: ${clip(finding.imageUrl)}`,
    finding.storedMediaAlt == null
      ? "No linked Media Library alt"
      : finding.storedMediaAlt
        ? `Saved media alt: ${clip(finding.storedMediaAlt)}`
        : "Saved media alt is blank",
    rendered,
    finding.note ? clip(finding.note) : "",
  ].filter(Boolean);
}

function normalizeMetadata(report: MetadataDiagnosticsReport) {
  const findings: SeoHealthFinding[] = [];
  for (const [entityIndex, entity] of report.entities.entries()) {
    for (const [issueIndex, issue] of entity.issues.entries()) {
      const definition = METADATA_ISSUES[issue];
      findings.push({
        id: `metadata:${entity.id}:${issue}:${entityIndex}:${issueIndex}`,
        source: "metadata",
        issueCode: issue,
        ...definition,
        entity: { type: entity.kind, id: entity.id, label: entity.label },
        publicUrl: entity.publicUrl,
        evidence: metadataEvidence(entity),
        reviewHref: entity.editHref,
        detailHref: DETAIL_HREFS.metadata,
      });
    }
  }
  return findings;
}

function normalizeInternalLinks(report: SeoHealthScannerReports["internalLinks"]) {
  const findings: SeoHealthFinding[] = [];
  for (const [findingIndex, finding] of report.findings.entries()) {
    for (const [issueIndex, issue] of finding.issues.entries()) {
      const definition = INTERNAL_LINK_ISSUES[issue];
      if (definition.action === "none") continue;
      findings.push({
        id: `internal-link:${finding.sourceKind}:${finding.sourceId}:${issue}:${findingIndex}:${issueIndex}`,
        source: "internal-link",
        issueCode: issue,
        ...definition,
        entity: {
          type: finding.sourceKind,
          id: finding.sourceId,
          label: finding.sourceLabel,
        },
        publicUrl: finding.sourceUrl,
        evidence: internalLinkEvidence(finding),
        reviewHref: finding.editHref,
        detailHref: DETAIL_HREFS["internal-link"],
      });
    }
  }

  for (const [index, orphan] of report.orphans.entries()) {
    findings.push({
      id: `internal-link:orphan:${orphan.path}:${index}`,
      source: "internal-link",
      issueCode: "NO_DISCOVERED_INTERNAL_LINKS",
      category: "internal-links",
      severity: "editorial",
      action: "suggested",
      entity: { type: orphan.kind, id: orphan.path, label: orphan.label },
      publicUrl: orphan.path,
      title: "No internal links to this page were found",
      explanation: "This may be intentional. Consider whether another relevant page should help visitors discover it.",
      evidence: [orphan.note],
      reviewHref: null,
      detailHref: DETAIL_HREFS["internal-link"],
    });
  }
  return findings;
}

function normalizedImageIssues(finding: ImageFinding) {
  return finding.issues.filter(
    (issue) =>
      IMAGE_ISSUES[issue].action !== "none" &&
      !(issue === "MEDIA_ALT_NOT_SET" && (finding.sourceType === "media" || finding.sourceType === "social")) &&
      !(issue === "MISSING_ALT" && finding.issues.includes("HTML_ALT_MISSING")),
  );
}

function imageAssetKey(finding: ImageFinding, findingIndex: number) {
  const mediaId = text(finding.mediaId, "");
  if (mediaId) return `media:${mediaId}`;
  const imageUrl = text(finding.imageUrl, "");
  if (imageUrl) return `url:${imageUrl}`;
  return `finding:${finding.id || findingIndex}`;
}

function imageUsageContext(finding: ImageFinding) {
  const labels: Record<ImageFinding["sourceType"], string> = {
    media: "Media Library asset",
    "blog-hero": "Blog hero",
    "blog-listing": "Blog listing thumbnail",
    "article-html": "Article image",
    "page-html": "Page image",
    brand: "Site branding",
    decorative: "Decorative image",
    social: "Open Graph image",
  };
  const title = finding.sourceType === "social" ? finding.sourceTitle.replace(/\s+OG$/i, "") : finding.sourceTitle;
  return `${labels[finding.sourceType]}: ${title}`;
}

function imageAltStatus(findings: ImageFinding[]) {
  const savedAlt = findings.map((finding) => text(finding.storedMediaAlt, "")).find(Boolean);
  if (savedAlt) return `Saved in Media Library: ${savedAlt}`;
  if (findings.some((finding) => finding.storedMediaAlt === "")) return "Blank in the Media Library";
  return "No linked Media Library record";
}

type ImageIssueCandidate = {
  finding: ImageFinding;
  findingIndex: number;
  issue: ImageIssue;
  issueIndex: number;
};

function normalizedImageFinding(candidate: ImageIssueCandidate): SeoHealthFinding {
  const { finding, findingIndex, issue, issueIndex } = candidate;
  const definition = IMAGE_ISSUES[issue];
  const reviewHref =
    definition.severity === "healthy"
      ? null
      : issue === "MEDIA_ALT_NOT_SET"
        ? finding.editMediaHref || finding.editHref
        : finding.editHref || finding.editMediaHref;
  return {
    id: `image:${finding.sourceType}:${finding.mediaId || findingIndex}:${issue}:${findingIndex}:${issueIndex}`,
    source: "image",
    issueCode: issue,
    ...definition,
    entity: {
      type: finding.sourceType,
      id: finding.mediaId || finding.id,
      label: finding.sourceTitle,
    },
    publicUrl: finding.sourceUrl,
    evidence: imageEvidence(finding),
    reviewHref,
    detailHref: DETAIL_HREFS.image,
  };
}

function normalizeImages(report: SeoHealthScannerReports["images"]) {
  const findings: SeoHealthFinding[] = [];
  const contextsByAsset = new Map<string, ImageFinding[]>();
  const editorialByAsset = new Map<string, ImageIssueCandidate[]>();

  for (const [findingIndex, finding] of report.findings.entries()) {
    const assetKey = imageAssetKey(finding, findingIndex);
    const contexts = contextsByAsset.get(assetKey) || [];
    contexts.push(finding);
    contextsByAsset.set(assetKey, contexts);

    for (const [issueIndex, issue] of normalizedImageIssues(finding).entries()) {
      const definition = IMAGE_ISSUES[issue];
      const candidate = { finding, findingIndex, issue, issueIndex };
      if (definition.severity !== "editorial") {
        findings.push(normalizedImageFinding(candidate));
        continue;
      }
      const group = editorialByAsset.get(assetKey) || [];
      group.push(candidate);
      editorialByAsset.set(assetKey, group);
    }
  }

  for (const [assetKey, candidates] of editorialByAsset) {
    const representative =
      candidates.find((candidate) => candidate.finding.primaryIssue === candidate.issue) || candidates[0];
    if (!representative) continue;

    const contexts = contextsByAsset.get(assetKey) || [representative.finding];
    const usageContexts = [...new Set(contexts.map(imageUsageContext))];
    const issueCodes = [
      ...new Set([representative.issue, ...candidates.map((candidate) => candidate.issue)]),
    ];
    const mediaContext = contexts.find((context) => context.sourceType === "media");
    const normalized = normalizedImageFinding(representative);
    normalized.id = `image:${assetKey}:${representative.issue}`;
    normalized.entity = {
      type: "media asset",
      id: representative.finding.mediaId || representative.finding.imageUrl || representative.finding.id,
      label: mediaContext?.sourceTitle || representative.finding.sourceTitle,
    };
    normalized.reviewHref = representative.finding.editMediaHref || normalized.reviewHref;
    normalized.imageAltStatus = imageAltStatus(contexts);
    normalized.usageContexts = usageContexts;
    normalized.evidence = [
      ...normalized.evidence,
      `Grouped diagnostic codes: ${issueCodes.join(", ")}`,
      `Grouped scanner contexts: ${usageContexts.length}`,
    ];
    findings.push(normalized);
  }

  return findings;
}

const SEVERITY_ORDER: Record<SeoHealthSeverity, number> = {
  "needs-attention": 0,
  review: 1,
  editorial: 2,
  healthy: 3,
};

export function summarizeSeoHealthFindings(
  findings: SeoHealthFinding[],
  healthyBySource: Record<SeoHealthSource, number> = { metadata: 0, "internal-link": 0, image: 0 },
): SeoHealthSummary {
  const compactHealthy = healthyBySource.metadata + healthyBySource["internal-link"] + healthyBySource.image;
  const summary: SeoHealthSummary = {
    needsAttention: 0,
    review: 0,
    editorial: 0,
    healthy: compactHealthy,
    total: findings.length + compactHealthy,
    noActionNeeded: false,
    healthyBySource: { ...healthyBySource },
  };
  for (const finding of findings) {
    if (finding.severity === "needs-attention") summary.needsAttention += 1;
    else if (finding.severity === "review") summary.review += 1;
    else if (finding.severity === "editorial") summary.editorial += 1;
    else {
      summary.healthy += 1;
      summary.healthyBySource[finding.source] += 1;
    }
  }
  summary.noActionNeeded = summary.needsAttention === 0 && summary.review === 0 && summary.editorial === 0;
  return summary;
}

export function seoHealthStatusMessage(summary: SeoHealthSummary) {
  if (summary.noActionNeeded) {
    return "No SEO issues needing action were found in this scan.";
  }
  if (summary.needsAttention === 0) {
    return "No urgent SEO problems were found in this scan. The remaining items are reviews or editorial suggestions.";
  }
  return `${summary.needsAttention} ${summary.needsAttention === 1 ? "item needs" : "items need"} attention. Review ${summary.needsAttention === 1 ? "it" : "them"} first; nothing is changed automatically.`;
}

export function normalizeSeoHealthReports(reports: SeoHealthScannerReports): SeoHealthReport {
  const findings = [
    ...normalizeMetadata(reports.metadata),
    ...normalizeInternalLinks(reports.internalLinks),
    ...normalizeImages(reports.images),
  ].sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      left.source.localeCompare(right.source) ||
      left.entity.label.localeCompare(right.entity.label) ||
      left.issueCode.localeCompare(right.issueCode),
  );
  const healthyBySource: Record<SeoHealthSource, number> = {
    metadata: reports.metadata.entities.filter((entity) => entity.issues.length === 0).length,
    "internal-link": reports.internalLinks.summary.VALID,
    image: reports.images.summary.validOrDecorativeOk,
  };
  return { findings, summary: summarizeSeoHealthFindings(findings, healthyBySource) };
}

export function buildSeoHealthReport(input: SeoHealthInput): SeoHealthReport {
  return normalizeSeoHealthReports({
    metadata: scanMetadataDiagnostics({
      settings: input.settings,
      pages: input.pages,
      posts: input.posts,
      categories: input.categories,
      redirects: input.redirects,
    }),
    internalLinks: scanInternalLinks({
      settings: input.settings,
      pages: input.pages,
      posts: input.posts,
      categories: input.categories,
      redirects: input.redirects,
    }),
    images: scanImageDiagnostics({
      settings: input.settings,
      pages: input.pages,
      posts: input.posts,
      categories: input.categories,
      media: input.media,
    }),
  });
}

export async function loadSeoHealthInput(reader: SeoHealthReader): Promise<SeoHealthInput> {
  const [settings, pages, posts, categories, redirects, media] = await Promise.all([
    reader.getSettings(),
    reader.listPages(),
    reader.listPosts(),
    reader.listCategories(),
    reader.listRedirects(),
    reader.listMedia(),
  ]);
  return { settings, pages, posts, categories, redirects, media };
}

export async function runSeoHealthScan(reader: SeoHealthReader) {
  return buildSeoHealthReport(await loadSeoHealthInput(reader));
}
