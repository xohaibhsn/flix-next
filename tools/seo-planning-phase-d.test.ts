/**
 * Phase D1 — derived writing brief, refresh snapshot, canonical prompt input.
 * No provider calls. No CMS writes.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { blogPostPath } from "../lib/cms/blog-paths";
import {
  ARTICLE_SNAPSHOT_CAPS,
  buildArticleSnapshot,
} from "../lib/cms/seo-planning/article-snapshot";
import { classifyRefreshArticle } from "../lib/cms/seo-planning/refresh-target";
import {
  SEO_PLANNING_WRITING_PROMPT_DIRTY_MESSAGE,
  WRITING_BRIEF_GSC_SIGNAL_CAP,
  WRITING_BRIEF_SOURCE_CAP,
  WRITING_PROMPT_INPUT_MAX,
  buildWritingBrief,
  buildWritingPromptInput,
  type WritingArticleContext,
} from "../lib/cms/seo-planning/writing-brief";
import { fingerprintWritingBrief } from "../lib/cms/seo-planning/writing-fingerprint";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import type { SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_d1",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:demo",
    topic: "Approved topic",
    workingTitle: "Approved title",
    proposedSlug: "approved-topic",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "TROUBLESHOOTING",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T01:00:00.000Z",
    payload: {
      opportunity: {
        topic: "Frozen topic",
        workingTitle: "Frozen title",
        searchIntent: "INFORMATIONAL",
        suggestedAngle: "Frozen angle",
        nextStep: "Frozen next step",
        whyNow: "Readers are asking now.",
        webEvidence: "A support page describes the check.",
        existingCoverage: "PARTIAL",
        confidence: "HIGH",
        matchedTitle: "Existing guide",
        gscEvidence: [],
      },
      workspace: {
        contentAngle: "Approved angle",
        nextStep: "Approved next step",
        humanNotes: "Approved notes",
        suggestions: {
          topic: { originalValue: "Candidate topic", value: "Candidate topic", status: "PENDING" },
        },
      },
      sources: [],
    },
    ...overrides,
  };
}

function withPayload(base: SeoPlanningDraft, patch: Record<string, unknown>) {
  return draft({
    ...base,
    payload: { ...(base.payload as Record<string, unknown>), ...patch },
  });
}

const readyArticle: WritingArticleContext = {
  status: "ready",
  snapshot: buildArticleSnapshot({
    title: "How to Watch IPTV on Firestick: Complete Setup Guide",
    excerpt: "A setup walkthrough.",
    publicPath: "/blogs/how-to-watch-iptv-on-firestick/",
    categoryName: "Setup",
    focusKeyword: "firestick iptv",
    featuredImagePresent: true,
    html: "<h2>Check the network</h2><p>Restart the stick.</p><ul><li>Test Wi-Fi</li></ul>",
  }),
};

test("writing brief uses approved planning values, not frozen opportunity or suggestions", () => {
  const brief = buildWritingBrief(draft());
  assert.equal(brief.topic, "Approved topic");
  assert.equal(brief.workingTitle, "Approved title");
  assert.equal(brief.searchIntent, "TROUBLESHOOTING");
  assert.equal(brief.contentAngle, "Approved angle");
  assert.equal(brief.nextStep, "Approved next step");
  assert.equal(brief.humanNotes, "Approved notes");
  assert.equal(brief.whyNow, "Readers are asking now.");
  assert.notEqual(brief.topic, "Frozen topic");
  assert.notEqual(brief.workingTitle, "Frozen title");
  assert.notEqual(brief.contentAngle, "Frozen angle");
  assert.doesNotMatch(buildWritingPromptInput(brief), /Candidate topic|Frozen topic|Frozen angle/);
});

test("new blog brief has no article snapshot and is eligible only in Content Needed", () => {
  const brief = buildWritingBrief(draft());
  assert.equal(brief.taskType, "NEW_BLOG");
  assert.equal(brief.taskLabel, "New blog");
  assert.equal(brief.existingArticle, null);
  assert.equal(brief.providerEligible, true);
  const planning = buildWritingBrief(draft({ workflowStatus: "PLANNING" }));
  assert.equal(planning.providerEligible, false);
  assert.match(planning.providerIneligibleReason, /Content Needed/);
});

test("refresh brief includes the snapshot and refuses a missing or mismatched target", () => {
  const row = draft({
    recommendation: "REFRESH_EXISTING",
    targetPostId: "post_1",
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
  });
  const ready = buildWritingBrief(row, readyArticle);
  assert.equal(ready.providerEligible, true);
  assert.equal(ready.existingArticle?.title.includes("Firestick"), true);
  const input = buildWritingPromptInput(ready);
  assert.match(input, /Preserve the existing public URL/);
  assert.match(input, /Do not create a duplicate page, article, or slug/);
  assert.match(input, /Check the network/);
  assert.match(input, /Test Wi-Fi/);

  const missing = buildWritingBrief(row, { status: "missing" });
  assert.equal(missing.providerEligible, false);
  assert.match(missing.providerIneligibleReason, /could not be found/);
  assert.equal(missing.existingArticle, null);

  const mismatch = buildWritingBrief(row, { status: "mismatch" });
  assert.equal(mismatch.providerEligible, false);
  assert.match(mismatch.providerIneligibleReason, /does not match/);
  assert.equal(mismatch.existingArticle, null);
});

test("refresh target classification uses canonical blog paths", () => {
  const slug = "how-to-watch-iptv-on-firestick";
  const post = { id: "post_1", slug };
  assert.equal(
    classifyRefreshArticle({
      targetPostId: "post_1",
      matchedPublicUrl: blogPostPath(slug),
      post,
    }),
    "ready",
  );
  assert.equal(
    classifyRefreshArticle({
      targetPostId: "post_1",
      matchedPublicUrl: "/blogs/another-article/",
      post,
    }),
    "mismatch",
  );
  assert.equal(
    classifyRefreshArticle({
      targetPostId: null,
      matchedPublicUrl: blogPostPath(slug),
      post: null,
    }),
    "missing",
  );
  assert.equal(
    classifyRefreshArticle({
      targetPostId: "post_1",
      matchedPublicUrl: blogPostPath(slug),
      post: null,
    }),
    "missing",
  );
});

test("restore brief names the historical path and does not claim an archived body", () => {
  const brief = buildWritingBrief(
    draft({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: "/how-to-fix-buffering-issues-on-iptv/",
      workflowStatus: "CONTENT_NEEDED",
    }),
  );
  assert.equal(brief.taskType, "RESTORE_HISTORICAL");
  assert.equal(brief.restorePath, "/how-to-fix-buffering-issues-on-iptv/");
  assert.equal(brief.archivedBodyAvailable, false);
  assert.equal(brief.providerEligible, true);
  const input = buildWritingPromptInput(brief);
  assert.match(input, /No archived article body is available/);
  assert.match(input, /Do not restore or publish/);
  assert.doesNotMatch(input, /saveRedirect|savePost/);
});

test("internal-link plans are not eligible for a full writing prompt", () => {
  const brief = buildWritingBrief(
    draft({
      recommendation: "INTERNAL_LINK_ONLY",
      workflowStatus: "CONTENT_NEEDED",
      matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
    }),
  );
  assert.equal(brief.taskLabel, "Internal link");
  assert.equal(brief.providerEligible, false);
  assert.match(brief.providerIneligibleReason, /internal-link/i);
  assert.match(buildWritingPromptInput(brief), /not a full blog article prompt/);
});

test("article snapshot keeps reading structure and drops active content", () => {
  const snapshot = buildArticleSnapshot({
    title: "T".repeat(200),
    excerpt: "E".repeat(500),
    publicPath: `/${"p".repeat(400)}/`,
    categoryName: "C".repeat(100),
    focusKeyword: "K".repeat(100),
    featuredImagePresent: false,
    html: [
      "<h2 id=\"secret\" class=\"x\">Network check</h2>",
      "<p>Restart the player.</p>",
      "<ol><li>Open settings</li><li>Forget the network</li></ol>",
      "<script>SECRET_SCRIPT</script>",
      "<style>SECRET_STYLE</style>",
      "<iframe src=\"https://evil.example/frame\">SECRET_FRAME</iframe>",
      "<img src=\"https://res.cloudinary.com/demo/image/upload/secret.jpg\" alt=\"SECRET_ALT\">",
      "<svg><text>SECRET_SVG</text></svg>",
      "<p>Visible after dropped blocks.</p>",
    ].join(""),
  });
  assert.equal(snapshot.title.length, ARTICLE_SNAPSHOT_CAPS.title);
  assert.equal(snapshot.excerpt.length, ARTICLE_SNAPSHOT_CAPS.excerpt);
  assert.equal(snapshot.publicPath.length, ARTICLE_SNAPSHOT_CAPS.publicPath);
  assert.equal(snapshot.categoryName.length, ARTICLE_SNAPSHOT_CAPS.categoryName);
  assert.equal(snapshot.focusKeyword.length, ARTICLE_SNAPSHOT_CAPS.focusKeyword);
  assert.equal(snapshot.featuredImage, "absent");
  assert.match(snapshot.body, /Network check/);
  assert.match(snapshot.body, /Restart the player/);
  assert.match(snapshot.body, /Open settings/);
  assert.match(snapshot.body, /Forget the network/);
  assert.equal(snapshot.body.includes("<"), false);
  assert.doesNotMatch(snapshot.body, /SECRET_SCRIPT|SECRET_STYLE|SECRET_FRAME|SECRET_ALT|SECRET_SVG|cloudinary|id="secret"/);
  assert.ok(snapshot.body.length <= ARTICLE_SNAPSHOT_CAPS.body);
});

test("article snapshot caps body, in-snapshot headings, and leftover headings", () => {
  const headings = Array.from({ length: 40 }, (_, index) => `<h2>Heading ${index + 1}</h2><p>Section ${index + 1}</p>`);
  const many = buildArticleSnapshot({
    title: "Title",
    excerpt: "Excerpt",
    publicPath: "/blogs/example/",
    categoryName: "Setup",
    focusKeyword: "",
    featuredImagePresent: true,
    html: headings.join(""),
  });
  assert.ok(many.body.length <= 6000);
  assert.ok(many.headingCount <= 20);
  assert.ok(many.leftoverHeadings.length <= 12);
  assert.ok(many.leftoverHeadings.every((label) => label.length <= 80));
  assert.match(many.body, /Heading 1/);
  assert.equal(many.body.includes("Heading 40"), false);

  const huge = buildArticleSnapshot({
    title: "Title",
    excerpt: "",
    publicPath: "/blogs/example/",
    categoryName: "",
    focusKeyword: "",
    featuredImagePresent: false,
    html: `<p>${"word ".repeat(4000)}</p>`,
  });
  assert.ok(huge.body.length <= 6000);
  assert.equal(huge.featuredImage, "absent");
});

test("sources and GSC signals stay bounded and omit auth material", () => {
  const sources = Array.from({ length: 10 }, (_, index) => ({
    title: `Source ${index} ${"t".repeat(200)}`,
    domain: `example${index}.com ${"d".repeat(100)}`,
    url: `https://example${index}.com/${"u".repeat(400)}`,
  }));
  const evidence = Array.from({ length: 6 }, (_, index) => ({
    id: `Q${index}`,
    kind: "query",
    query: `query ${index}`,
    clicks: 99,
    impressions: 1000,
    ctr: 0.5,
    position: 3.2,
    clicksDirection: "UP",
    private_key: "BEGIN-PRIVATE-KEY-MATERIAL",
    client_email: "svc@project.iam.gserviceaccount.com",
    access_token: "ya29-secret",
  }));
  const row = withPayload(draft(), {
    sources,
    gsc: {
      status: "AVAILABLE",
      private_key: "BEGIN-PRIVATE-KEY-MATERIAL",
      client_email: "svc@project.iam.gserviceaccount.com",
    },
    opportunity: {
      ...(draft().payload as { opportunity: Record<string, unknown> }).opportunity,
      gscEvidence: evidence,
    },
  });
  const brief = buildWritingBrief(row);
  assert.ok(brief.sources.length <= WRITING_BRIEF_SOURCE_CAP);
  assert.equal(brief.sources.length, 8);
  assert.ok(brief.sources.every((source) => source.title.length <= 120));
  assert.ok(brief.sources.every((source) => source.domain.length <= 80));
  assert.ok(brief.sources.every((source) => source.url.length <= 300));
  assert.ok(brief.selectedGscSignals.length <= WRITING_BRIEF_GSC_SIGNAL_CAP);
  assert.equal(brief.selectedGscSignals.length, 3);
  assert.match(brief.selectedGscSignals[0] || "", /clicks up/);
  const input = buildWritingPromptInput(brief);
  assert.doesNotMatch(input, /BEGIN-PRIVATE-KEY-MATERIAL|gserviceaccount|ya29-secret|impressions: 1000/);
  assert.doesNotMatch(read("lib/cms/seo-planning/writing-brief.ts"), /fetch\(|googleapis/);
  assert.doesNotMatch(read("lib/cms/seo-planning/article-snapshot.ts"), /fetch\(/);
});

test("canonical prompt input is deterministic, bounded, and instructs a ChatGPT prompt", () => {
  const brief = buildWritingBrief(draft(), readyArticle);
  const first = buildWritingPromptInput(brief);
  const second = buildWritingPromptInput(brief);
  assert.equal(first, second);
  assert.match(first, /prompt for ChatGPT/);
  assert.match(first, /DO NOT write the article yourself/);
  assert.match(first, /CMS-ready article HTML/);
  assert.match(first, /not publish anything/);
  assert.ok(first.length <= WRITING_PROMPT_INPUT_MAX);

  const heavy = buildWritingBrief(
    withPayload(
      draft({
        recommendation: "REFRESH_EXISTING",
        targetPostId: "post_1",
        matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      }),
      {
        workspace: {
          contentAngle: "A".repeat(280),
          nextStep: "N".repeat(220),
          humanNotes: "H".repeat(4000),
        },
        sources: Array.from({ length: 8 }, () => ({
          title: "T".repeat(120),
          domain: "D".repeat(80),
          url: `https://example.com/${"u".repeat(260)}`,
        })),
        opportunity: {
          whyNow: "W".repeat(280),
          webEvidence: "E".repeat(360),
          existingCoverage: "PARTIAL",
          confidence: "HIGH",
          matchedTitle: "M".repeat(160),
          gscEvidence: [],
        },
      },
    ),
    {
      status: "ready",
      snapshot: buildArticleSnapshot({
        title: "Title",
        excerpt: "Excerpt",
        publicPath: "/blogs/example/",
        categoryName: "Setup",
        focusKeyword: "keyword",
        featuredImagePresent: false,
        html: `<p>${"paragraph ".repeat(2000)}</p>${Array.from({ length: 30 }, (_, index) => `<h2>Later ${index}</h2>`).join("")}`,
      }),
    },
  );
  const heavyInput = buildWritingPromptInput(heavy);
  assert.ok(heavyInput.length <= WRITING_PROMPT_INPUT_MAX);
  assert.ok(heavyInput.startsWith("Writing brief spec:"));
  assert.match(heavyInput, /DO NOT write the article yourself/);
  assert.match(heavyInput, /avoid invented prices or product claims/);
});

test("fingerprint follows canonical inputs and ignores suggestion status and updatedAt", () => {
  const base = draft();
  const brief = buildWritingBrief(base);
  const same = fingerprintWritingBrief(brief);
  assert.equal(
    same,
    createHash("sha256").update(buildWritingPromptInput(brief), "utf8").digest("hex"),
  );
  assert.equal(fingerprintWritingBrief(buildWritingBrief(draft({ updatedAt: "2026-10-07T00:00:00.000Z" }))), same);
  const otherSuggestions = withPayload(base, {
    workspace: {
      contentAngle: "Approved angle",
      nextStep: "Approved next step",
      humanNotes: "Approved notes",
      suggestions: {
        topic: { originalValue: "Other", value: "Other", status: "APPLIED" },
      },
    },
  });
  assert.equal(fingerprintWritingBrief(buildWritingBrief(otherSuggestions)), same);

  const topicChanged = fingerprintWritingBrief(buildWritingBrief(draft({ topic: "Different topic" })));
  assert.notEqual(topicChanged, same);
  const notesChanged = fingerprintWritingBrief(
    buildWritingBrief(
      withPayload(base, {
        workspace: {
          contentAngle: "Approved angle",
          nextStep: "Approved next step",
          humanNotes: "Different notes",
        },
      }),
    ),
  );
  assert.notEqual(notesChanged, same);
  const angleChanged = fingerprintWritingBrief(
    buildWritingBrief(
      withPayload(base, {
        workspace: {
          contentAngle: "Different angle",
          nextStep: "Approved next step",
          humanNotes: "Approved notes",
        },
      }),
    ),
  );
  assert.notEqual(angleChanged, same);

  const refresh = draft({
    recommendation: "REFRESH_EXISTING",
    targetPostId: "post_1",
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
  });
  const withArticle = fingerprintWritingBrief(buildWritingBrief(refresh, readyArticle));
  const otherSnapshot = buildArticleSnapshot({
    title: readyArticle.status === "ready" ? readyArticle.snapshot.title : "",
    excerpt: "A setup walkthrough.",
    publicPath: "/blogs/how-to-watch-iptv-on-firestick/",
    categoryName: "Setup",
    focusKeyword: "firestick iptv",
    featuredImagePresent: true,
    html: "<h2>Different section</h2><p>Different body.</p>",
  });
  const changedArticle = fingerprintWritingBrief(
    buildWritingBrief(refresh, { status: "ready", snapshot: otherSnapshot }),
  );
  assert.notEqual(withArticle, changedArticle);
  assert.equal(/^[a-f0-9]{64}$/.test(same), true);
});

test("writing prompt eligibility follows workflow and recommendation", () => {
  for (const workflowStatus of ["PLANNING", "IMAGE_NEEDED", "SEO_REVIEW", "READY_TO_PUBLISH"] as const) {
    const brief = buildWritingBrief(draft({ workflowStatus }));
    assert.equal(brief.providerEligible, false, workflowStatus);
  }
  assert.equal(buildWritingBrief(draft({ workflowStatus: "CONTENT_NEEDED" })).providerEligible, true);
  assert.equal(
    buildWritingBrief(draft({ recommendation: "INTERNAL_LINK_ONLY", workflowStatus: "CONTENT_NEEDED" }))
      .providerEligible,
    false,
  );
  assert.equal(
    buildWritingBrief(
      draft({ recommendation: "REFRESH_EXISTING", workflowStatus: "CONTENT_NEEDED", targetPostId: "post_1" }),
      readyArticle,
    ).providerEligible,
    true,
  );
});

test("phase D1 source stays off the network and off CMS writes", () => {
  const files = [
    "lib/cms/seo-planning/writing-brief.ts",
    "lib/cms/seo-planning/article-snapshot.ts",
    "lib/cms/seo-planning/refresh-target.ts",
    "lib/cms/seo-planning/writing-fingerprint.ts",
    "components/sidhu/SeoPlanningWritingBrief.tsx",
    "components/sidhu/SeoPlanningDetail.tsx",
    "app/sidhu/(protected)/seo/planning/[id]/page.tsx",
  ].map(read);
  const joined = files.join("\n");
  assert.doesNotMatch(joined, /api\.openai|generativelanguage|GEMINI_API_KEY|OPENAI_API_KEY|OPENAI_BLOG_PROMPT_MODEL|GEMINI_BLOG_PROMPT_MODEL/);
  assert.doesNotMatch(joined, /savePost\(|saveRedirect\(|saveSeoPlanningDraft\(|revalidatePath\(/);
  assert.doesNotMatch(read("lib/cms/seo-planning/writing-brief.ts"), /fetch\(|from "node:crypto"|server-only|sha256Hex|0x428a2f98/);
  assert.doesNotMatch(read("lib/cms/seo-planning/article-snapshot.ts"), /from "@\/lib\/cms\/repository"|server-only/);
  assert.match(read("lib/cms/seo-planning/writing-fingerprint.ts"), /import "server-only"/);
  assert.match(read("lib/cms/seo-planning/writing-fingerprint.ts"), /createHash\("sha256"\)/);
  assert.doesNotMatch(
    read("components/sidhu/SeoPlanningWritingBrief.tsx"),
    /from "@\/lib\/cms\/repository"|server-only|article-snapshot|refresh-target|writing-fingerprint/,
  );
  assert.doesNotMatch(
    read("components/sidhu/SeoPlanningDetail.tsx"),
    /writing-fingerprint|from "node:crypto"|server-only/,
  );
  assert.match(read("lib/cms/seo-planning/index.ts"), /writing-brief|article-snapshot|writing-fingerprint/);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 3);
  assert.doesNotMatch(read("lib/db/schema.ts"), /CURRENT_CMS_SCHEMA_VERSION\s*=\s*4/);
});

test("writing brief UI is read-only and has no provider buttons", () => {
  const ui = read("components/sidhu/SeoPlanningWritingBrief.tsx");
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  assert.match(ui, /Writing Brief/);
  assert.match(ui, /Not set/);
  assert.match(ui, /None/);
  assert.match(ui, /Current article snapshot/);
  assert.doesNotMatch(ui, /<button|Generate with|Regenerate|targetPostId|dangerouslySetInnerHTML/);
  assert.match(detail, /<SeoPlanningWritingBrief/);
  assert.match(detail, /dirty=\{dirty\}/);
  assert.match(detail, /SEO_PLANNING_WRITING_PROMPT_DIRTY_MESSAGE/);
  assert.equal(
    SEO_PLANNING_WRITING_PROMPT_DIRTY_MESSAGE,
    "Save your planning changes before generating a prompt.",
  );
  // D2: Generate lives in SeoPlanningWritingPrompt, not the Writing Brief card.
  assert.match(detail, /SeoPlanningWritingPrompt/);
  assert.doesNotMatch(detail, /Generate with Gemini/);
  assert.doesNotMatch(detail, /Generate with OpenAI/);
  const promptUi = read("components/sidhu/SeoPlanningWritingPrompt.tsx");
  assert.match(promptUi, /Generate with Gemini/);
  assert.doesNotMatch(promptUi, /Generate with OpenAI/);
});
