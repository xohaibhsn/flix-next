import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { withSlash } from "@/lib/cms/redirects";
import { cms } from "@/lib/cms/repository";
import {
  PUBLIC_CACHE_TAGS,
  PUBLIC_CMS_DATA_REVALIDATE_SECONDS,
} from "@/lib/cms/public-cache-tags";

const loadSettingsAcrossRequests = unstable_cache(
  async () => cms.getSettings(),
  ["flix-public-settings"],
  { revalidate: PUBLIC_CMS_DATA_REVALIDATE_SECONDS, tags: [PUBLIC_CACHE_TAGS.settings] },
);

const loadPageAcrossRequests = unstable_cache(
  async (slug: string) => cms.getPageBySlug(slug),
  ["flix-public-page-by-slug"],
  { revalidate: PUBLIC_CMS_DATA_REVALIDATE_SECONDS, tags: [PUBLIC_CACHE_TAGS.pages] },
);

const loadPlansAcrossRequests = unstable_cache(
  async () => cms.listPlans(),
  ["flix-public-plans"],
  { revalidate: PUBLIC_CMS_DATA_REVALIDATE_SECONDS, tags: [PUBLIC_CACHE_TAGS.plans] },
);

const loadFaqsAcrossRequests = unstable_cache(
  async () => cms.listFaqs(),
  ["flix-public-faqs"],
  { revalidate: PUBLIC_CMS_DATA_REVALIDATE_SECONDS, tags: [PUBLIC_CACHE_TAGS.faqs] },
);

/** Request-scoped public CMS reads. React invalidates this cache every server request. */
export const getPublicSettings = cache(async () => loadSettingsAcrossRequests());

const loadPublicPageBySlug = cache(async (slug: string) => loadPageAcrossRequests(slug));

export function getPublicPageBySlug(slug: string) {
  return loadPublicPageBySlug(withSlash(slug));
}

export const getPublicPlans = cache(async () => loadPlansAcrossRequests());

export const getPublicFaqs = cache(async () => loadFaqsAcrossRequests());

export const getPublicPostBySlug = cache(async (slug: string) => cms.getPostBySlug(slug));

export const getPublicCategories = cache(async () => cms.listCategories());
