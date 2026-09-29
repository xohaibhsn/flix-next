/** Stable Next data-cache tags for core public CMS reads (Phase C1). */
export const PUBLIC_CACHE_TAGS = {
  settings: "flix:settings",
  pages: "flix:pages",
  plans: "flix:plans",
  faqs: "flix:faqs",
} as const;

export type PublicCacheTag = (typeof PUBLIC_CACHE_TAGS)[keyof typeof PUBLIC_CACHE_TAGS];

/** Safety backstop TTL (seconds) for unstable_cache when tags are not invalidated. */
export const PUBLIC_CMS_DATA_REVALIDATE_SECONDS = 60;
