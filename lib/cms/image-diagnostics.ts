import { blogPostPath } from "@/lib/cms/blog-paths";
import { contentImageAlt } from "@/lib/cms/media-alt";
import { referencedMediaIds } from "@/lib/cms/media-refs";
import { PAGE_SEO_KEYS, PAGE_SEO_META } from "@/lib/cms/page-seo";
import { sidhuPagePreviewPath } from "@/lib/cms/sidhu-seo-preview";
import { withSlash } from "@/lib/cms/redirects";
import { publicPagePath } from "@/lib/site-url";
import type {
  BlogCategory,
  BlogPost,
  CmsPage,
  CmsSection,
  MediaAsset,
  MediaRef,
  SiteSettings,
} from "@/lib/cms/types";

export type ImageSemantic = "CONTENT" | "DECORATIVE" | "FUNCTIONAL" | "BRAND" | "SOCIAL_ONLY" | "UNKNOWN";

export type ImageIssue =
  | "MISSING_ALT"
  | "EMPTY_CONTENT_ALT"
  | "MEDIA_ALT_NOT_SET"
  | "FALLBACK_ALT"
  | "HTML_ALT_STALE"
  | "HTML_ALT_MISSING"
  | "FILENAME_ALT"
  | "URL_LIKE_ALT"
  | "PLACEHOLDER_ALT"
  | "DECORATIVE_OK"
  | "BRAND_OK"
  | "SOCIAL_ONLY"
  | "DUPLICATE_ALT_HINT"
  | "VALID"
  | "UNMATCHED_EXTERNAL";

export type ImageFinding = {
  id: string;
  sourceType:
    | "media"
    | "blog-hero"
    | "blog-listing"
    | "article-html"
    | "page-html"
    | "brand"
    | "decorative"
    | "social";
  sourceTitle: string;
  sourceUrl: string;
  imageUrl: string;
  mediaId: string | null;
  storedMediaAlt: string | null;
  renderedAlt: string | null;
  /** true when alt attribute is absent in HTML (distinct from empty string). */
  altAttributeMissing: boolean;
  semantic: ImageSemantic;
  issues: ImageIssue[];
  primaryIssue: ImageIssue;
  editHref: string | null;
  editMediaHref: string | null;
  note: string;
};

export type ImageDiagnosticsSummary = {
  publicImages: number;
  content: number;
  decorative: number;
  mediaAltMissing: number;
  renderedAltMissing: number;
  fallbackAlt: number;
  staleHtmlAlt: number;
  filenameAlt: number;
  validOrDecorativeOk: number;
};

function trim(value: string | null | undefined) {
  return String(value || "").trim();
}

function readAttr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? "";
}

export function extractHtmlImages(html: string): Array<{
  src: string;
  alt: string | null;
  altAttributeMissing: boolean;
}> {
  const out: Array<{ src: string; alt: string | null; altAttributeMissing: boolean }> = [];
  const re = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(html || "")))) {
    const attrs = match[1] || "";
    const src = trim(readAttr(attrs, "src") || "");
    if (!src) continue;
    const hasAlt = /\balt\s*=/i.test(attrs);
    const altRaw = hasAlt ? readAttr(attrs, "alt") : null;
    out.push({
      src,
      alt: hasAlt ? String(altRaw ?? "") : null,
      altAttributeMissing: !hasAlt,
    });
  }
  return out;
}

const FILENAME_ALT_RE =
  /^(?:img[_\-\s]?\d+|image\d*|dsc\d+|screenshot|photo\d*|pic\d*|untitled)(?:[_\-.\s].*)?$|\.(?:jpe?g|png|gif|webp|svg|avif)$/i;

const PLACEHOLDER_ALTS = new Set(["image", "photo", "picture", "img", "graphic", "banner"]);

export function isFilenameLikeAlt(alt: string) {
  const value = trim(alt);
  if (!value) return false;
  if (FILENAME_ALT_RE.test(value)) return true;
  // bare cloudinary-ish public id with underscores and no spaces
  if (!/\s/.test(value) && /[_-]/.test(value) && /\d{2,}/.test(value) && value.length > 18) return true;
  return false;
}

export function isUrlLikeAlt(alt: string) {
  const value = trim(alt);
  if (!value) return false;
  return /^https?:\/\//i.test(value) || value.includes("res.cloudinary.com/");
}

export function isPlaceholderAlt(alt: string) {
  return PLACEHOLDER_ALTS.has(trim(alt).toLowerCase());
}

export function isExtremelyLongAlt(alt: string) {
  return trim(alt).length > 160;
}

export function matchMediaAsset(
  src: string,
  mediaById: Map<string, MediaAsset>,
  mediaByUrl: Map<string, MediaAsset>,
  mediaByPublicId: Map<string, MediaAsset>,
): MediaAsset | null {
  const exact = mediaByUrl.get(src);
  if (exact) return exact;
  // strip query/transform noise
  const bare = src.split("?")[0] || src;
  if (mediaByUrl.has(bare)) return mediaByUrl.get(bare) || null;
  for (const [url, asset] of mediaByUrl) {
    if (url && (src.includes(url) || url.includes(bare))) return asset;
  }
  for (const [publicId, asset] of mediaByPublicId) {
    if (publicId && src.includes(publicId)) return asset;
  }
  void mediaById;
  return null;
}

function primaryIssue(issues: ImageIssue[]): ImageIssue {
  const order: ImageIssue[] = [
    "MISSING_ALT",
    "HTML_ALT_MISSING",
    "EMPTY_CONTENT_ALT",
    "HTML_ALT_STALE",
    "FILENAME_ALT",
    "URL_LIKE_ALT",
    "PLACEHOLDER_ALT",
    "FALLBACK_ALT",
    "MEDIA_ALT_NOT_SET",
    "UNMATCHED_EXTERNAL",
    "DUPLICATE_ALT_HINT",
    "SOCIAL_ONLY",
    "DECORATIVE_OK",
    "BRAND_OK",
    "VALID",
  ];
  for (const issue of order) {
    if (issues.includes(issue)) return issue;
  }
  return "VALID";
}

function qualityHints(alt: string | null, issues: ImageIssue[]) {
  if (alt == null) return;
  const value = trim(alt);
  if (!value) return;
  if (isFilenameLikeAlt(value)) issues.push("FILENAME_ALT");
  if (isUrlLikeAlt(value)) issues.push("URL_LIKE_ALT");
  if (isPlaceholderAlt(value)) issues.push("PLACEHOLDER_ALT");
}

function sectionHtmlChunks(section: CmsSection): string[] {
  const data = section.data as Record<string, unknown>;
  const chunks: string[] = [];
  if (typeof data.html === "string" && data.html.trim()) chunks.push(data.html);
  return chunks;
}

function pageEditHref(page: CmsPage) {
  if (page.id === "page-home") return "/sidhu/pages/home/";
  if (page.id === "page-contact") return "/sidhu/pages/contact/";
  if (page.id === "page-subscriptions") return "/sidhu/pages/subscriptions/";
  const leaf = withSlash(page.slug).replace(/^\/|\/$/g, "");
  return `/sidhu/pages/${leaf || "home"}/`;
}

let seq = 0;
function nextId(prefix: string) {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function scanImageDiagnostics(input: {
  settings: SiteSettings;
  pages: CmsPage[];
  posts: BlogPost[];
  categories: BlogCategory[];
  media: MediaAsset[];
}): { findings: ImageFinding[]; summary: ImageDiagnosticsSummary } {
  seq = 0;
  const findings: ImageFinding[] = [];
  const mediaById = new Map(input.media.map((m) => [m.id, m]));
  const mediaByUrl = new Map<string, MediaAsset>();
  const mediaByPublicId = new Map<string, MediaAsset>();
  for (const asset of input.media) {
    if (asset.secureUrl) mediaByUrl.set(asset.secureUrl, asset);
    if (asset.publicId) mediaByPublicId.set(asset.publicId, asset);
  }
  const referenced = referencedMediaIds(input.settings, input.posts, input.categories);
  // Also mark HTML-referenced later
  const htmlReferenced = new Set<string>();

  const push = (finding: Omit<ImageFinding, "id" | "primaryIssue"> & { primaryIssue?: ImageIssue }) => {
    const issues = finding.issues.length ? finding.issues : (["VALID"] as ImageIssue[]);
    findings.push({
      ...finding,
      id: nextId(finding.sourceType),
      issues,
      primaryIssue: finding.primaryIssue || primaryIssue(issues),
    });
  };

  // --- Media Library coverage ---
  for (const asset of input.media) {
    const issues: ImageIssue[] = [];
    const stored = trim(asset.alt);
    if (!stored) issues.push("MEDIA_ALT_NOT_SET");
    else qualityHints(stored, issues);
    if (!issues.length) issues.push("VALID");
    const knownRef = referenced.has(asset.id) || htmlReferenced.has(asset.id);
    push({
      sourceType: "media",
      sourceTitle: asset.originalFilename || asset.publicId || asset.id,
      sourceUrl: "/sidhu/media/",
      imageUrl: asset.secureUrl,
      mediaId: asset.id,
      storedMediaAlt: stored || "",
      renderedAlt: stored || null,
      altAttributeMissing: false,
      semantic: "UNKNOWN",
      issues,
      editHref: "/sidhu/media/",
      editMediaHref: "/sidhu/media/",
      note: knownRef ? "Referenced in known CMS fields." : "No discovered public reference.",
    });
  }

  // --- Brand logo ---
  const logo = input.settings.branding.logo;
  if (logo?.secureUrl) {
    const media = logo.id ? mediaById.get(logo.id) : null;
    const rendered = trim(input.settings.branding.logoAlt) || trim(input.settings.siteName);
    const issues: ImageIssue[] = [];
    if (!rendered) issues.push("MISSING_ALT");
    else issues.push("BRAND_OK");
    if (media && !trim(media.alt)) issues.push("MEDIA_ALT_NOT_SET");
    push({
      sourceType: "brand",
      sourceTitle: "Site logo",
      sourceUrl: "/welcome/",
      imageUrl: logo.secureUrl,
      mediaId: logo.id || null,
      storedMediaAlt: media ? trim(media.alt) : null,
      renderedAlt: rendered,
      altAttributeMissing: false,
      semantic: "BRAND",
      issues,
      editHref: "/sidhu/settings/",
      editMediaHref: logo.id ? "/sidhu/media/" : null,
      note: "Logo uses branding logoAlt (or site name).",
    });
  }

  // --- Decorative payment icons ---
  for (const image of input.settings.footerPaymentImages || []) {
    if (!image.secureUrl) continue;
    const media = image.id ? mediaById.get(image.id) : null;
    push({
      sourceType: "decorative",
      sourceTitle: "Footer payment icon",
      sourceUrl: "/welcome/",
      imageUrl: image.secureUrl,
      mediaId: image.id || null,
      storedMediaAlt: media ? trim(media.alt) : null,
      renderedAlt: "",
      altAttributeMissing: false,
      semantic: "DECORATIVE",
      issues: ["DECORATIVE_OK"],
      editHref: "/sidhu/settings/",
      editMediaHref: image.id ? "/sidhu/media/" : null,
      note: "Payment icons render with intentional empty alt.",
    });
  }

  // --- Social / OG images (page SEO + posts + categories + default) ---
  const socialRefs: Array<{ label: string; path: string; ref: MediaRef | null; editHref: string | null }> = [
    {
      label: "Default OG image",
      path: "/welcome/",
      ref: input.settings.branding.defaultOgImage,
      editHref: "/sidhu/settings/",
    },
    ...PAGE_SEO_KEYS.map((key) => ({
      label: `${PAGE_SEO_META[key].label} OG`,
      path: sidhuPagePreviewPath(key),
      ref: input.settings.pageSeo[key]?.ogImage || null,
      editHref: PAGE_SEO_META[key].editorHref,
    })),
  ];
  for (const post of input.posts) {
    if (post.status !== "published") continue;
    if (post.ogImage?.secureUrl) {
      socialRefs.push({
        label: `${post.title} OG`,
        path: blogPostPath(post.slug),
        ref: post.ogImage,
        editHref: `/sidhu/blog/${post.id}/`,
      });
    }
  }
  for (const category of input.categories) {
    if (!category.active || !category.ogImage?.secureUrl) continue;
    socialRefs.push({
      label: `${category.name} OG`,
      path: `/category/${category.slug}/`,
      ref: category.ogImage,
      editHref: `/sidhu/blog/category/${category.id}/`,
    });
  }
  for (const item of socialRefs) {
    if (!item.ref?.secureUrl) continue;
    const media = item.ref.id ? mediaById.get(item.ref.id) : null;
    const issues: ImageIssue[] = ["SOCIAL_ONLY"];
    if (media && !trim(media.alt)) issues.push("MEDIA_ALT_NOT_SET");
    push({
      sourceType: "social",
      sourceTitle: item.label,
      sourceUrl: item.path,
      imageUrl: item.ref.secureUrl,
      mediaId: item.ref.id || null,
      storedMediaAlt: media ? trim(media.alt) : null,
      renderedAlt: null,
      altAttributeMissing: false,
      semantic: "SOCIAL_ONLY",
      issues,
      editHref: item.editHref,
      editMediaHref: item.ref.id ? "/sidhu/media/" : null,
      note: "Social/OG image — not necessarily rendered as on-page content.",
    });
  }

  // --- Blog heroes + listing thumbs + article HTML ---
  for (const post of input.posts) {
    if (post.status !== "published") continue;
    const path = blogPostPath(post.slug);
    const editHref = `/sidhu/blog/${post.id}/`;

    if (post.featuredImage?.secureUrl) {
      const media = post.featuredImage.id ? mediaById.get(post.featuredImage.id) : null;
      const stored = media ? trim(media.alt) : "";
      const rendered = contentImageAlt(media?.alt, post.title);
      const issues: ImageIssue[] = [];
      if (!media) {
        // Media ref without library row — still classify by rendered
        if (!trim(rendered)) issues.push("MISSING_ALT");
        else issues.push("VALID");
      } else if (!stored) {
        issues.push("MEDIA_ALT_NOT_SET");
        issues.push("FALLBACK_ALT");
      } else {
        issues.push("VALID");
        qualityHints(stored, issues);
      }
      push({
        sourceType: "blog-hero",
        sourceTitle: post.title,
        sourceUrl: path,
        imageUrl: post.featuredImage.secureUrl,
        mediaId: post.featuredImage.id || null,
        storedMediaAlt: media ? stored : null,
        renderedAlt: rendered,
        altAttributeMissing: false,
        semantic: "CONTENT",
        issues,
        editHref,
        editMediaHref: post.featuredImage.id ? "/sidhu/media/" : null,
        note: stored
          ? "Hero uses stored media alt."
          : "Hero uses post title fallback when media alt is blank.",
      });

      // Listing thumbnail — intentional empty alt
      push({
        sourceType: "blog-listing",
        sourceTitle: post.title,
        sourceUrl: "/blogs/",
        imageUrl: post.featuredImage.secureUrl,
        mediaId: post.featuredImage.id || null,
        storedMediaAlt: media ? stored : null,
        renderedAlt: "",
        altAttributeMissing: false,
        semantic: "DECORATIVE",
        issues: ["DECORATIVE_OK"],
        editHref,
        editMediaHref: post.featuredImage.id ? "/sidhu/media/" : null,
        note: "Blog listing thumbnail intentionally uses empty alt; card title identifies the post.",
      });
    }

    for (const img of extractHtmlImages(post.content || "")) {
      const media = matchMediaAsset(img.src, mediaById, mediaByUrl, mediaByPublicId);
      if (media) htmlReferenced.add(media.id);
      const issues: ImageIssue[] = [];
      if (img.altAttributeMissing) {
        issues.push("HTML_ALT_MISSING");
        issues.push("MISSING_ALT");
      } else if (img.alt === "") {
        issues.push("EMPTY_CONTENT_ALT");
      } else {
        qualityHints(img.alt, issues);
        if (media && trim(media.alt) && trim(img.alt || "") !== trim(media.alt)) {
          issues.push("HTML_ALT_STALE");
        }
        if (!issues.length) issues.push("VALID");
      }
      if (!media && /^https?:\/\//i.test(img.src) && !img.src.includes("res.cloudinary.com")) {
        issues.push("UNMATCHED_EXTERNAL");
      }
      push({
        sourceType: "article-html",
        sourceTitle: post.title,
        sourceUrl: path,
        imageUrl: img.src,
        mediaId: media?.id || null,
        storedMediaAlt: media ? trim(media.alt) : null,
        renderedAlt: img.altAttributeMissing ? null : img.alt,
        altAttributeMissing: img.altAttributeMissing,
        semantic: "CONTENT",
        issues,
        editHref,
        editMediaHref: media ? "/sidhu/media/" : null,
        note:
          media && issues.includes("HTML_ALT_STALE")
            ? `Current Media alt: "${trim(media.alt)}". Inserted HTML alt: "${trim(img.alt || "")}".`
            : media
              ? "Matched Media Library asset."
              : "Media relation unknown.",
      });
    }
  }

  // --- Page rich HTML ---
  for (const page of input.pages) {
    if (page.status === "draft") continue;
    const path = publicPagePath(page.slug);
    const editHref = pageEditHref(page);
    for (const section of page.sections || []) {
      for (const html of sectionHtmlChunks(section)) {
        for (const img of extractHtmlImages(html)) {
          const media = matchMediaAsset(img.src, mediaById, mediaByUrl, mediaByPublicId);
          if (media) htmlReferenced.add(media.id);
          const issues: ImageIssue[] = [];
          if (img.altAttributeMissing) {
            issues.push("HTML_ALT_MISSING");
            issues.push("MISSING_ALT");
          } else if (img.alt === "") {
            issues.push("EMPTY_CONTENT_ALT");
          } else {
            qualityHints(img.alt, issues);
            if (media && trim(media.alt) && trim(img.alt || "") !== trim(media.alt)) {
              issues.push("HTML_ALT_STALE");
            }
            if (!issues.length) issues.push("VALID");
          }
          if (!media && /^https?:\/\//i.test(img.src) && !img.src.includes("res.cloudinary.com")) {
            issues.push("UNMATCHED_EXTERNAL");
          }
          push({
            sourceType: "page-html",
            sourceTitle: page.name,
            sourceUrl: path,
            imageUrl: img.src,
            mediaId: media?.id || null,
            storedMediaAlt: media ? trim(media.alt) : null,
            renderedAlt: img.altAttributeMissing ? null : img.alt,
            altAttributeMissing: img.altAttributeMissing,
            semantic: "CONTENT",
            issues,
            editHref,
            editMediaHref: media ? "/sidhu/media/" : null,
            note:
              media && issues.includes("HTML_ALT_STALE")
                ? `Current Media alt: "${trim(media.alt)}". Inserted HTML alt: "${trim(img.alt || "")}".`
                : media
                  ? "Matched Media Library asset."
                  : "Media relation unknown.",
          });
        }
      }
    }
  }

  // Duplicate non-empty content alts (exclude brand/logo)
  const altGroups = new Map<string, ImageFinding[]>();
  for (const finding of findings) {
    if (finding.semantic === "BRAND" || finding.semantic === "DECORATIVE" || finding.semantic === "SOCIAL_ONLY") {
      continue;
    }
    const alt = trim(finding.renderedAlt || "");
    if (!alt) continue;
    const key = alt.toLowerCase();
    const list = altGroups.get(key) || [];
    list.push(finding);
    altGroups.set(key, list);
  }
  for (const [, list] of altGroups) {
    if (list.length < 2) continue;
    const uniqueSources = new Set(list.map((f) => f.sourceUrl));
    if (uniqueSources.size < 2) continue;
    for (const finding of list) {
      if (!finding.issues.includes("DUPLICATE_ALT_HINT")) finding.issues.push("DUPLICATE_ALT_HINT");
      finding.primaryIssue = primaryIssue(finding.issues);
    }
  }

  // Refresh media notes for HTML-discovered refs
  for (const finding of findings) {
    if (finding.sourceType !== "media" || !finding.mediaId) continue;
    if (htmlReferenced.has(finding.mediaId) || referenced.has(finding.mediaId)) {
      finding.note = "Referenced in known CMS fields or discovered HTML.";
    }
  }

  const publicFindings = findings.filter((f) => f.sourceType !== "media" || f.note.includes("Referenced"));
  const summary: ImageDiagnosticsSummary = {
    publicImages: findings.filter((f) => f.sourceType !== "media").length,
    content: findings.filter((f) => f.semantic === "CONTENT").length,
    decorative: findings.filter((f) => f.semantic === "DECORATIVE").length,
    mediaAltMissing: findings.filter((f) => f.issues.includes("MEDIA_ALT_NOT_SET")).length,
    renderedAltMissing: findings.filter(
      (f) => f.issues.includes("MISSING_ALT") || f.issues.includes("HTML_ALT_MISSING") || f.issues.includes("EMPTY_CONTENT_ALT"),
    ).length,
    fallbackAlt: findings.filter((f) => f.issues.includes("FALLBACK_ALT")).length,
    staleHtmlAlt: findings.filter((f) => f.issues.includes("HTML_ALT_STALE")).length,
    filenameAlt: findings.filter((f) => f.issues.includes("FILENAME_ALT")).length,
    validOrDecorativeOk: findings.filter(
      (f) =>
        f.primaryIssue === "VALID" ||
        f.primaryIssue === "DECORATIVE_OK" ||
        f.primaryIssue === "BRAND_OK" ||
        f.primaryIssue === "SOCIAL_ONLY",
    ).length,
  };
  void publicFindings;

  return { findings, summary };
}

export type ImageFilter =
  | "all"
  | "missing"
  | "media-missing"
  | "fallback"
  | "stale"
  | "filename"
  | "decorative"
  | "valid";

export function filterImageFindings(findings: ImageFinding[], filter: ImageFilter, query = "") {
  const q = query.trim().toLowerCase();
  return findings.filter((finding) => {
    if (filter === "missing") {
      if (
        !finding.issues.some((i) => i === "MISSING_ALT" || i === "HTML_ALT_MISSING" || i === "EMPTY_CONTENT_ALT")
      ) {
        return false;
      }
    } else if (filter === "media-missing") {
      if (!finding.issues.includes("MEDIA_ALT_NOT_SET")) return false;
    } else if (filter === "fallback") {
      if (!finding.issues.includes("FALLBACK_ALT")) return false;
    } else if (filter === "stale") {
      if (!finding.issues.includes("HTML_ALT_STALE")) return false;
    } else if (filter === "filename") {
      if (!finding.issues.some((i) => i === "FILENAME_ALT" || i === "URL_LIKE_ALT" || i === "PLACEHOLDER_ALT")) {
        return false;
      }
    } else if (filter === "decorative") {
      if (finding.semantic !== "DECORATIVE" && !finding.issues.includes("DECORATIVE_OK")) return false;
    } else if (filter === "valid") {
      if (
        !["VALID", "DECORATIVE_OK", "BRAND_OK", "SOCIAL_ONLY"].includes(finding.primaryIssue) &&
        finding.issues.every((i) => !["VALID", "DECORATIVE_OK", "BRAND_OK", "SOCIAL_ONLY"].includes(i))
      ) {
        return false;
      }
    }

    if (!q) return true;
    const hay = [
      finding.sourceTitle,
      finding.sourceUrl,
      finding.imageUrl,
      finding.storedMediaAlt || "",
      finding.renderedAlt || "",
      finding.sourceType,
      ...finding.issues,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
