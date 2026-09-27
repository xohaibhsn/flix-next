/**
 * Blog-article Open Graph / timestamp helpers.
 * Uses only stored CMS timestamps — never request, build, or deploy time.
 */

export function articleTimestamp(value: string | null | undefined): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

export function articlePublishedTime(post: {
  publishedAt?: string | null;
  createdAt?: string | null;
}): string | undefined {
  return articleTimestamp(post.publishedAt || post.createdAt);
}

export function articleModifiedTime(post: { updatedAt?: string | null }): string | undefined {
  return articleTimestamp(post.updatedAt);
}

/** Open Graph fields for published individual blog posts only. */
export function articleOpenGraphFields(post: {
  publishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}) {
  const publishedTime = articlePublishedTime(post);
  const modifiedTime = articleModifiedTime(post);
  return {
    type: "article" as const,
    ...(publishedTime ? { publishedTime } : {}),
    ...(modifiedTime ? { modifiedTime } : {}),
  };
}
