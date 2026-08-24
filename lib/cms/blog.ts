import { createId } from "@/lib/cms/ids";
import type { BlogPost } from "@/lib/cms/types";

export function emptyPost(): BlogPost {
  const now = new Date().toISOString();
  return {
    id: createId("post"),
    title: "",
    slug: "",
    excerpt: "",
    content: "<p></p>",
    categoryId: null,
    featuredImage: null,
    status: "draft",
    featured: false,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
  };
}

export function insertEditorImage(html: string, url: string, alt: string) {
  const safeAlt = String(alt || "").replace(/"/g, "");
  return `${html}<p><img src="${url}" alt="${safeAlt}" /></p>`;
}
