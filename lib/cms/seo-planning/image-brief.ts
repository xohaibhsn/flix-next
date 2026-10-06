/**
 * Derived private Image Brief for featured-blog-image planning (Phase E1).
 * Deterministic / read-only. No network, no env, no cache writes, no AI.
 */

import type { WritingArticleContext } from "@/lib/cms/seo-planning/writing-brief";
import { SEO_PLANNING_FIELD_CAPS } from "@/lib/cms/seo-planning/constants";
import type { SeoPlanningDraft, SeoPlanningWorkflowStatus } from "@/lib/cms/types";

export const SEO_PLANNING_IMAGE_BRIEF_SPEC = "e1-1";
export const IMAGE_PROMPT_INPUT_MAX = 4_000;
export const IMAGE_BRIEF_AUDIENCE = "UK readers of The Flix IPTV blog.";
export const SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE =
  "Save your planning changes before treating this Image Brief as current.";

const CONTENT_TASKS = new Set(["NEW_BLOG", "REFRESH_EXISTING", "RESTORE_HISTORICAL"]);

export type ImageBriefTask =
  | "NEW_BLOG"
  | "REFRESH_EXISTING"
  | "RESTORE_HISTORICAL"
  | "INTERNAL_LINK_ONLY";

export type ExistingFeaturedImage = "present" | "absent" | "n/a";

export type ExistingFeaturedDisposition =
  | "none_needed_internal_link"
  | "create_new"
  | "review_existing"
  | "missing_needs_image";

export type ImageBrief = {
  spec: typeof SEO_PLANNING_IMAGE_BRIEF_SPEC;
  taskType: ImageBriefTask | "UNSUPPORTED";
  workflowStatus: SeoPlanningWorkflowStatus;

  topic: string;
  workingTitle: string;
  searchIntent: string;
  contentAngle: string;
  humanNotes: string;
  targetPublicUrl: string;
  restorePath: string;

  articleTitle: string;
  articleCategory: string;
  existingFeaturedImage: ExistingFeaturedImage;
  existingFeaturedDisposition: ExistingFeaturedDisposition;

  imagePurpose: "FEATURED_BLOG_IMAGE";
  recommendedAspectRatio: "16:9";
  recommendedSourceSize: "1280x720";
  ogReuseNote: string;

  visualSubject: string;
  visualConcept: string;
  mustInclude: string[];
  avoid: string[];
  textInImagePolicy: "NO_BAKED_TITLE_TEXT";
  brandContext: string;
  audience: string;
  factualConstraints: string[];
  safetyConstraints: string[];

  providerEligible: boolean;
  providerIneligibleReason: string;
};

const OG_REUSE_NOTE =
  "Featured image may also serve og:image when post.ogImage is empty; social delivery crops to 1200×630.";

const BRAND_CONTEXT = "The Flix IPTV — UK editorial blog imagery.";

const AVOID = [
  "Baked-in article title, working title, or URL text",
  "Fake IPTV player UI or fabricated service screenshots",
  "Fake logos, partnerships, or trademark endorsement",
  "Fake statistics, prices, or search/GSC metrics",
  "Unsupported device-compatibility claims",
  "Fabricated user information",
] as const;

const FACTUAL_CONSTRAINTS = [
  "Do not invent product claims, prices, or performance metrics.",
  "Do not invent search rankings or GSC data visually.",
  "Stay within the approved topic and content angle.",
] as const;

const SAFETY_CONSTRAINTS = [
  "Prefer editorial or illustrative device/setup visuals over fake literal app screens.",
  "Avoid misleading official-looking interfaces or partnership marks.",
  "Keep the image suitable for a public UK consumer blog.",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clip(value: string, max: number) {
  return value.replace(/\0/g, "").trim().slice(0, max);
}

function textField(value: unknown, max: number) {
  return typeof value === "string" ? clip(value, max) : "";
}

function workspaceText(payload: unknown, key: "contentAngle" | "humanNotes", max: number) {
  const workspace = asRecord(asRecord(payload)?.workspace);
  return textField(workspace?.[key], max);
}

function taskOf(recommendation: string): ImageBriefTask | "UNSUPPORTED" {
  if (
    recommendation === "NEW_BLOG" ||
    recommendation === "REFRESH_EXISTING" ||
    recommendation === "RESTORE_HISTORICAL" ||
    recommendation === "INTERNAL_LINK_ONLY"
  ) {
    return recommendation;
  }
  return "UNSUPPORTED";
}

function featuredState(
  task: ImageBriefTask | "UNSUPPORTED",
  article: WritingArticleContext,
): {
  existingFeaturedImage: ExistingFeaturedImage;
  existingFeaturedDisposition: ExistingFeaturedDisposition;
  articleTitle: string;
  articleCategory: string;
} {
  if (task === "INTERNAL_LINK_ONLY") {
    return {
      existingFeaturedImage: "n/a",
      existingFeaturedDisposition: "none_needed_internal_link",
      articleTitle: "",
      articleCategory: "",
    };
  }
  if (task === "NEW_BLOG" || task === "RESTORE_HISTORICAL" || task === "UNSUPPORTED") {
    return {
      existingFeaturedImage: "n/a",
      existingFeaturedDisposition: "create_new",
      articleTitle: "",
      articleCategory: "",
    };
  }
  // REFRESH_EXISTING
  if (article.status !== "ready") {
    return {
      existingFeaturedImage: "n/a",
      existingFeaturedDisposition: "missing_needs_image",
      articleTitle: "",
      articleCategory: "",
    };
  }
  const present = article.snapshot.featuredImage === "present";
  return {
    existingFeaturedImage: present ? "present" : "absent",
    existingFeaturedDisposition: present ? "review_existing" : "missing_needs_image",
    articleTitle: clip(article.snapshot.title, SEO_PLANNING_FIELD_CAPS.workingTitle),
    articleCategory: clip(article.snapshot.categoryName, 80),
  };
}

function buildVisualSubject(topic: string, workingTitle: string) {
  const base = topic || workingTitle || "approved editorial topic";
  return clip(`${base} — featured editorial visual context`, 180);
}

function buildVisualConcept(args: {
  topic: string;
  workingTitle: string;
  searchIntent: string;
  contentAngle: string;
}) {
  const focus = args.contentAngle || args.topic || args.workingTitle || "the approved topic";
  const intent = args.searchIntent ? ` (${args.searchIntent.toLowerCase()} intent)` : "";
  return clip(
    `Clean editorial technology image for ${focus}${intent}, without fake app UI or baked-in title text.`,
    280,
  );
}

function mustIncludeLines(args: {
  topic: string;
  workingTitle: string;
  contentAngle: string;
  disposition: ExistingFeaturedDisposition;
}) {
  const lines: string[] = [];
  if (args.topic) lines.push(clip(`Topic cue: ${args.topic}`, 200));
  if (args.workingTitle) lines.push(clip(`Title context (not painted in image): ${args.workingTitle}`, 220));
  if (args.contentAngle) lines.push(clip(`Angle: ${args.contentAngle}`, 280));
  if (args.disposition === "review_existing") {
    lines.push("Review the current featured image before deciding to replace it.");
  }
  if (args.disposition === "missing_needs_image") {
    lines.push("A featured image is still needed for this article.");
  }
  if (args.disposition === "create_new") {
    lines.push("Create a new featured blog image for this plan.");
  }
  return lines.slice(0, 6);
}

function workflowReason(status: SeoPlanningWorkflowStatus) {
  if (status === "CONTENT_NEEDED") {
    return "Image prompt generation will be available after this plan moves to Image Needed.";
  }
  if (status === "PLANNING") {
    return "Move this plan to Content Needed, then Image Needed, before generating an image prompt.";
  }
  if (status === "IMAGE_NEEDED") {
    return "";
  }
  return "Image prompts are generated while the plan is in Image Needed.";
}

function eligibility(args: {
  task: ImageBriefTask | "UNSUPPORTED";
  workflow: SeoPlanningWorkflowStatus;
  topic: string;
  workingTitle: string;
  searchIntent: string;
  article: WritingArticleContext;
}): { providerEligible: boolean; providerIneligibleReason: string } {
  if (args.task === "INTERNAL_LINK_ONLY") {
    return {
      providerEligible: false,
      providerIneligibleReason: "Internal-link planning does not need a featured image brief.",
    };
  }
  if (args.task === "UNSUPPORTED" || !CONTENT_TASKS.has(args.task)) {
    return {
      providerEligible: false,
      providerIneligibleReason: "This planning draft cannot use an image brief.",
    };
  }
  if (!args.topic || !args.workingTitle || !args.searchIntent) {
    return {
      providerEligible: false,
      providerIneligibleReason: "This image brief is incomplete.",
    };
  }
  if (args.task === "REFRESH_EXISTING") {
    if (args.article.status === "missing" || args.article.status === "skipped") {
      return {
        providerEligible: false,
        providerIneligibleReason: "The existing article for this refresh could not be found.",
      };
    }
    if (args.article.status === "mismatch") {
      return {
        providerEligible: false,
        providerIneligibleReason: "The existing article does not match this plan's public URL.",
      };
    }
  }
  if (args.workflow !== "IMAGE_NEEDED") {
    return {
      providerEligible: false,
      providerIneligibleReason: workflowReason(args.workflow),
    };
  }
  return { providerEligible: true, providerIneligibleReason: "" };
}

export function buildImageBrief(
  draft: SeoPlanningDraft,
  article: WritingArticleContext = { status: "skipped" },
): ImageBrief {
  const task = taskOf(draft.recommendation);
  const topic = clip(draft.topic, SEO_PLANNING_FIELD_CAPS.topic);
  const workingTitle = clip(draft.workingTitle, SEO_PLANNING_FIELD_CAPS.workingTitle);
  const searchIntent = clip(draft.searchIntent, SEO_PLANNING_FIELD_CAPS.searchIntent);
  const contentAngle = workspaceText(draft.payload, "contentAngle", SEO_PLANNING_FIELD_CAPS.suggestedAngle);
  const humanNotes = workspaceText(draft.payload, "humanNotes", SEO_PLANNING_FIELD_CAPS.humanNotes);
  const featured = featuredState(task, article);
  const visualSubject = buildVisualSubject(topic, workingTitle);
  const visualConcept = buildVisualConcept({ topic, workingTitle, searchIntent, contentAngle });
  const gate = eligibility({
    task,
    workflow: draft.workflowStatus,
    topic: draft.topic.trim(),
    workingTitle: draft.workingTitle.trim(),
    searchIntent: draft.searchIntent.trim(),
    article,
  });

  return {
    spec: SEO_PLANNING_IMAGE_BRIEF_SPEC,
    taskType: task,
    workflowStatus: draft.workflowStatus,
    topic,
    workingTitle,
    searchIntent,
    contentAngle,
    humanNotes,
    targetPublicUrl:
      task === "REFRESH_EXISTING" || task === "INTERNAL_LINK_ONLY"
        ? clip(draft.matchedPublicUrl, SEO_PLANNING_FIELD_CAPS.matchedPublicUrl)
        : "",
    restorePath:
      task === "RESTORE_HISTORICAL" ? clip(draft.restorePath, SEO_PLANNING_FIELD_CAPS.restorePath) : "",
    articleTitle: featured.articleTitle,
    articleCategory: featured.articleCategory,
    existingFeaturedImage: featured.existingFeaturedImage,
    existingFeaturedDisposition: featured.existingFeaturedDisposition,
    imagePurpose: "FEATURED_BLOG_IMAGE",
    recommendedAspectRatio: "16:9",
    recommendedSourceSize: "1280x720",
    ogReuseNote: OG_REUSE_NOTE,
    visualSubject,
    visualConcept,
    mustInclude: mustIncludeLines({
      topic,
      workingTitle,
      contentAngle,
      disposition: featured.existingFeaturedDisposition,
    }),
    avoid: [...AVOID],
    textInImagePolicy: "NO_BAKED_TITLE_TEXT",
    brandContext: BRAND_CONTEXT,
    audience: IMAGE_BRIEF_AUDIENCE,
    factualConstraints: [...FACTUAL_CONSTRAINTS],
    safetyConstraints: [...SAFETY_CONSTRAINTS],
    providerEligible: gate.providerEligible,
    providerIneligibleReason: gate.providerIneligibleReason,
  };
}

/** Canonical image-relevant input for fingerprinting (not full article body). */
export function buildImagePromptInput(brief: ImageBrief) {
  const lines = [
    `Image brief spec: ${brief.spec}`,
    `Task: ${brief.taskType}`,
    `Workflow: ${brief.workflowStatus}`,
    `Topic: ${brief.topic}`,
    `Working title: ${brief.workingTitle}`,
    `Search intent: ${brief.searchIntent}`,
    `Content angle: ${brief.contentAngle}`,
    `Human notes: ${brief.humanNotes}`,
    `Target public URL: ${brief.targetPublicUrl}`,
    `Restore path: ${brief.restorePath}`,
    `Article title: ${brief.articleTitle}`,
    `Article category: ${brief.articleCategory}`,
    `Existing featured image: ${brief.existingFeaturedImage}`,
    `Featured disposition: ${brief.existingFeaturedDisposition}`,
    `Image purpose: ${brief.imagePurpose}`,
    `Aspect ratio: ${brief.recommendedAspectRatio}`,
    `Source size: ${brief.recommendedSourceSize}`,
    `OG reuse: ${brief.ogReuseNote}`,
    `Visual subject: ${brief.visualSubject}`,
    `Visual concept: ${brief.visualConcept}`,
    `Text-in-image policy: ${brief.textInImagePolicy}`,
    `Brand context: ${brief.brandContext}`,
    `Audience: ${brief.audience}`,
    "Must include:",
    ...brief.mustInclude.map((line) => `- ${line}`),
    "Avoid:",
    ...brief.avoid.map((line) => `- ${line}`),
    "Factual constraints:",
    ...brief.factualConstraints.map((line) => `- ${line}`),
    "Safety constraints:",
    ...brief.safetyConstraints.map((line) => `- ${line}`),
  ];
  return lines.join("\n").slice(0, IMAGE_PROMPT_INPUT_MAX);
}
