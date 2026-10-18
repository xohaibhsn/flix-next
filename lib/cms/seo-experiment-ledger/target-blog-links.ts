/**
 * Experiment Ledger L4A — read-only target Blog navigation helpers.
 * Pure. No MySQL. No Planning provenance. No mutation.
 *
 * PROVEN_EXISTING_TARGET only: a stored decision.targetPostId that resolves
 * to a current BlogPost. Never claims Research→Planning→Blog lineage.
 */

import { seoPlanningBlogEditorPath } from "@/lib/cms/seo-planning/handoff";

const SAFE_POST_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

export type LedgerTargetBlogLinkState =
  | { kind: "none" }
  | { kind: "unsafe_id"; targetPostId: string }
  | { kind: "missing"; targetPostId: string }
  | {
      kind: "exists_text_only";
      targetPostId: string;
      title: string | null;
    }
  | {
      kind: "exists_editable";
      targetPostId: string;
      title: string | null;
      editorHref: string;
    };

export function isSafeLedgerTargetPostId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const id = value.trim();
  if (!id || id.length > 80) return false;
  return SAFE_POST_ID_RE.test(id);
}

/** Unique, trimmed target post IDs from ≤5 decisions (order preserved). */
export function collectUniqueLedgerTargetPostIds(
  decisions: ReadonlyArray<{ targetPostId?: string | null }>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of decisions) {
    const raw = row.targetPostId == null ? "" : String(row.targetPostId).trim();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/**
 * Resolve display/navigation for one stored targetPostId.
 * `post` must be the row returned for that id (or null if missing).
 * `canEditBlog` gates the privileged editor href (blog permission).
 */
export function resolveLedgerTargetBlogLink(args: {
  targetPostId: string | null | undefined;
  post: { id: string; title?: string | null } | null | undefined;
  canEditBlog: boolean;
}): LedgerTargetBlogLinkState {
  const raw =
    args.targetPostId == null ? "" : String(args.targetPostId).trim();
  if (!raw) return { kind: "none" };
  if (!isSafeLedgerTargetPostId(raw)) {
    return { kind: "unsafe_id", targetPostId: raw.slice(0, 80) };
  }
  if (!args.post || String(args.post.id).trim() !== raw) {
    return { kind: "missing", targetPostId: raw };
  }
  const title =
    args.post.title == null || String(args.post.title).trim() === ""
      ? null
      : String(args.post.title).trim();
  if (!args.canEditBlog) {
    return { kind: "exists_text_only", targetPostId: raw, title };
  }
  return {
    kind: "exists_editable",
    targetPostId: raw,
    title,
    editorHref: seoPlanningBlogEditorPath(raw),
  };
}

/**
 * Bounded batch resolve for Ledger detail (≤5 unique IDs).
 * One getPostById per unique id — no Planning lookup, no N×listPosts.
 */
export async function resolveLedgerTargetBlogLinks(args: {
  decisions: ReadonlyArray<{ targetPostId?: string | null }>;
  getPostById: (id: string) => Promise<{ id: string; title?: string | null } | null>;
  canEditBlog: boolean;
}): Promise<Record<string, LedgerTargetBlogLinkState>> {
  const ids = collectUniqueLedgerTargetPostIds(args.decisions);
  const out: Record<string, LedgerTargetBlogLinkState> = {};
  await Promise.all(
    ids.map(async (id) => {
      if (!isSafeLedgerTargetPostId(id)) {
        out[id] = { kind: "unsafe_id", targetPostId: id.slice(0, 80) };
        return;
      }
      let post: { id: string; title?: string | null } | null = null;
      try {
        post = await args.getPostById(id);
      } catch {
        post = null;
      }
      out[id] = resolveLedgerTargetBlogLink({
        targetPostId: id,
        post,
        canEditBlog: args.canEditBlog,
      });
    }),
  );
  return out;
}
