import { PAGE_SEO_META, type PageSeoKey } from "@/lib/cms/page-seo";
import type { BlogCategory, BlogPost, CmsPage, CmsSection, MediaAsset, MediaRef, SiteSettings } from "@/lib/cms/types";

function extractHtmlImageSrcs(html: string): string[] {
  const out: string[] = [];
  const re = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(html || "")))) {
    const attrs = match[1] || "";
    const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const src = (srcMatch?.[1] ?? srcMatch?.[2] ?? srcMatch?.[3] ?? "").trim();
    if (src) out.push(src);
  }
  return out;
}

export type MediaUsageReference = {
  type: string;
  entity: string;
  field: string;
  location: string;
};

export type MediaUsage = {
  inUse: boolean;
  references: MediaUsageReference[];
};

export type MediaUsageContent = {
  settings: SiteSettings;
  pages?: CmsPage[];
  posts?: BlogPost[];
  categories?: BlogCategory[];
};

/** Structured MediaRef ID coverage (settings / SEO / blog featured / categories). */
export function referencedMediaIds(settings: SiteSettings, posts: BlogPost[] = [], categories: BlogCategory[] = []) {
  const ids = [
    settings.branding.logo?.id,
    settings.branding.favicon?.id,
    settings.branding.defaultOgImage?.id,
    ...settings.footerPaymentImages.map((item) => item.id),
    ...Object.values(settings.pageSeo).map((seo) => seo.ogImage?.id),
    ...posts.flatMap((post) => [post.featuredImage?.id, post.ogImage?.id]),
    ...categories.map((category) => category.ogImage?.id),
  ].filter((id): id is string => Boolean(id));
  return new Set(ids);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether an HTML/img src points at this Media Library asset (exact URL or Cloudinary publicId path). */
export function htmlSrcReferencesAsset(src: string, asset: Pick<MediaAsset, "secureUrl" | "publicId">): boolean {
  const value = String(src || "").trim();
  if (!value) return false;
  const secureUrl = String(asset.secureUrl || "").trim();
  if (secureUrl) {
    if (value === secureUrl) return true;
    const bareSrc = value.split("?")[0] || value;
    const bareUrl = secureUrl.split("?")[0] || secureUrl;
    if (bareSrc === bareUrl) return true;
  }
  const publicId = String(asset.publicId || "").trim();
  if (!publicId) return false;
  // Require a path-boundary match so `theflix/site/foo` does not match `theflix/site/foo2`.
  const pattern = new RegExp(`(?:^|[/])${escapeRegExp(publicId)}(?:\\.[a-z0-9]+)?(?:$|[/?#])`, "i");
  return pattern.test(value);
}

function sectionHtmlChunks(section: CmsSection): string[] {
  const data = section.data as Record<string, unknown>;
  const chunks: string[] = [];
  if (typeof data.html === "string" && data.html.trim()) chunks.push(data.html);
  return chunks;
}

function pushRef(refs: MediaUsageReference[], ref: MediaUsageReference) {
  if (refs.some((item) => item.type === ref.type && item.entity === ref.entity && item.field === ref.field && item.location === ref.location)) {
    return;
  }
  refs.push(ref);
}

function pushMediaRefIfMatch(
  refs: MediaUsageReference[],
  asset: MediaAsset,
  mediaRef: MediaRef | null | undefined,
  meta: MediaUsageReference,
) {
  if (!mediaRef) return;
  if (mediaRef.id === asset.id) {
    pushRef(refs, meta);
    return;
  }
  // Prefer ID, but still catch MediaRefs that lost id while keeping URL/publicId.
  if (htmlSrcReferencesAsset(mediaRef.secureUrl, asset) || (mediaRef.publicId && mediaRef.publicId === asset.publicId)) {
    pushRef(refs, meta);
  }
}

function collectStructuredReferences(asset: MediaAsset, content: MediaUsageContent, refs: MediaUsageReference[]) {
  const { settings, posts = [], categories = [] } = content;
  pushMediaRefIfMatch(refs, asset, settings.branding.logo, {
    type: "settings",
    entity: "Site branding",
    field: "logo",
    location: "/sidhu/settings/",
  });
  pushMediaRefIfMatch(refs, asset, settings.branding.favicon, {
    type: "settings",
    entity: "Site branding",
    field: "favicon",
    location: "/sidhu/settings/",
  });
  pushMediaRefIfMatch(refs, asset, settings.branding.defaultOgImage, {
    type: "settings",
    entity: "Site branding",
    field: "defaultOgImage",
    location: "/sidhu/settings/",
  });
  for (const [index, image] of (settings.footerPaymentImages || []).entries()) {
    pushMediaRefIfMatch(refs, asset, image, {
      type: "settings",
      entity: "Footer payment icons",
      field: `footerPaymentImages[${index}]`,
      location: "/sidhu/settings/",
    });
  }
  for (const [key, seo] of Object.entries(settings.pageSeo)) {
    const meta = PAGE_SEO_META[key as PageSeoKey];
    pushMediaRefIfMatch(refs, asset, seo?.ogImage, {
      type: "pageSeo",
      entity: meta?.label || key,
      field: "ogImage",
      location: meta?.editorHref || "/sidhu/seo/",
    });
  }
  for (const post of posts) {
    const edit = `/sidhu/blog/${post.id}/`;
    pushMediaRefIfMatch(refs, asset, post.featuredImage, {
      type: "post",
      entity: post.title || post.slug || post.id,
      field: "featuredImage",
      location: edit,
    });
    pushMediaRefIfMatch(refs, asset, post.ogImage, {
      type: "post",
      entity: post.title || post.slug || post.id,
      field: "ogImage",
      location: edit,
    });
  }
  for (const category of categories) {
    pushMediaRefIfMatch(refs, asset, category.ogImage, {
      type: "category",
      entity: category.name || category.slug || category.id,
      field: "ogImage",
      location: `/sidhu/blog/category/${category.id}/`,
    });
  }
}

function collectHtmlReferences(asset: MediaAsset, content: MediaUsageContent, refs: MediaUsageReference[]) {
  for (const page of content.pages || []) {
    for (const section of page.sections || []) {
      for (const html of sectionHtmlChunks(section)) {
        for (const src of extractHtmlImageSrcs(html)) {
          if (!htmlSrcReferencesAsset(src, asset)) continue;
          pushRef(refs, {
            type: "page-html",
            entity: page.name || page.slug || page.id,
            field: `section:${section.type}.html`,
            location: page.id === "page-home"
              ? "/sidhu/pages/home/"
              : page.id === "page-contact"
                ? "/sidhu/pages/contact/"
                : page.id === "page-subscriptions"
                  ? "/sidhu/pages/subscriptions/"
                  : `/sidhu/pages/${String(page.slug || "").replace(/^\/|\/$/g, "") || "home"}/`,
          });
        }
      }
    }
  }
  for (const post of content.posts || []) {
    for (const src of extractHtmlImageSrcs(post.content || "")) {
      if (!htmlSrcReferencesAsset(src, asset)) continue;
      pushRef(refs, {
        type: "post-html",
        entity: post.title || post.slug || post.id,
        field: "content",
        location: `/sidhu/blog/${post.id}/`,
      });
    }
  }
}

/** Authoritative Media Library usage for one asset against already-loaded CMS content. */
export function getMediaUsage(asset: MediaAsset, content: MediaUsageContent): MediaUsage {
  const references: MediaUsageReference[] = [];
  collectStructuredReferences(asset, content, references);
  collectHtmlReferences(asset, content, references);
  return { inUse: references.length > 0, references };
}

/** Evaluate usage for many assets with one in-memory pass over CMS content. */
export function getMediaUsageById(assets: MediaAsset[], content: MediaUsageContent): Map<string, MediaUsage> {
  const map = new Map<string, MediaUsage>();
  for (const asset of assets) {
    map.set(asset.id, getMediaUsage(asset, content));
  }
  return map;
}
