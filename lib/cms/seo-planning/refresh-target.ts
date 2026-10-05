/**
 * Pure REFRESH target check. Uses the same public blog path match as Proceed.
 * No database access and no network.
 */

import { resolvePostByMatchedPublicUrl } from "@/lib/cms/seo-planning/proceed";
import type { BlogPost } from "@/lib/cms/types";

export type RefreshTargetStatus = "missing" | "mismatch" | "ready";

export function classifyRefreshArticle(args: {
  targetPostId: string | null;
  matchedPublicUrl: string;
  post: Pick<BlogPost, "id" | "slug"> | null;
}): RefreshTargetStatus {
  if (!args.targetPostId || !args.post || args.post.id !== args.targetPostId) return "missing";
  const matched = resolvePostByMatchedPublicUrl(
    [{ slug: args.post.slug } as BlogPost],
    args.matchedPublicUrl,
  );
  return matched ? "ready" : "mismatch";
}
