import "server-only";
import { cache } from "react";
import { withSlash } from "@/lib/cms/redirects";
import { cms } from "@/lib/cms/repository";

/** Request-scoped public CMS reads. React invalidates this cache every server request. */
export const getPublicSettings = cache(async () => cms.getSettings());

const loadPublicPageBySlug = cache(async (slug: string) => cms.getPageBySlug(slug));

export function getPublicPageBySlug(slug: string) {
  return loadPublicPageBySlug(withSlash(slug));
}

export const getPublicPostBySlug = cache(async (slug: string) => cms.getPostBySlug(slug));

export const getPublicCategories = cache(async () => cms.listCategories());
