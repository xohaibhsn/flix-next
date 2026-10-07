/**
 * Content Handoff V1 — Planning → Blog editor (Option A).
 * Deterministic domain + JSON catalog coverage. No provider/GSC calls.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

import { JsonCatalogRepository } from "../lib/cms/json-catalog";
import { sanitizeSeoPlanningDraft } from "../lib/cms/seo-planning/sanitize";
import {
  buildNewBlogHandoffDraft,
  evaluateSeoPlanningHandoffEligibility,
  parseSeoPlanningHandoffInput,
  resolveNewBlogHandoffSlug,
  seoPlanningBlogEditorPath,
  SEO_PLANNING_HANDOFF_INTERNAL_LINK_MESSAGE,
  SEO_PLANNING_HANDOFF_LINKED_POST_MISSING_MESSAGE,
  SEO_PLANNING_HANDOFF_REFRESH_TARGET_MISSING_MESSAGE,
  SEO_PLANNING_HANDOFF_RESTORE_HISTORICAL_MESSAGE,
  SEO_PLANNING_HANDOFF_SLUG_CONFLICT_MESSAGE,
} from "../lib/cms/seo-planning/handoff";
import {
  SEO_PLANNING_ARCHIVED_EDIT_MESSAGE,
  SEO_PLANNING_MISSING_DRAFT_MESSAGE,
} from "../lib/cms/seo-planning/lifecycle";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MEDIA_REF = {
  id: "media_fs",
  publicId: "flix/blog/firestick",
  secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/flix/blog/firestick.webp",
};

function baseDraft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return sanitizeSeoPlanningDraft({
    id: "seoplan_handoff_1",
    recommendation: "REFRESH_EXISTING",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "REFRESH_EXISTING:post_firestick",
    topic: "Firestick buffering and playback troubleshooting",
    workingTitle: "Firestick IPTV Buffering: A Step-by-Step Wi-Fi and Playback Check",
    proposedSlug: "",
    targetPostId: "post-firestick",
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
    restorePath: "",
    searchIntent: "TROUBLESHOOTING",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-07T02:37:00.000Z",
    updatedAt: "2026-10-07T02:37:00.000Z",
    archivedAt: null,
    payload: { opportunity: { topic: "Firestick" } },
    ...overrides,
  });
}

function basePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-firestick",
    title: "How to Watch IPTV on Firestick: Complete Setup Guide",
    slug: "how-to-watch-iptv-on-firestick",
    excerpt: "Setup guide",
    content: "<p>Existing published body</p>",
    categoryId: "cat-setup",
    featuredImage: MEDIA_REF,
    status: "published",
    featured: true,
    publishedAt: "2026-08-30T00:00:00.000Z",
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    seoTitle: "How to Watch IPTV on Firestick",
    seoDescription: "Learn how to watch IPTV on Firestick",
    focusKeyword: "firestick iptv",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: MEDIA_REF,
    sitemapInclude: true,
    ...overrides,
  };
}

/** Avoid listPosts() seeding defaultBlogPosts into an empty cwd. */
function seedEmptyBlogPosts(dir: string) {
  mkdirSync(path.join(dir, "data"), { recursive: true });
  writeFileSync(path.join(dir, "data", "blog-posts.json"), "[]\n");
}

function snapshotPostFields(post: BlogPost | null | undefined) {
  assert.ok(post);
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    categoryId: post.categoryId,
    featuredImage: post.featuredImage,
    status: post.status,
    featured: post.featured,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    focusKeyword: post.focusKeyword,
    canonicalUrl: post.canonicalUrl,
    robotsIndex: post.robotsIndex,
    robotsFollow: post.robotsFollow,
    ogTitle: post.ogTitle,
    ogDescription: post.ogDescription,
    ogImage: post.ogImage,
    sitemapInclude: post.sitemapInclude,
  };
}

async function withTempCatalog(prefix: string, run: (cms: JsonCatalogRepository, dir: string) => Promise<void>) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const previous = process.cwd();
  process.chdir(dir);
  seedEmptyBlogPosts(dir);
  try {
    await run(new JsonCatalogRepository(), dir);
  } finally {
    process.chdir(previous);
  }
}

test("parseSeoPlanningHandoffInput accepts planningDraftId only", () => {
  const ok = parseSeoPlanningHandoffInput({ planningDraftId: "seoplan_abc" });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.planningDraftId, "seoplan_abc");

  const bad = parseSeoPlanningHandoffInput({ planningDraftId: "" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.code, "planning_not_found");
});

test("eligibility rejects archived / INTERNAL_LINK / RESTORE / unsupported", () => {
  assert.equal(
    evaluateSeoPlanningHandoffEligibility(baseDraft({ archivedAt: "2026-10-08T00:00:00.000Z" })).ok,
    false,
  );
  const internal = evaluateSeoPlanningHandoffEligibility(
    baseDraft({ recommendation: "INTERNAL_LINK_ONLY", targetPostId: "post-firestick" }),
  );
  assert.equal(internal.ok, false);
  if (!internal.ok) {
    assert.equal(internal.code, "internal_link_only");
    assert.equal(internal.error, SEO_PLANNING_HANDOFF_INTERNAL_LINK_MESSAGE);
  }
  const restore = evaluateSeoPlanningHandoffEligibility(
    baseDraft({ recommendation: "RESTORE_HISTORICAL", restorePath: "/blogs/old/" }),
  );
  assert.equal(restore.ok, false);
  if (!restore.ok) {
    assert.equal(restore.code, "restore_historical");
    assert.equal(restore.error, SEO_PLANNING_HANDOFF_RESTORE_HISTORICAL_MESSAGE);
  }
  const unsupported = evaluateSeoPlanningHandoffEligibility(
    baseDraft({ recommendation: "SOMETHING_ELSE" as SeoPlanningDraft["recommendation"] }),
  );
  assert.equal(unsupported.ok, false);
});

test("NEW_BLOG draft builder is private empty HTML with title/slug", () => {
  const draft = buildNewBlogHandoffDraft({
    workingTitle: "Wi-Fi quality guide",
    proposedSlug: "wifi-quality-guide",
    createIdFn: () => "post_new_1",
    now: "2026-10-08T01:00:00.000Z",
  });
  assert.equal("ok" in draft, false);
  if ("ok" in draft) return;
  assert.equal(draft.id, "post_new_1");
  assert.equal(draft.title, "Wi-Fi quality guide");
  assert.equal(draft.slug, "wifi-quality-guide");
  assert.equal(draft.content, "<p></p>");
  assert.equal(draft.status, "draft");
  assert.equal(draft.publishedAt, null);
  assert.equal(draft.featuredImage, null);
  assert.equal(draft.ogImage, null);
  assert.equal(draft.categoryId, null);
  assert.equal(resolveNewBlogHandoffSlug({ proposedSlug: "", workingTitle: "Hello World" }), "hello-world");
  assert.equal(seoPlanningBlogEditorPath("post-firestick"), "/sidhu/blog/post-firestick/");
});

// Serialize chdir-based JSON catalog tests (process.cwd is global).
describe("JSON Content Handoff catalog", { concurrency: false }, () => {
  test("REFRESH opens target without Blog/Planning mutation", async () => {
    await withTempCatalog("flix-handoff-refresh-", async (cms, dir) => {
      const post = basePost();
      await cms.savePost(post);
      const planning = baseDraft();
      await cms.saveSeoPlanningDraft(planning);

      const beforePostsRaw = readFileSync(path.join(dir, "data", "blog-posts.json"), "utf8");
      const beforePlanning = await cms.getSeoPlanningDraftById(planning.id);
      const beforeFields = snapshotPostFields(await cms.getPostById(post.id));

      const result = await cms.handoffSeoPlanningToBlog(planning.id);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.created, false);
      assert.equal(result.postId, "post-firestick");
      assert.equal(result.editorPath, "/sidhu/blog/post-firestick/");
      assert.equal(result.recommendation, "REFRESH_EXISTING");

      const afterPostsRaw = readFileSync(path.join(dir, "data", "blog-posts.json"), "utf8");
      assert.equal(afterPostsRaw, beforePostsRaw);

      const afterPlanning = await cms.getSeoPlanningDraftById(planning.id);
      assert.deepEqual(snapshotPostFields(await cms.getPostById(post.id)), beforeFields);
      assert.equal(afterPlanning?.workflowStatus, "CONTENT_NEEDED");
      assert.equal(afterPlanning?.linkedPostId, beforePlanning?.linkedPostId ?? null);
      assert.equal(afterPlanning?.workingTitle, beforePlanning?.workingTitle);
      assert.equal((await cms.listPosts()).length, 1);
    });
  });

  test("REFRESH fails for missing target / archived / INTERNAL_LINK", async () => {
    await withTempCatalog("flix-handoff-refresh-fail-", async (cms) => {
      await cms.saveSeoPlanningDraft(baseDraft({ targetPostId: "post_missing" }));
      const missing = await cms.handoffSeoPlanningToBlog("seoplan_handoff_1");
      assert.equal(missing.ok, false);
      if (!missing.ok) {
        assert.equal(missing.code, "refresh_target_missing");
        assert.equal(missing.error, SEO_PLANNING_HANDOFF_REFRESH_TARGET_MISSING_MESSAGE);
      }

      const active = baseDraft({
        id: "seoplan_to_archive",
        fingerprint: "REFRESH_EXISTING:to_archive",
      });
      await cms.savePost(basePost());
      await cms.saveSeoPlanningDraft(active);
      const archived = await cms.archiveSeoPlanningDraft(active.id);
      assert.equal(archived.ok, true);
      const archivedHandoff = await cms.handoffSeoPlanningToBlog(active.id);
      assert.equal(archivedHandoff.ok, false);
      if (!archivedHandoff.ok) {
        assert.equal(archivedHandoff.code, "planning_archived");
        assert.equal(archivedHandoff.error, SEO_PLANNING_ARCHIVED_EDIT_MESSAGE);
      }

      const internal = baseDraft({
        id: "seoplan_internal",
        fingerprint: "INTERNAL_LINK_ONLY:post-firestick",
        recommendation: "INTERNAL_LINK_ONLY",
        workflowStatus: "PLANNING",
      });
      await cms.saveSeoPlanningDraft(internal);
      const internalResult = await cms.handoffSeoPlanningToBlog(internal.id);
      assert.equal(internalResult.ok, false);
      if (!internalResult.ok) assert.equal(internalResult.code, "internal_link_only");
    });
  });

  test("REFRESH uses targetPostId even when slug drifted", async () => {
    await withTempCatalog("flix-handoff-slug-drift-", async (cms) => {
      await cms.savePost(basePost({ slug: "how-to-watch-iptv-on-firestick-v2" }));
      await cms.saveSeoPlanningDraft(baseDraft());
      const result = await cms.handoffSeoPlanningToBlog("seoplan_handoff_1");
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.postId, "post-firestick");
      assert.equal((await cms.listPosts()).length, 1);
      assert.equal((await cms.getPostById("post-firestick"))?.slug, "how-to-watch-iptv-on-firestick-v2");
    });
  });

  test("NEW_BLOG creates one private draft and reopens on second handoff", async () => {
    await withTempCatalog("flix-handoff-new-", async (cms) => {
      const planning = baseDraft({
        id: "seoplan_new_1",
        recommendation: "NEW_BLOG",
        fingerprint: "NEW_BLOG:wifi-quality",
        topic: "Wi-Fi quality",
        workingTitle: "Home Wi-Fi quality for streaming",
        proposedSlug: "home-wifi-quality-streaming",
        targetPostId: null,
        matchedPublicUrl: "",
        linkedPostId: null,
      });
      await cms.saveSeoPlanningDraft(planning);

      const first = await cms.handoffSeoPlanningToBlog(planning.id);
      assert.equal(first.ok, true);
      if (!first.ok) return;
      assert.equal(first.created, true);
      assert.equal(first.recommendation, "NEW_BLOG");
      assert.match(first.editorPath, /^\/sidhu\/blog\/post_/);

      const linked = await cms.getSeoPlanningDraftById(planning.id);
      assert.equal(linked?.linkedPostId, first.postId);
      assert.equal(linked?.workflowStatus, "CONTENT_NEEDED");

      const post = await cms.getPostById(first.postId);
      assert.ok(post);
      assert.equal(post?.status, "draft");
      assert.equal(post?.content, "<p></p>");
      assert.equal(post?.title, "Home Wi-Fi quality for streaming");
      assert.equal(post?.slug, "home-wifi-quality-streaming");
      assert.equal(post?.publishedAt, null);
      assert.equal(post?.featuredImage, null);
      assert.equal(post?.ogImage, null);

      const second = await cms.handoffSeoPlanningToBlog(planning.id);
      assert.equal(second.ok, true);
      if (!second.ok) return;
      assert.equal(second.created, false);
      assert.equal(second.postId, first.postId);
      assert.equal((await cms.listPosts()).length, 1);
    });
  });

  test("NEW_BLOG concurrent handoffs create only one BlogPost", async () => {
    await withTempCatalog("flix-handoff-race-", async (cms) => {
      const planning = baseDraft({
        id: "seoplan_race",
        recommendation: "NEW_BLOG",
        fingerprint: "NEW_BLOG:race",
        workingTitle: "Race safe draft",
        proposedSlug: "race-safe-draft",
        targetPostId: null,
        matchedPublicUrl: "",
        linkedPostId: null,
      });
      await cms.saveSeoPlanningDraft(planning);

      const [a, b] = await Promise.all([
        cms.handoffSeoPlanningToBlog(planning.id),
        cms.handoffSeoPlanningToBlog(planning.id),
      ]);
      assert.equal(a.ok, true);
      assert.equal(b.ok, true);
      if (!a.ok || !b.ok) return;
      assert.equal(a.postId, b.postId);
      assert.equal((await cms.listPosts()).length, 1);
      const stored = await cms.getSeoPlanningDraftById(planning.id);
      assert.equal(stored?.linkedPostId, a.postId);
      assert.equal([a.created, b.created].filter(Boolean).length, 1);
    });
  });

  test("NEW_BLOG slug conflict creates nothing and links nothing", async () => {
    await withTempCatalog("flix-handoff-slug-", async (cms) => {
      await cms.savePost(
        basePost({
          id: "post_other",
          slug: "taken-slug",
          title: "Other",
          status: "draft",
          publishedAt: null,
          featuredImage: null,
          ogImage: null,
        }),
      );
      const planning = baseDraft({
        id: "seoplan_slug",
        recommendation: "NEW_BLOG",
        fingerprint: "NEW_BLOG:taken-slug",
        workingTitle: "Taken slug article",
        proposedSlug: "taken-slug",
        targetPostId: null,
        matchedPublicUrl: "",
        linkedPostId: null,
      });
      await cms.saveSeoPlanningDraft(planning);

      const result = await cms.handoffSeoPlanningToBlog(planning.id);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, "slug_conflict");
        assert.equal(result.error, SEO_PLANNING_HANDOFF_SLUG_CONFLICT_MESSAGE);
      }
      const stored = await cms.getSeoPlanningDraftById(planning.id);
      assert.equal(stored?.linkedPostId, null);
      assert.equal((await cms.listPosts()).length, 1);
    });
  });

  test("NEW_BLOG missing linked BlogPost fails safely", async () => {
    await withTempCatalog("flix-handoff-linked-missing-", async (cms) => {
      const planning = baseDraft({
        id: "seoplan_orphan_link",
        recommendation: "NEW_BLOG",
        fingerprint: "NEW_BLOG:orphan-link",
        workingTitle: "Orphan link plan",
        proposedSlug: "orphan-link-plan",
        targetPostId: null,
        matchedPublicUrl: "",
        linkedPostId: "post_deleted_elsewhere",
      });
      await cms.saveSeoPlanningDraft(planning);
      const result = await cms.handoffSeoPlanningToBlog(planning.id);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, "linked_post_missing");
        assert.equal(result.error, SEO_PLANNING_HANDOFF_LINKED_POST_MISSING_MESSAGE);
      }
      assert.equal((await cms.listPosts()).length, 0);
    });
  });

  test("NEW_BLOG handoff-vs-Archive: archived Planning cannot receive linkedPostId", async () => {
    await withTempCatalog("flix-handoff-archive-race-", async (cms) => {
      const planning = baseDraft({
        id: "seoplan_archive_race",
        recommendation: "NEW_BLOG",
        fingerprint: "NEW_BLOG:archive-race",
        workingTitle: "Archive race plan",
        proposedSlug: "archive-race-plan",
        targetPostId: null,
        matchedPublicUrl: "",
        linkedPostId: null,
      });
      await cms.saveSeoPlanningDraft(planning);

      const archived = await cms.archiveSeoPlanningDraft(planning.id);
      assert.equal(archived.ok, true);
      const handoff = await cms.handoffSeoPlanningToBlog(planning.id);
      assert.equal(handoff.ok, false);
      if (!handoff.ok) assert.equal(handoff.code, "planning_archived");

      const stored = await cms.getSeoPlanningDraftById(planning.id);
      assert.equal(stored?.linkedPostId, null);
      assert.ok(stored?.archivedAt);
      assert.equal((await cms.listPosts()).length, 0);

      await cms.restoreSeoPlanningDraft(planning.id);
      const created = await cms.handoffSeoPlanningToBlog(planning.id);
      assert.equal(created.ok, true);
      if (!created.ok) return;
      await cms.archiveSeoPlanningDraft(planning.id);
      const again = await cms.handoffSeoPlanningToBlog(planning.id);
      assert.equal(again.ok, false);
      if (!again.ok) assert.equal(again.code, "planning_archived");
      assert.equal((await cms.listPosts()).length, 1);
    });
  });

  test("missing Planning draft fails", async () => {
    await withTempCatalog("flix-handoff-missing-", async (cms) => {
      const result = await cms.handoffSeoPlanningToBlog("seoplan_does_not_exist");
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, "planning_not_found");
        assert.equal(result.error, SEO_PLANNING_MISSING_DRAFT_MESSAGE);
      }
    });
  });
});

test("source wiring: action dual-auth + no provider paths + UI labels", () => {
  const actions = readFileSync(path.join(REPO_ROOT, "lib", "cms", "seo-planning-actions.ts"), "utf8");
  const handoffStart = actions.indexOf("export async function handoffSeoPlanningToBlogAction");
  assert.ok(handoffStart >= 0);
  const nextExport = actions.indexOf("\nexport ", handoffStart + 1);
  const handoffFn = actions.slice(handoffStart, nextExport === -1 ? undefined : nextExport);
  assert.match(handoffFn, /requireAdminActor\("seo"\)/);
  assert.match(handoffFn, /adminHasPermission\(actor\.user, "blog"\)/);
  assert.match(handoffFn, /cms\.handoffSeoPlanningToBlog/);
  assert.doesNotMatch(handoffFn, /generateChatgpt|requestGemini|requestOpenAi|gsc/i);

  const ui = readFileSync(path.join(REPO_ROOT, "components", "sidhu", "SeoPlanningContentHandoff.tsx"), "utf8");
  assert.match(ui, /Open in Blog Editor/);
  assert.match(ui, /Create Blog Draft/);
  assert.match(ui, /Open Blog Draft/);
  assert.match(ui, /handoffSeoPlanningToBlogAction/);

  const mysql = readFileSync(path.join(REPO_ROOT, "lib", "cms", "mysql-catalog.ts"), "utf8");
  assert.match(mysql, /handoffSeoPlanningToBlog/);
  assert.match(mysql, /FOR UPDATE/);
  assert.match(mysql, /linked_post_id/);

  const json = readFileSync(path.join(REPO_ROOT, "lib", "cms", "json-catalog.ts"), "utf8");
  assert.match(json, /handoffSeoPlanningToBlog/);
  assert.match(json, /withSeoPlanningJsonWriteLock/);
  assert.match(json, /withBlogContentJsonWriteLock/);
});
