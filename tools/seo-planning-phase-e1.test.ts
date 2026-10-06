/**
 * Phase E1 — derived Image Brief, fingerprint, read-only UI.
 * No provider calls. No media / BlogPost writes.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { buildArticleSnapshot } from "../lib/cms/seo-planning/article-snapshot";
import {
  SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE,
  SEO_PLANNING_IMAGE_BRIEF_SPEC,
  buildImageBrief,
  buildImagePromptInput,
} from "../lib/cms/seo-planning/image-brief";
import { fingerprintImageBrief } from "../lib/cms/seo-planning/image-fingerprint";
import type { WritingArticleContext } from "../lib/cms/seo-planning/writing-brief";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import type { SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_e1",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:demo",
    topic: "Firestick buffering and playback troubleshooting",
    workingTitle: "Firestick IPTV Buffering: A Step-by-Step Wi-Fi and Playback Check",
    proposedSlug: "firestick-buffering",
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
        contentAngle:
          "Focus the refresh on a practical Wi-Fi, network, and playback troubleshooting checklist for Firestick users.",
        nextStep: "Approved next step",
        humanNotes: "Approved notes",
        suggestions: {
          topic: { originalValue: "Candidate topic", value: "Candidate topic", status: "PENDING" },
        },
      },
      sources: [],
      writingPrompts: {
        gemini: {
          chatgptPrompt: "Gemini writing prompt text",
          writingFingerprint: "a".repeat(64),
          model: "gemini-test",
          generatedAt: "2026-10-06T12:00:00.000Z",
          briefSpec: "d1-1",
        },
      },
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

const readyFeaturedPresent: WritingArticleContext = {
  status: "ready",
  snapshot: buildArticleSnapshot({
    title: "How to Watch IPTV on Firestick: Complete Setup Guide",
    excerpt: "A setup walkthrough.",
    publicPath: "/blogs/how-to-watch-iptv-on-firestick/",
    categoryName: "Setup",
    focusKeyword: "firestick iptv",
    featuredImagePresent: true,
    html: "<h2>Check the network</h2><p>Restart the stick.</p>",
  }),
};

const readyFeaturedAbsent: WritingArticleContext = {
  status: "ready",
  snapshot: buildArticleSnapshot({
    title: "How to Watch IPTV on Firestick: Complete Setup Guide",
    excerpt: "A setup walkthrough.",
    publicPath: "/blogs/how-to-watch-iptv-on-firestick/",
    categoryName: "Setup",
    focusKeyword: "firestick iptv",
    featuredImagePresent: false,
    html: "<h2>Check the network</h2><p>Restart the stick.</p>",
  }),
};

test("DERIVATION: NEW_BLOG create_new; preview ineligible in CONTENT_NEEDED", () => {
  const brief = buildImageBrief(draft());
  assert.equal(brief.spec, SEO_PLANNING_IMAGE_BRIEF_SPEC);
  assert.equal(brief.taskType, "NEW_BLOG");
  assert.equal(brief.existingFeaturedImage, "n/a");
  assert.equal(brief.existingFeaturedDisposition, "create_new");
  assert.equal(brief.imagePurpose, "FEATURED_BLOG_IMAGE");
  assert.equal(brief.recommendedAspectRatio, "16:9");
  assert.equal(brief.recommendedSourceSize, "1280x720");
  assert.equal(brief.textInImagePolicy, "NO_BAKED_TITLE_TEXT");
  assert.equal(brief.providerEligible, false);
  assert.match(brief.providerIneligibleReason, /Image Needed/i);
  assert.doesNotMatch(brief.visualSubject, /Frozen topic/);
  assert.match(brief.visualConcept, /editorial|without fake app UI/i);
});

test("DERIVATION: REFRESH featured present → review_existing", () => {
  const brief = buildImageBrief(
    draft({
      recommendation: "REFRESH_EXISTING",
      matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      targetPostId: "post_1",
      workflowStatus: "IMAGE_NEEDED",
    }),
    readyFeaturedPresent,
  );
  assert.equal(brief.existingFeaturedImage, "present");
  assert.equal(brief.existingFeaturedDisposition, "review_existing");
  assert.equal(brief.articleTitle, "How to Watch IPTV on Firestick: Complete Setup Guide");
  assert.equal(brief.articleCategory, "Setup");
  assert.equal(brief.providerEligible, true);
  assert.equal(brief.providerIneligibleReason, "");
});

test("DERIVATION: REFRESH featured absent → missing_needs_image", () => {
  const brief = buildImageBrief(
    draft({
      recommendation: "REFRESH_EXISTING",
      matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      targetPostId: "post_1",
      workflowStatus: "IMAGE_NEEDED",
    }),
    readyFeaturedAbsent,
  );
  assert.equal(brief.existingFeaturedImage, "absent");
  assert.equal(brief.existingFeaturedDisposition, "missing_needs_image");
  assert.equal(brief.providerEligible, true);
});

test("DERIVATION: REFRESH missing/mismatch ineligible", () => {
  const missing = buildImageBrief(
    draft({
      recommendation: "REFRESH_EXISTING",
      matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      workflowStatus: "IMAGE_NEEDED",
    }),
    { status: "missing" },
  );
  assert.equal(missing.providerEligible, false);
  assert.match(missing.providerIneligibleReason, /could not be found/i);

  const mismatch = buildImageBrief(
    draft({
      recommendation: "REFRESH_EXISTING",
      matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      workflowStatus: "IMAGE_NEEDED",
    }),
    { status: "mismatch" },
  );
  assert.equal(mismatch.providerEligible, false);
  assert.match(mismatch.providerIneligibleReason, /does not match/i);
});

test("DERIVATION: RESTORE create_new; no archived invention", () => {
  const brief = buildImageBrief(
    draft({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: "/blogs/old-guide/",
      workflowStatus: "IMAGE_NEEDED",
    }),
  );
  assert.equal(brief.taskType, "RESTORE_HISTORICAL");
  assert.equal(brief.existingFeaturedDisposition, "create_new");
  assert.equal(brief.restorePath, "/blogs/old-guide/");
  assert.equal(brief.articleTitle, "");
  assert.equal(brief.providerEligible, true);
  assert.doesNotMatch(buildImagePromptInput(brief), /archived body|historical image available/i);
});

test("DERIVATION: INTERNAL_LINK_ONLY always ineligible", () => {
  const brief = buildImageBrief(
    draft({
      recommendation: "INTERNAL_LINK_ONLY",
      matchedPublicUrl: "/blogs/setup/",
      workflowStatus: "IMAGE_NEEDED",
    }),
  );
  assert.equal(brief.existingFeaturedDisposition, "none_needed_internal_link");
  assert.equal(brief.providerEligible, false);
  assert.match(brief.providerIneligibleReason, /Internal-link/i);
});

test("ELIGIBILITY: CONTENT_NEEDED preview; IMAGE_NEEDED eligible for content tasks", () => {
  const preview = buildImageBrief(draft({ workflowStatus: "CONTENT_NEEDED" }));
  assert.equal(preview.providerEligible, false);

  const ready = buildImageBrief(draft({ workflowStatus: "IMAGE_NEEDED" }));
  assert.equal(ready.providerEligible, true);

  const back = buildImageBrief(draft({ workflowStatus: "CONTENT_NEEDED" }));
  assert.equal(back.providerEligible, false);
});

test("FINGERPRINT: deterministic; relevant changes move hash; noise does not", () => {
  const base = buildImageBrief(draft({ workflowStatus: "IMAGE_NEEDED" }));
  const a = fingerprintImageBrief(base);
  const b = fingerprintImageBrief(buildImageBrief(draft({ workflowStatus: "IMAGE_NEEDED" })));
  assert.equal(a, b);
  assert.equal(a, createHash("sha256").update(buildImagePromptInput(base), "utf8").digest("hex"));
  assert.equal(a.length, 64);

  const topicChanged = fingerprintImageBrief(
    buildImageBrief(draft({ workflowStatus: "IMAGE_NEEDED", topic: "Different topic" })),
  );
  assert.notEqual(a, topicChanged);

  const angleChanged = fingerprintImageBrief(
    buildImageBrief(
      withPayload(draft({ workflowStatus: "IMAGE_NEEDED" }), {
        workspace: {
          contentAngle: "Different angle entirely",
          nextStep: "Approved next step",
          humanNotes: "Approved notes",
          suggestions: {
            topic: { originalValue: "Candidate topic", value: "Candidate topic", status: "PENDING" },
          },
        },
      }),
    ),
  );
  assert.notEqual(a, angleChanged);

  const refreshPresent = fingerprintImageBrief(
    buildImageBrief(
      draft({
        recommendation: "REFRESH_EXISTING",
        matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
        targetPostId: "post_1",
        workflowStatus: "IMAGE_NEEDED",
      }),
      readyFeaturedPresent,
    ),
  );
  const refreshAbsent = fingerprintImageBrief(
    buildImageBrief(
      draft({
        recommendation: "REFRESH_EXISTING",
        matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
        targetPostId: "post_1",
        workflowStatus: "IMAGE_NEEDED",
      }),
      readyFeaturedAbsent,
    ),
  );
  assert.notEqual(refreshPresent, refreshAbsent);

  const updatedAtNoise = fingerprintImageBrief(
    buildImageBrief(draft({ workflowStatus: "IMAGE_NEEDED", updatedAt: "2099-01-01T00:00:00.000Z" })),
  );
  assert.equal(a, updatedAtNoise);

  const suggestionNoise = fingerprintImageBrief(
    buildImageBrief(
      withPayload(draft({ workflowStatus: "IMAGE_NEEDED" }), {
        workspace: {
          contentAngle:
            "Focus the refresh on a practical Wi-Fi, network, and playback troubleshooting checklist for Firestick users.",
          nextStep: "Approved next step",
          humanNotes: "Approved notes",
          suggestions: {
            topic: { originalValue: "Candidate topic", value: "Candidate topic", status: "APPLIED" },
          },
        },
      }),
    ),
  );
  assert.equal(a, suggestionNoise);

  const writingPromptNoise = fingerprintImageBrief(
    buildImageBrief(
      withPayload(draft({ workflowStatus: "IMAGE_NEEDED" }), {
        writingPrompts: {
          openai: {
            chatgptPrompt: "Different writing prompt",
            writingFingerprint: "b".repeat(64),
            model: "gpt-test",
            generatedAt: "2026-10-07T00:00:00.000Z",
            briefSpec: "d1-1",
          },
        },
      }),
    ),
  );
  assert.equal(a, writingPromptNoise);

  assert.doesNotMatch(buildImagePromptInput(base), /Restart the stick|Check the network/);
});

test("UI / SAFETY: Image Brief after Writing Prompt; no providers/media/BlogPost", () => {
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  const ui = read("components/sidhu/SeoPlanningImageBrief.tsx");
  const briefMod = read("lib/cms/seo-planning/image-brief.ts");
  const fp = read("lib/cms/seo-planning/image-fingerprint.ts");

  const promptIdx = detail.lastIndexOf("<SeoPlanningWritingPrompt");
  const imageIdx = detail.lastIndexOf("<SeoPlanningImageBrief");
  const workflowIdx = detail.lastIndexOf("Workflow</h3>");
  assert.ok(promptIdx > 0 && imageIdx > promptIdx);
  assert.ok(workflowIdx > imageIdx);

  assert.match(ui, /Image Brief/);
  assert.match(ui, /dirtyMessage/);
  assert.match(detail, /SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE/);
  assert.ok(briefMod.includes(SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE));
  assert.doesNotMatch(ui, /Generate with Gemini|Generate with OpenAI|requestGemini|requestOpenAi/);
  assert.doesNotMatch(briefMod, /requestGemini|requestOpenAi|cloudinary|uploadImage|savePost/);
  assert.doesNotMatch(fp, /requestGemini|requestOpenAi|cloudinary/);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 3);
});

test("canonical input stays bounded and includes safety/policy", () => {
  const brief = buildImageBrief(draft({ workflowStatus: "IMAGE_NEEDED" }));
  const input = buildImagePromptInput(brief);
  assert.ok(input.length <= 4000);
  assert.match(input, /NO_BAKED_TITLE_TEXT|Text-in-image policy/);
  assert.match(input, /fake IPTV player|Fake logos|FEATURED_BLOG_IMAGE|16:9|1280x720/);
  assert.match(input, /og:image|1200/);
});
