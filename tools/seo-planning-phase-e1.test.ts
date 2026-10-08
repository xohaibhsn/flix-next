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
  IMAGE_PROMPT_INPUT_MAX,
  SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE,
  SEO_PLANNING_IMAGE_BRIEF_SPEC,
  buildImageBrief,
  buildImageFingerprintInput,
  buildImagePromptInput,
  type ImageBrief,
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
  assert.equal(a, createHash("sha256").update(buildImageFingerprintInput(base), "utf8").digest("hex"));
  assert.equal(a.length, 64);
  assert.notEqual(
    a,
    createHash("sha256").update(buildImagePromptInput(base), "utf8").digest("hex"),
    "fingerprint must use semantic fingerprint input, not provider prompt input",
  );

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
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 5);
});

test("canonical input stays bounded and includes safety/policy", () => {
  const brief = buildImageBrief(draft({ workflowStatus: "IMAGE_NEEDED" }));
  const input = buildImagePromptInput(brief);
  assert.ok(input.length <= IMAGE_PROMPT_INPUT_MAX);
  assert.match(input, /NO_BAKED_TITLE_TEXT|Text-in-image policy/);
  assert.match(input, /fake IPTV player|Fake logos|FEATURED_BLOG_IMAGE|16:9|1280x720/);
  assert.match(input, /og:image|1200/);
});

function maxNotesPayload(notes: string, angle = "A".repeat(280)) {
  return {
    workspace: {
      contentAngle: angle,
      nextStep: "Approved next step",
      humanNotes: notes,
      suggestions: {
        topic: { originalValue: "Candidate topic", value: "Candidate topic", status: "PENDING" as const },
      },
    },
  };
}

function refreshDraft(notes: string) {
  return withPayload(
    draft({
      recommendation: "REFRESH_EXISTING",
      matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      targetPostId: "post_1",
      workflowStatus: "IMAGE_NEEDED",
      topic: "T".repeat(160),
      workingTitle: "W".repeat(180),
      searchIntent: "TROUBLESHOOTING",
    }),
    maxNotesPayload(notes),
  );
}

test("E1.1 CANONICAL: max humanNotes cannot starve featured/policy/safety", () => {
  const notes = "N".repeat(4000);
  const brief = buildImageBrief(refreshDraft(notes), readyFeaturedPresent);
  assert.equal(brief.humanNotes.length, 4000);

  const input = buildImagePromptInput(brief);
  assert.ok(input.length <= IMAGE_PROMPT_INPUT_MAX);
  assert.match(input, /Existing featured image: present/);
  assert.match(input, /Featured disposition: review_existing/);
  assert.match(input, /Text-in-image policy: NO_BAKED_TITLE_TEXT/);
  assert.match(input, /Safety constraints:/);
  assert.match(input, /Factual constraints:/);
  assert.match(input, /Image purpose: FEATURED_BLOG_IMAGE/);
  assert.match(input, /Aspect ratio: 16:9/);
  assert.match(input, /Source size: 1280x720/);
  assert.match(input, /Avoid:/);
  assert.match(input, /Keep the image suitable for a public UK consumer blog/);
  // No final blind slice mid-section: safety header implies full section retained.
  assert.match(input, /Safety constraints:\n- Prefer editorial/);
  assert.doesNotMatch(input, /Safety constraints:\n?$/);
});

test("E1.1 FINGERPRINT: max notes still sensitive to featured/disposition/article/policy/safety", () => {
  const notes = "N".repeat(4000);
  const review = buildImageBrief(refreshDraft(notes), readyFeaturedPresent);
  const missing = buildImageBrief(refreshDraft(notes), readyFeaturedAbsent);
  const present = fingerprintImageBrief(review);
  const absent = fingerprintImageBrief(missing);

  assert.equal(review.existingFeaturedDisposition, "review_existing");
  assert.equal(missing.existingFeaturedDisposition, "missing_needs_image");
  assert.notEqual(present, absent, "featured present→absent must change fingerprint under max notes");
  assert.notEqual(
    present,
    absent,
    "disposition review_existing→missing_needs_image must change fingerprint",
  );

  const titleChanged = fingerprintImageBrief(
    buildImageBrief(refreshDraft(notes), {
      status: "ready",
      snapshot: buildArticleSnapshot({
        title: "Completely Different Article Title For Fingerprint",
        excerpt: "A setup walkthrough.",
        publicPath: "/blogs/how-to-watch-iptv-on-firestick/",
        categoryName: "Setup",
        focusKeyword: "firestick iptv",
        featuredImagePresent: true,
        html: "<p>x</p>",
      }),
    }),
  );
  assert.notEqual(present, titleChanged, "articleTitle change must move fingerprint");

  const categoryChanged = fingerprintImageBrief(
    buildImageBrief(refreshDraft(notes), {
      status: "ready",
      snapshot: buildArticleSnapshot({
        title: "How to Watch IPTV on Firestick: Complete Setup Guide",
        excerpt: "A setup walkthrough.",
        publicPath: "/blogs/how-to-watch-iptv-on-firestick/",
        categoryName: "Different Category",
        focusKeyword: "firestick iptv",
        featuredImagePresent: true,
        html: "<p>x</p>",
      }),
    }),
  );
  assert.notEqual(present, categoryChanged, "articleCategory change must move fingerprint");

  const textPolicyChanged = fingerprintImageBrief({
    ...review,
    textInImagePolicy: "DIFFERENT_POLICY" as ImageBrief["textInImagePolicy"],
  });
  assert.notEqual(present, textPolicyChanged, "textInImagePolicy change must move fingerprint");

  const safetyChanged = fingerprintImageBrief({
    ...review,
    safetyConstraints: [...review.safetyConstraints, "Extra safety rule for fingerprint proof"],
  });
  assert.notEqual(present, safetyChanged, "safety constraint change must move fingerprint");

  const updatedAtNoise = fingerprintImageBrief(
    buildImageBrief(
      withPayload(
        draft({
          recommendation: "REFRESH_EXISTING",
          matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
          targetPostId: "post_1",
          workflowStatus: "IMAGE_NEEDED",
          topic: "T".repeat(160),
          workingTitle: "W".repeat(180),
          searchIntent: "TROUBLESHOOTING",
          updatedAt: "2099-01-01T00:00:00.000Z",
        }),
        maxNotesPayload(notes),
      ),
      readyFeaturedPresent,
    ),
  );
  assert.equal(present, updatedAtNoise, "updatedAt must not change fingerprint");

  const suggestionNoise = fingerprintImageBrief(
    buildImageBrief(
      withPayload(refreshDraft(notes), {
        workspace: {
          contentAngle: "A".repeat(280),
          nextStep: "Approved next step",
          humanNotes: notes,
          suggestions: {
            topic: { originalValue: "Candidate topic", value: "Candidate topic", status: "APPLIED" },
          },
        },
      }),
      readyFeaturedPresent,
    ),
  );
  assert.equal(present, suggestionNoise, "suggestion status must not change fingerprint");

  const writingPromptNoise = fingerprintImageBrief(
    buildImageBrief(
      withPayload(refreshDraft(notes), {
        writingPrompts: {
          openai: {
            chatgptPrompt: "Different writing prompt under max notes",
            writingFingerprint: "c".repeat(64),
            model: "gpt-test",
            generatedAt: "2026-10-07T00:00:00.000Z",
            briefSpec: "d1-1",
          },
        },
      }),
      readyFeaturedPresent,
    ),
  );
  assert.equal(present, writingPromptNoise, "writingPrompts must not change fingerprint");
});

test("E1.1 PROVIDER INPUT: within max; complete contract; no mid-section truncation", () => {
  const notes = "N".repeat(4000);
  const brief = buildImageBrief(refreshDraft(notes), readyFeaturedPresent);
  const input = buildImagePromptInput(brief);
  const lines = input.split("\n");

  assert.ok(input.length <= IMAGE_PROMPT_INPUT_MAX, `provider input ${input.length} exceeds ${IMAGE_PROMPT_INPUT_MAX}`);
  assert.match(input, /Existing featured image: present\nFeatured disposition: review_existing/);
  assert.match(input, /Factual constraints:\n- Do not invent product claims/);
  assert.match(input, /Safety constraints:\n- Prefer editorial/);
  assert.match(input, /Avoid:\n- Baked-in article title/);

  for (const header of [
    "Existing featured image:",
    "Featured disposition:",
    "Text-in-image policy:",
    "Factual constraints:",
    "Safety constraints:",
    "Avoid:",
  ]) {
    assert.ok(
      lines.some((line) => line === header || line.startsWith(`${header} `) || line.startsWith(`${header}`)),
      `missing complete section header: ${header}`,
    );
  }
  // No final arbitrary slice: last line must be a complete assembled line.
  assert.ok(lines.at(-1)?.length, "provider input must not end on an empty truncated fragment");
  assert.ok(
    lines.some((line) => line.startsWith("Human notes:")),
    "editorial humanNotes line must remain a complete section",
  );

  const fpInput = buildImageFingerprintInput(brief);
  assert.ok(fpInput.includes('"existingFeaturedImage":"present"'));
  assert.ok(fpInput.includes('"existingFeaturedDisposition":"review_existing"'));
  assert.ok(fpInput.includes('"textInImagePolicy":"NO_BAKED_TITLE_TEXT"'));
  assert.ok(fpInput.includes(`"humanNotes":"${notes}"`));
  assert.ok(!fpInput.includes("providerEligible"));
  assert.ok(!fpInput.includes("writingPrompts"));
  assert.ok(!fpInput.includes("updatedAt"));
});

test("E1.1 LONG-NOTES: fingerprint stays sensitive beyond provider shrink budget", () => {
  const base = buildImageBrief(refreshDraft("N".repeat(4000)), readyFeaturedPresent);
  // Inflate a fixed field equally on both variants so editorial notes must shrink
  // far enough that trailing note deltas fall outside the retained provider budget.
  const inflate = (notes: string): ImageBrief => ({
    ...base,
    brandContext: `${base.brandContext}${"X".repeat(2000)}`,
    humanNotes: notes,
  });
  const markerA = "[[E11-TAIL-A]]";
  const markerB = "[[E11-TAIL-B]]";
  const a = inflate(`${"N".repeat(4000 - markerA.length)}${markerA}`);
  const b = inflate(`${"N".repeat(4000 - markerB.length)}${markerB}`);

  const providerA = buildImagePromptInput(a);
  const providerB = buildImagePromptInput(b);
  assert.equal(providerA, providerB, "provider input may match after deterministic note shrinking");
  assert.ok(providerA.length <= IMAGE_PROMPT_INPUT_MAX);
  assert.ok(!providerA.includes(markerA) && !providerA.includes(markerB));
  assert.notEqual(
    fingerprintImageBrief(a),
    fingerprintImageBrief(b),
    "fingerprint must still see note changes beyond the provider retained budget",
  );
  assert.ok(buildImageFingerprintInput(a).includes(markerA));
  assert.ok(buildImageFingerprintInput(b).includes(markerB));
});

test("E1.1 REFRESH + SAFETY: URL and contract sections move fingerprint under max notes", () => {
  const notes = "N".repeat(4000);
  const base = buildImageBrief(refreshDraft(notes), readyFeaturedPresent);
  const baseHash = fingerprintImageBrief(base);

  const urlChanged = fingerprintImageBrief(
    buildImageBrief(
      withPayload(
        draft({
          recommendation: "REFRESH_EXISTING",
          matchedPublicUrl: "/blogs/completely-different-refresh-target/",
          targetPostId: "post_1",
          workflowStatus: "IMAGE_NEEDED",
          topic: "T".repeat(160),
          workingTitle: "W".repeat(180),
          searchIntent: "TROUBLESHOOTING",
        }),
        maxNotesPayload(notes),
      ),
      {
        status: "ready",
        snapshot: buildArticleSnapshot({
          title: "How to Watch IPTV on Firestick: Complete Setup Guide",
          excerpt: "A setup walkthrough.",
          publicPath: "/blogs/completely-different-refresh-target/",
          categoryName: "Setup",
          focusKeyword: "firestick iptv",
          featuredImagePresent: true,
          html: "<p>x</p>",
        }),
      },
    ),
  );
  assert.notEqual(baseHash, urlChanged, "targetPublicUrl change must move fingerprint under max notes");

  assert.notEqual(
    baseHash,
    fingerprintImageBrief({ ...base, avoid: [...base.avoid, "Extra avoid rule"] }),
    "avoid rule change must move fingerprint",
  );
  assert.notEqual(
    baseHash,
    fingerprintImageBrief({
      ...base,
      factualConstraints: [...base.factualConstraints, "Extra factual constraint"],
    }),
    "factual constraint change must move fingerprint",
  );
  assert.notEqual(
    baseHash,
    fingerprintImageBrief({ ...base, visualConcept: `${base.visualConcept} · probe` }),
    "visualConcept change must move fingerprint",
  );
  assert.notEqual(
    baseHash,
    fingerprintImageBrief({
      ...base,
      recommendedAspectRatio: "4:3" as ImageBrief["recommendedAspectRatio"],
    }),
    "aspect ratio change must move fingerprint",
  );
  assert.notEqual(
    baseHash,
    fingerprintImageBrief({
      ...base,
      recommendedSourceSize: "1920x1080" as ImageBrief["recommendedSourceSize"],
    }),
    "source size change must move fingerprint",
  );
  assert.notEqual(
    baseHash,
    fingerprintImageBrief({ ...base, ogReuseNote: `${base.ogReuseNote} · probe` }),
    "ogReuseNote change must move fingerprint",
  );
});

test("E1.1 NOISE: gemini writingPrompts and unrelated payload sibling ignored", () => {
  const notes = "N".repeat(4000);
  const base = fingerprintImageBrief(buildImageBrief(refreshDraft(notes), readyFeaturedPresent));

  const geminiNoise = fingerprintImageBrief(
    buildImageBrief(
      withPayload(refreshDraft(notes), {
        writingPrompts: {
          gemini: {
            chatgptPrompt: "Different Gemini writing prompt under max notes",
            writingFingerprint: "d".repeat(64),
            model: "gemini-other",
            generatedAt: "2026-10-08T00:00:00.000Z",
            briefSpec: "d1-1",
          },
        },
      }),
      readyFeaturedPresent,
    ),
  );
  assert.equal(base, geminiNoise, "writingPrompts.gemini must not change fingerprint");

  const siblingNoise = fingerprintImageBrief(
    buildImageBrief(
      withPayload(refreshDraft(notes), {
        unrelatedAuditSibling: { keep: false, reason: "noise" },
      }),
      readyFeaturedPresent,
    ),
  );
  assert.equal(base, siblingNoise, "unrelated payload sibling must not change fingerprint");
});

test("E1.1 PROVIDER: essential overrun fails clearly (no blind slice)", () => {
  const brief = buildImageBrief(refreshDraft("N".repeat(4000)), readyFeaturedPresent);
  const bloated: ImageBrief = {
    ...brief,
    // Fixed section alone exceeds max; editorial shrink cannot recover.
    brandContext: "B".repeat(IMAGE_PROMPT_INPUT_MAX + 100),
  };
  assert.throws(
    () => buildImagePromptInput(bloated),
    /essential contract exceeds IMAGE_PROMPT_INPUT_MAX/,
  );
});
