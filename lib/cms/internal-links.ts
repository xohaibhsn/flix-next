import { BLOG_INDEX_SLUG } from "@/lib/cms/blog-index";
import {
  BLOG_POST_PREFIX_LEGACY,
  blogPostPath,
  isLegacyBlogIndexPath,
  isLegacyBlogPostPath,
  blogsPathFromLegacyBlogPath,
} from "@/lib/cms/blog-paths";
import {
  categoryEffectiveRobotsIndex,
  categoryPublicPath,
} from "@/lib/cms/category-seo";
import {
  editorHrefForPageId,
  knownLocalDestinations,
  seoKeyForPageId,
  SUBSCRIPTION_SLUG,
  SUBSCRIPTION_SLUG_LEGACY,
} from "@/lib/cms/page-paths";
import { findActiveRedirectBySourcePath, withSlash } from "@/lib/cms/redirects";
import { publicPagePath } from "@/lib/site-url";
import type {
  BlogCategory,
  BlogPost,
  CmsPage,
  CmsSection,
  NavLink,
  RedirectRule,
  SiteSettings,
} from "@/lib/cms/types";

export const SITE_HOST = "theflixiptv.com";

export type InternalLinkIssue =
  | "VALID"
  | "BROKEN"
  | "REDIRECTED"
  | "HTTP"
  | "WWW"
  | "LEGACY_BLOG"
  | "LEGACY_SUBSCRIPTION"
  | "SELF_LINK"
  | "NOINDEX_TARGET"
  | "EXTERNAL";

export type InternalLinkSourceKind = "page" | "post" | "settings" | "code" | "faq";

export type InternalLinkFinding = {
  id: string;
  sourceKind: InternalLinkSourceKind;
  sourceLabel: string;
  sourceUrl: string;
  sourceId: string;
  editHref: string | null;
  context: string;
  anchorText: string;
  storedHref: string;
  normalizedPath: string;
  finalPath: string;
  issues: InternalLinkIssue[];
  primaryIssue: InternalLinkIssue;
};

export type InternalLinkSummary = Record<InternalLinkIssue, number> & {
  totalInternal: number;
  scanned: number;
};

export type PublicTargetMeta = {
  path: string;
  indexable: boolean;
  kind: "page" | "post" | "category" | "fixed";
  label: string;
};

export type InternalLinkScanInput = {
  settings: SiteSettings;
  pages: CmsPage[];
  posts: BlogPost[];
  categories: BlogCategory[];
  redirects: RedirectRule[];
  /** Optional code-defined links (repo-relative id, not filesystem secrets). */
  codeLinks?: Array<{
    id: string;
    label: string;
    href: string;
    context?: string;
  }>;
};

const LEGACY_SUBSCRIPTION_PATHS = new Set([
  "/iptv-subscription/",
  "/iptv-subscriptions/",
  SUBSCRIPTION_SLUG_LEGACY,
]);

const ISSUE_PRIORITY: InternalLinkIssue[] = [
  "HTTP",
  "WWW",
  "LEGACY_BLOG",
  "LEGACY_SUBSCRIPTION",
  "REDIRECTED",
  "BROKEN",
  "NOINDEX_TARGET",
  "SELF_LINK",
  "VALID",
  "EXTERNAL",
];

function clipText(value: string, max = 120) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function readAttr(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : "";
}

/** Extract anchors from CMS HTML without mutating it. */
export function extractHtmlAnchors(html: string): Array<{ href: string; text: string }> {
  const out: Array<{ href: string; text: string }> = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(html || "")))) {
    const href = readAttr(match[1] || "", "href").trim();
    if (!href) continue;
    const text = clipText(
      String(match[2] || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"'),
    );
    out.push({ href, text });
  }
  return out;
}

export type NormalizedHref = {
  stored: string;
  scope: "empty" | "fragment" | "external" | "internal" | "special";
  protocol: "http" | "https" | "relative" | "other" | "";
  hasWww: boolean;
  /** Path with trailing slash, query/hash stripped — for target checks. */
  path: string;
  /** True when href is only #fragment (same-page jump). */
  fragmentOnly: boolean;
};

export function normalizeInternalHref(storedHref: string, siteHost = SITE_HOST): NormalizedHref {
  const stored = String(storedHref || "").trim();
  if (!stored) {
    return { stored, scope: "empty", protocol: "", hasWww: false, path: "", fragmentOnly: false };
  }
  if (stored.startsWith("#")) {
    return { stored, scope: "fragment", protocol: "relative", hasWww: false, path: "", fragmentOnly: true };
  }
  if (/^(mailto|tel|sms|whatsapp):/i.test(stored)) {
    return { stored, scope: "special", protocol: "other", hasWww: false, path: "", fragmentOnly: false };
  }

  if (/^https?:\/\//i.test(stored) || stored.startsWith("//")) {
    try {
      const url = new URL(stored.startsWith("//") ? `https:${stored}` : stored);
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      const site = siteHost.replace(/^www\./i, "").toLowerCase();
      if (host !== site) {
        return {
          stored,
          scope: "external",
          protocol: url.protocol === "http:" ? "http" : "https",
          hasWww: /^www\./i.test(url.hostname),
          path: "",
          fragmentOnly: false,
        };
      }
      return {
        stored,
        scope: "internal",
        protocol: url.protocol === "http:" ? "http" : url.protocol === "https:" ? "https" : "other",
        hasWww: /^www\./i.test(url.hostname),
        path: withSlash(url.pathname || "/"),
        fragmentOnly: false,
      };
    } catch {
      return { stored, scope: "external", protocol: "other", hasWww: false, path: "", fragmentOnly: false };
    }
  }

  // Relative / root-relative path (ignore query + fragment for existence checks)
  let pathPart = stored.split("#")[0] || "";
  pathPart = pathPart.split("?")[0] || "";
  if (!pathPart.startsWith("/")) {
    pathPart = `/${pathPart}`;
  }
  return {
    stored,
    scope: "internal",
    protocol: "relative",
    hasWww: false,
    path: withSlash(pathPart || "/"),
    fragmentOnly: false,
  };
}

export function isLegacySubscriptionPath(path: string) {
  return LEGACY_SUBSCRIPTION_PATHS.has(withSlash(path));
}

export function isLegacyBlogPath(path: string) {
  const p = withSlash(path);
  return isLegacyBlogIndexPath(p) || isLegacyBlogPostPath(p) || p === BLOG_POST_PREFIX_LEGACY;
}

/** Built-in redirect hops (no live HTTP). Destination paths are slash-normalized. */
export function builtInRedirectDestination(path: string): string | null {
  const p = withSlash(path);
  if (p === "/") return "/welcome/";
  if (isLegacyBlogIndexPath(p) || p === BLOG_POST_PREFIX_LEGACY) return BLOG_INDEX_SLUG;
  if (isLegacyBlogPostPath(p)) return blogsPathFromLegacyBlogPath(p);
  if (isLegacySubscriptionPath(p)) return SUBSCRIPTION_SLUG;
  return null;
}

export function resolveInternalRedirectPath(
  path: string,
  redirects: RedirectRule[],
  maxHops = 8,
): { finalPath: string; redirected: boolean; hops: string[] } {
  const hops: string[] = [];
  let current = withSlash(path);
  let redirected = false;

  for (let i = 0; i < maxHops; i += 1) {
    const builtIn = builtInRedirectDestination(current);
    if (builtIn && withSlash(builtIn) !== current) {
      hops.push(current);
      current = withSlash(builtIn);
      redirected = true;
      continue;
    }
    const rule = findActiveRedirectBySourcePath(redirects, current);
    if (!rule) break;
    const dest = String(rule.destinationPath || "").trim();
    if (!dest || /^https?:\/\//i.test(dest)) {
      // External redirect destination — stop; treat as redirected away from site index
      hops.push(current);
      redirected = true;
      return { finalPath: current, redirected, hops };
    }
    const next = withSlash(dest.split("?")[0] || "/");
    if (next === current) break;
    hops.push(current);
    current = next;
    redirected = true;
  }

  return { finalPath: current, redirected, hops };
}

export function primaryIssue(issues: InternalLinkIssue[]): InternalLinkIssue {
  for (const issue of ISSUE_PRIORITY) {
    if (issues.includes(issue)) return issue;
  }
  return "VALID";
}

export function buildPublicTargetIndex(
  pages: Array<Pick<CmsPage, "slug" | "status" | "name" | "id">>,
  posts: Array<Pick<BlogPost, "slug" | "status" | "title" | "id" | "robotsIndex">>,
  categories: Array<Pick<BlogCategory, "slug" | "active" | "name" | "id" | "robotsIndex">>,
  settings: Pick<SiteSettings, "pageSeo">,
): Map<string, PublicTargetMeta> {
  const known = knownLocalDestinations(pages, posts, categories);
  const map = new Map<string, PublicTargetMeta>();

  const add = (path: string, meta: Omit<PublicTargetMeta, "path">) => {
    map.set(withSlash(path), { path: withSlash(path), ...meta });
  };

  add("/welcome/", { indexable: settings.pageSeo.home?.robotsIndex !== false, kind: "fixed", label: "Welcome" });
  add("/contact/", {
    indexable: settings.pageSeo.contact?.robotsIndex !== false,
    kind: "fixed",
    label: "Contact",
  });
  add("/blogs/", { indexable: settings.pageSeo.blog?.robotsIndex !== false, kind: "fixed", label: "Blog" });
  // Root is a redirect source, not a final public content URL for VALID checks
  // but knownLocalDestinations includes "/" — keep for existence of redirect chain end only via /welcome/

  for (const page of pages) {
    if (page.status === "draft") continue;
    const path = publicPagePath(page.slug);
    const seoKey = seoKeyForPageId(page.id);
    let indexable = true;
    if (seoKey && settings.pageSeo[seoKey]) {
      indexable = settings.pageSeo[seoKey].robotsIndex !== false;
    }
    add(path, { indexable, kind: "page", label: page.name || path });
    if (page.slug === "/") add("/welcome/", { indexable, kind: "page", label: page.name || "Welcome" });
  }

  for (const post of posts) {
    if (post.status !== "published") continue;
    add(blogPostPath(post.slug), {
      indexable: post.robotsIndex !== false,
      kind: "post",
      label: post.title,
    });
  }

  for (const category of categories) {
    if (category.active === false) continue;
    add(categoryPublicPath(category.slug), {
      indexable: categoryEffectiveRobotsIndex(category),
      kind: "category",
      label: category.name,
    });
  }

  // Ensure every knownLocalDestinations path exists in the map
  for (const path of known) {
    if (path === "/") continue; // redirect source, not final target
    if (!map.has(path)) {
      add(path, { indexable: true, kind: "fixed", label: path });
    }
  }

  return map;
}

export function classifyInternalLink(args: {
  storedHref: string;
  sourcePath: string;
  targets: Map<string, PublicTargetMeta>;
  redirects: RedirectRule[];
  /** Only content sources (page/post) should flag self-links. */
  checkSelfLink?: boolean;
}): { normalized: NormalizedHref; finalPath: string; issues: InternalLinkIssue[] } {
  const normalized = normalizeInternalHref(args.storedHref);
  if (normalized.scope === "empty" || normalized.scope === "special") {
    return { normalized, finalPath: "", issues: ["EXTERNAL"] };
  }
  if (normalized.scope === "fragment") {
    // Same-page jump — not a harmful self-link
    return { normalized, finalPath: withSlash(args.sourcePath), issues: ["VALID"] };
  }
  if (normalized.scope === "external") {
    return { normalized, finalPath: "", issues: ["EXTERNAL"] };
  }

  const issues: InternalLinkIssue[] = [];
  if (normalized.protocol === "http") issues.push("HTTP");
  if (normalized.hasWww) issues.push("WWW");

  const path = normalized.path;
  if (isLegacyBlogPath(path)) issues.push("LEGACY_BLOG");
  if (isLegacySubscriptionPath(path)) issues.push("LEGACY_SUBSCRIPTION");

  const resolved = resolveInternalRedirectPath(path, args.redirects);
  if (resolved.redirected) issues.push("REDIRECTED");

  const finalPath = resolved.finalPath;
  const sourcePath = withSlash(args.sourcePath);
  if (args.checkSelfLink && !normalized.fragmentOnly && (path === sourcePath || finalPath === sourcePath)) {
    issues.push("SELF_LINK");
  }

  const target = args.targets.get(finalPath);
  if (!target) {
    issues.push("BROKEN");
  } else if (!target.indexable) {
    issues.push("NOINDEX_TARGET");
  }

  if (!issues.length) issues.push("VALID");
  if (issues.length > 1 && issues.includes("VALID")) {
    const filtered = issues.filter((i) => i !== "VALID");
    return { normalized, finalPath, issues: filtered.length ? filtered : ["VALID"] };
  }
  return { normalized, finalPath, issues };
}

function walkHrefStrings(value: unknown, out: Array<{ href: string; context: string }>, context: string) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkHrefStrings(item, out, `${context}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && /href/i.test(key) && item.trim()) {
      out.push({ href: item.trim(), context: `${context}.${key}` });
    } else {
      walkHrefStrings(item, out, `${context}.${key}`);
    }
  }
}

function sectionHtmlChunks(section: CmsSection): Array<{ html: string; context: string }> {
  const data = section.data as Record<string, unknown>;
  const chunks: Array<{ html: string; context: string }> = [];
  if (typeof data.html === "string" && data.html.trim()) {
    chunks.push({ html: data.html, context: `section:${section.type}/html` });
  }
  if (section.type === "faq" && Array.isArray(data.items)) {
    for (const item of data.items as Array<{ question?: string; answer?: string }>) {
      if (item.answer && /<a\b/i.test(item.answer)) {
        chunks.push({ html: item.answer, context: `section:faq/answer` });
      }
    }
  }
  return chunks;
}

function pagePublicPath(page: CmsPage) {
  return publicPagePath(page.slug);
}

function pageEditHref(page: CmsPage) {
  return editorHrefForPageId(page.id) || `/sidhu/pages/${page.slug.replace(/^\/|\/$/g, "") || "home"}/`;
}

function collectNavLinks(settings: SiteSettings): Array<{ href: string; label: string; context: string }> {
  const groups: Array<{ key: string; links: NavLink[] }> = [
    { key: "headerNav", links: settings.headerNav || [] },
    { key: "footerQuickLinks", links: settings.footerQuickLinks || [] },
    { key: "footerSupportLinks", links: settings.footerSupportLinks || [] },
    { key: "footerLegalLinks", links: settings.footerLegalLinks || [] },
  ];
  const out: Array<{ href: string; label: string; context: string }> = [];
  for (const group of groups) {
    for (const link of group.links) {
      if (!link?.href?.trim()) continue;
      out.push({ href: link.href.trim(), label: link.label || link.href, context: `settings.${group.key}` });
    }
  }
  if (settings.headerCtaHref?.trim()) {
    out.push({
      href: settings.headerCtaHref.trim(),
      label: settings.headerCtaLabel || "Header CTA",
      context: "settings.headerCtaHref",
    });
  }
  return out;
}

export const DEFAULT_CODE_DEFINED_LINKS: NonNullable<InternalLinkScanInput["codeLinks"]> = [
  { id: "site-shell-breadcrumb-home", label: "SiteShell breadcrumb Home", href: "/welcome/", context: "SiteShell" },
  { id: "header-logo", label: "Header logo", href: "/", context: "Header" },
];

let findingSeq = 0;
function nextFindingId(prefix: string) {
  findingSeq += 1;
  return `${prefix}-${findingSeq}`;
}

export function emptyInternalLinkSummary(): InternalLinkSummary {
  return {
    scanned: 0,
    totalInternal: 0,
    VALID: 0,
    BROKEN: 0,
    REDIRECTED: 0,
    HTTP: 0,
    WWW: 0,
    LEGACY_BLOG: 0,
    LEGACY_SUBSCRIPTION: 0,
    SELF_LINK: 0,
    NOINDEX_TARGET: 0,
    EXTERNAL: 0,
  };
}

export function summarizeFindings(findings: InternalLinkFinding[]): InternalLinkSummary {
  const summary = emptyInternalLinkSummary();
  summary.scanned = findings.length;
  for (const finding of findings) {
    if (finding.primaryIssue === "EXTERNAL" || finding.issues.includes("EXTERNAL")) {
      summary.EXTERNAL += 1;
      continue;
    }
    summary.totalInternal += 1;
    for (const issue of finding.issues) {
      if (issue === "EXTERNAL") continue;
      summary[issue] += 1;
    }
  }
  return summary;
}

function pushFinding(
  findings: InternalLinkFinding[],
  partial: Omit<InternalLinkFinding, "id" | "primaryIssue" | "issues" | "normalizedPath" | "finalPath"> & {
    storedHref: string;
    sourcePath: string;
    targets: Map<string, PublicTargetMeta>;
    redirects: RedirectRule[];
    checkSelfLink?: boolean;
  },
) {
  const classified = classifyInternalLink({
    storedHref: partial.storedHref,
    sourcePath: partial.sourcePath,
    targets: partial.targets,
    redirects: partial.redirects,
    checkSelfLink: partial.checkSelfLink,
  });
  findings.push({
    id: nextFindingId(partial.sourceKind),
    sourceKind: partial.sourceKind,
    sourceLabel: partial.sourceLabel,
    sourceUrl: partial.sourceUrl,
    sourceId: partial.sourceId,
    editHref: partial.editHref,
    context: partial.context,
    anchorText: partial.anchorText,
    storedHref: partial.storedHref,
    normalizedPath: classified.normalized.path,
    finalPath: classified.finalPath,
    issues: classified.issues,
    primaryIssue: primaryIssue(classified.issues),
  });
}

export function scanInternalLinks(input: InternalLinkScanInput): {
  findings: InternalLinkFinding[];
  summary: InternalLinkSummary;
  targets: Map<string, PublicTargetMeta>;
  orphans: Array<{ kind: string; label: string; path: string; note: string }>;
} {
  findingSeq = 0;
  const targets = buildPublicTargetIndex(input.pages, input.posts, input.categories, input.settings);
  const findings: InternalLinkFinding[] = [];
  const inbound = new Map<string, number>();

  const noteInbound = (finalPath: string, issues: InternalLinkIssue[]) => {
    if (issues.includes("EXTERNAL") || issues.includes("BROKEN")) return;
    if (!finalPath) return;
    inbound.set(finalPath, (inbound.get(finalPath) || 0) + 1);
  };

  const track = (args: Parameters<typeof pushFinding>[1]) => {
    const before = findings.length;
    pushFinding(findings, args);
    const finding = findings[before];
    if (finding) noteInbound(finding.finalPath, finding.issues);
  };

  // Settings navigation / CTA
  for (const link of collectNavLinks(input.settings)) {
    track({
      sourceKind: "settings",
      sourceLabel: "Site settings / navigation",
      sourceUrl: "/",
      sourceId: "settings",
      editHref: "/sidhu/settings/",
      context: link.context,
      anchorText: link.label,
      storedHref: link.href,
      sourcePath: "/welcome/",
      targets,
      redirects: input.redirects,
    });
  }

  // Pages: HTML + structured href fields
  for (const page of input.pages) {
    if (page.status === "draft") continue;
    const sourcePath = pagePublicPath(page);
    const editHref = pageEditHref(page);
    for (const section of page.sections || []) {
      for (const chunk of sectionHtmlChunks(section)) {
        for (const anchor of extractHtmlAnchors(chunk.html)) {
          track({
            sourceKind: "page",
            sourceLabel: page.name,
            sourceUrl: sourcePath,
            sourceId: page.id,
            editHref,
            context: chunk.context,
            anchorText: anchor.text,
            storedHref: anchor.href,
            sourcePath,
            targets,
            redirects: input.redirects,
            checkSelfLink: true,
          });
        }
      }
      const structured: Array<{ href: string; context: string }> = [];
      walkHrefStrings(section.data, structured, `section:${section.type}`);
      for (const item of structured) {
        track({
          sourceKind: "page",
          sourceLabel: page.name,
          sourceUrl: sourcePath,
          sourceId: page.id,
          editHref,
          context: item.context,
          anchorText: "",
          storedHref: item.href,
          sourcePath,
          targets,
          redirects: input.redirects,
          checkSelfLink: true,
        });
      }
    }
  }

  // Posts
  for (const post of input.posts) {
    if (post.status !== "published") continue;
    const sourcePath = blogPostPath(post.slug);
    const editHref = `/sidhu/blog/${post.id}/`;
    for (const anchor of extractHtmlAnchors(post.content || "")) {
      track({
        sourceKind: "post",
        sourceLabel: post.title,
        sourceUrl: sourcePath,
        sourceId: post.id,
        editHref,
        context: "post.content",
        anchorText: anchor.text,
        storedHref: anchor.href,
        sourcePath,
        targets,
        redirects: input.redirects,
        checkSelfLink: true,
      });
    }
    if (post.excerpt && /<a\b/i.test(post.excerpt)) {
      for (const anchor of extractHtmlAnchors(post.excerpt)) {
        track({
          sourceKind: "post",
          sourceLabel: post.title,
          sourceUrl: sourcePath,
          sourceId: post.id,
          editHref,
          context: "post.excerpt",
          anchorText: anchor.text,
          storedHref: anchor.href,
          sourcePath,
          targets,
          redirects: input.redirects,
          checkSelfLink: true,
        });
      }
    }
  }

  // Code-defined
  for (const link of input.codeLinks || DEFAULT_CODE_DEFINED_LINKS) {
    track({
      sourceKind: "code",
      sourceLabel: link.label,
      sourceUrl: "(code-defined)",
      sourceId: link.id,
      editHref: null,
      context: link.context || "code",
      anchorText: link.label,
      storedHref: link.href,
      sourcePath: "/welcome/",
      targets,
      redirects: input.redirects,
    });
  }

  // Simple orphan diagnostic (optional, safe wording)
  const orphanSkip = new Set([
    "/welcome/",
    "/contact/",
    "/blogs/",
    "/refund-policy/",
    "/privacy-policy/",
    "/terms-and-conditions/",
    "/cookie-policy/",
    "/copyright-policy/",
  ]);
  const orphans: Array<{ kind: string; label: string; path: string; note: string }> = [];
  for (const [path, meta] of targets) {
    if (orphanSkip.has(path)) continue;
    if (!meta.indexable) continue;
    if ((inbound.get(path) || 0) > 0) continue;
    orphans.push({
      kind: meta.kind,
      label: meta.label,
      path,
      note: "No discovered internal links.",
    });
  }

  return {
    findings,
    summary: summarizeFindings(findings),
    targets,
    orphans,
  };
}

export function filterFindings(
  findings: InternalLinkFinding[],
  filter: "all" | "problems" | InternalLinkIssue,
  query = "",
) {
  const q = query.trim().toLowerCase();
  return findings.filter((finding) => {
    if (finding.primaryIssue === "EXTERNAL" || finding.issues.includes("EXTERNAL")) {
      if (filter !== "EXTERNAL" && filter !== "all") return false;
    }
    if (filter === "problems") {
      if (finding.issues.every((i) => i === "VALID" || i === "EXTERNAL")) return false;
    } else if (filter !== "all") {
      if (!finding.issues.includes(filter)) return false;
    }
    if (!q) return true;
    const hay = [
      finding.sourceLabel,
      finding.sourceUrl,
      finding.storedHref,
      finding.finalPath,
      finding.anchorText,
      finding.context,
      finding.primaryIssue,
      ...finding.issues,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
