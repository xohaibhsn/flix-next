/**
 * Derived private Writing Brief and the provider-neutral prompt input.
 * No network, no env, no cache writes. Gemini and OpenAI will consume the
 * same canonical input in later phases.
 */

import type { ArticleSnapshot } from "@/lib/cms/seo-planning/article-snapshot";
import { SEO_PLANNING_FIELD_CAPS } from "@/lib/cms/seo-planning/constants";
import type { SeoPlanningDraft, SeoPlanningWorkflowStatus } from "@/lib/cms/types";

export const SEO_PLANNING_WRITING_BRIEF_SPEC = "d1-1";
export const WRITING_PROMPT_INPUT_MAX = 12_000;
export const WRITING_BRIEF_SOURCE_CAP = 8;
export const WRITING_BRIEF_GSC_SIGNAL_CAP = 3;
export const WRITING_BRIEF_AUDIENCE = "UK readers of The Flix IPTV blog.";
export const SEO_PLANNING_WRITING_PROMPT_DIRTY_MESSAGE =
  "Save your planning changes before generating a prompt.";
export const SEO_PLANNING_WRITING_PROMPT_LATER_MESSAGE =
  "AI prompt generation will be available for Content Needed plans.";

const SOURCE_TITLE_CAP = 120;
const SOURCE_DOMAIN_CAP = 80;
const SOURCE_URL_CAP = 300;
const GSC_SIGNAL_CAP = 180;

const CONTENT_TASKS = new Set(["NEW_BLOG", "REFRESH_EXISTING", "RESTORE_HISTORICAL"]);

export type WritingBriefTask =
  | "NEW_BLOG"
  | "REFRESH_EXISTING"
  | "RESTORE_HISTORICAL"
  | "INTERNAL_LINK_ONLY";

export type WritingArticleContext =
  | { status: "skipped" }
  | { status: "missing" }
  | { status: "mismatch" }
  | { status: "ready"; snapshot: ArticleSnapshot };

export type WritingBriefSource = {
  title: string;
  domain: string;
  url: string;
};

export type WritingBrief = {
  spec: typeof SEO_PLANNING_WRITING_BRIEF_SPEC;
  taskType: WritingBriefTask | "UNSUPPORTED";
  taskLabel: string;
  topic: string;
  workingTitle: string;
  searchIntent: string;
  contentAngle: string;
  nextStep: string;
  humanNotes: string;
  targetAudience: string;
  targetPublicUrl: string;
  restorePath: string;
  existingArticle: ArticleSnapshot | null;
  whyNow: string;
  webEvidence: string;
  existingCoverage: string;
  confidence: string;
  matchedTitle: string;
  selectedGscSignals: string[];
  sources: WritingBriefSource[];
  editorialRules: readonly string[];
  seoRequirements: readonly string[];
  factualRules: readonly string[];
  desiredArticleOutput: string;
  archivedBodyAvailable: false;
  providerEligible: boolean;
  providerIneligibleReason: string;
};

const TASK_LABEL: Record<WritingBriefTask, string> = {
  NEW_BLOG: "New blog",
  REFRESH_EXISTING: "Refresh existing",
  RESTORE_HISTORICAL: "Historical recovery",
  INTERNAL_LINK_ONLY: "Internal link",
};

const EDITORIAL_RULES = [
  "Follow the approved topic, working title, search intent, content angle, and next step.",
  "Respect the human notes.",
  "Use supplied evidence carefully.",
  "Preserve useful existing content when refreshing an article.",
  "Improve missing or weak sections.",
  "Do not create a duplicate page, article, or slug.",
  "When refreshing, preserve the existing public URL.",
  "Do not publish anything.",
] as const;

const SEO_REQUIREMENTS = [
  "Write for the approved search intent without keyword stuffing.",
  "The future article must be CMS-ready HTML for the BlogPost Visual | HTML Source editor.",
] as const;

const FACTUAL_RULES = [
  "Avoid unsupported factual claims.",
  "Avoid invented prices or product claims.",
  "Do not invent search metrics.",
] as const;

const DESIRED_ARTICLE_OUTPUT =
  "HTML suitable for the existing BlogPost Visual | HTML Source editor.";

const PROVIDER_RULES = [
  `Writing brief spec: ${SEO_PLANNING_WRITING_BRIEF_SPEC}`,
  "Your task is to turn this Writing Brief into a high-quality prompt for ChatGPT.",
  "DO NOT write the article yourself.",
  "The ChatGPT prompt must instruct ChatGPT to:",
  "- write or refresh the article according to the task",
  "- follow the approved topic",
  "- follow the approved working title",
  "- follow the approved search intent",
  "- follow the approved content angle",
  "- follow the approved next step",
  "- respect the human notes",
  "- use the supplied evidence carefully",
  "- avoid unsupported facts",
  "- avoid invented prices or product claims",
  "- preserve useful existing content when refreshing",
  "- improve missing or weak sections",
  "- avoid creating a duplicate article, page, or slug",
  "- preserve the existing public URL when refreshing an existing article",
  "- produce CMS-ready article HTML for the Visual | HTML Source editor",
  "- not publish anything",
  "- return the article content rather than CMS analysis",
].join("\n");

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

function workspaceText(payload: unknown, key: "contentAngle" | "nextStep" | "humanNotes", max: number) {
  const workspace = asRecord(asRecord(payload)?.workspace);
  return textField(workspace?.[key], max);
}

function directionWord(value: unknown) {
  if (value === "UP" || value === "DOWN" || value === "FLAT") return value.toLowerCase();
  return "";
}

function gscSignals(payload: unknown) {
  const evidence = asRecord(asRecord(payload)?.opportunity)?.gscEvidence;
  if (!Array.isArray(evidence)) return [];
  const lines: string[] = [];
  for (const item of evidence) {
    if (lines.length >= WRITING_BRIEF_GSC_SIGNAL_CAP) break;
    const row = asRecord(item);
    if (!row) continue;
    const subject = textField(row.query, 120) || textField(row.normalizedPath, 120);
    if (!subject) continue;
    const kind =
      row.kind === "query" ? "Query" : row.kind === "page" ? "Page" : row.kind === "query_page" ? "Query and page" : "";
    if (!kind) continue;
    const directions = [
      directionWord(row.clicksDirection) ? `clicks ${directionWord(row.clicksDirection)}` : "",
      directionWord(row.impressionsDirection) ? `impressions ${directionWord(row.impressionsDirection)}` : "",
      directionWord(row.ctrDirection) ? `ctr ${directionWord(row.ctrDirection)}` : "",
      directionWord(row.positionDirection) ? `position ${directionWord(row.positionDirection)}` : "",
    ].filter(Boolean);
    const line = directions.length ? `${kind}: ${subject} (${directions.join(", ")})` : `${kind}: ${subject}`;
    lines.push(clip(line, GSC_SIGNAL_CAP));
  }
  return lines;
}

function boundedSources(payload: unknown): WritingBriefSource[] {
  const raw = asRecord(payload)?.sources;
  if (!Array.isArray(raw)) return [];
  const sources: WritingBriefSource[] = [];
  for (const item of raw) {
    if (sources.length >= WRITING_BRIEF_SOURCE_CAP) break;
    const row = asRecord(item);
    if (!row) continue;
    const title = textField(row.title, SOURCE_TITLE_CAP);
    const domain = textField(row.domain, SOURCE_DOMAIN_CAP);
    const url = textField(row.url, SOURCE_URL_CAP);
    if (!title && !domain && !url) continue;
    sources.push({ title, domain, url });
  }
  return sources;
}

function taskOf(recommendation: string): WritingBriefTask | "UNSUPPORTED" {
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

function workflowReason(status: SeoPlanningWorkflowStatus) {
  if (status === "PLANNING") return "Move this plan to Content Needed before generating a writing prompt.";
  return "Writing prompts are generated while the plan is in Content Needed.";
}

function eligibility(args: {
  task: WritingBriefTask | "UNSUPPORTED";
  workflow: SeoPlanningWorkflowStatus;
  topic: string;
  workingTitle: string;
  searchIntent: string;
  article: WritingArticleContext;
}): { providerEligible: boolean; providerIneligibleReason: string } {
  if (args.task === "INTERNAL_LINK_ONLY") {
    return {
      providerEligible: false,
      providerIneligibleReason: "Internal-link planning does not use a full writing prompt.",
    };
  }
  if (args.task === "UNSUPPORTED" || !CONTENT_TASKS.has(args.task)) {
    return {
      providerEligible: false,
      providerIneligibleReason: "This planning draft cannot generate a writing prompt.",
    };
  }
  if (args.workflow !== "CONTENT_NEEDED") {
    return { providerEligible: false, providerIneligibleReason: workflowReason(args.workflow) };
  }
  if (!args.topic || !args.workingTitle || !args.searchIntent) {
    return { providerEligible: false, providerIneligibleReason: "This writing brief is incomplete." };
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
  return { providerEligible: true, providerIneligibleReason: "" };
}

export function buildWritingBrief(
  draft: SeoPlanningDraft,
  article: WritingArticleContext = { status: "skipped" },
): WritingBrief {
  const task = taskOf(draft.recommendation);
  const opportunity = asRecord(asRecord(draft.payload)?.opportunity);
  const refreshReady = task === "REFRESH_EXISTING" && article.status === "ready";
  const existingArticle = refreshReady ? article.snapshot : null;
  const gate = eligibility({
    task,
    workflow: draft.workflowStatus,
    topic: draft.topic.trim(),
    workingTitle: draft.workingTitle.trim(),
    searchIntent: draft.searchIntent.trim(),
    article,
  });

  return {
    spec: SEO_PLANNING_WRITING_BRIEF_SPEC,
    taskType: task,
    taskLabel: task === "UNSUPPORTED" ? "Unsupported" : TASK_LABEL[task],
    topic: clip(draft.topic, SEO_PLANNING_FIELD_CAPS.topic),
    workingTitle: clip(draft.workingTitle, SEO_PLANNING_FIELD_CAPS.workingTitle),
    searchIntent: clip(draft.searchIntent, SEO_PLANNING_FIELD_CAPS.searchIntent),
    contentAngle: workspaceText(draft.payload, "contentAngle", SEO_PLANNING_FIELD_CAPS.suggestedAngle),
    nextStep: workspaceText(draft.payload, "nextStep", SEO_PLANNING_FIELD_CAPS.nextStep),
    humanNotes: workspaceText(draft.payload, "humanNotes", SEO_PLANNING_FIELD_CAPS.humanNotes),
    targetAudience: WRITING_BRIEF_AUDIENCE,
    targetPublicUrl:
      task === "REFRESH_EXISTING" || task === "INTERNAL_LINK_ONLY"
        ? clip(draft.matchedPublicUrl, SEO_PLANNING_FIELD_CAPS.matchedPublicUrl)
        : "",
    restorePath:
      task === "RESTORE_HISTORICAL" ? clip(draft.restorePath, SEO_PLANNING_FIELD_CAPS.restorePath) : "",
    existingArticle,
    whyNow: textField(opportunity?.whyNow, SEO_PLANNING_FIELD_CAPS.whyNow),
    webEvidence: textField(opportunity?.webEvidence, SEO_PLANNING_FIELD_CAPS.webEvidence),
    existingCoverage: textField(opportunity?.existingCoverage, SEO_PLANNING_FIELD_CAPS.existingCoverage),
    confidence: textField(opportunity?.confidence, SEO_PLANNING_FIELD_CAPS.confidence),
    matchedTitle: textField(opportunity?.matchedTitle, SEO_PLANNING_FIELD_CAPS.matchedTitle),
    selectedGscSignals: gscSignals(draft.payload),
    sources: boundedSources(draft.payload),
    editorialRules: EDITORIAL_RULES,
    seoRequirements: SEO_REQUIREMENTS,
    factualRules: FACTUAL_RULES,
    desiredArticleOutput: DESIRED_ARTICLE_OUTPUT,
    archivedBodyAvailable: false,
    providerEligible: gate.providerEligible,
    providerIneligibleReason: gate.providerIneligibleReason,
  };
}

function fixedPrefix(brief: WritingBrief) {
  const lines = [PROVIDER_RULES, "", `Task: ${brief.taskLabel}`, `Audience: ${brief.targetAudience}`];
  if (brief.taskType === "NEW_BLOG") {
    lines.push("Prepare a prompt to write a new article. Do not create a page or publish.");
  }
  if (brief.taskType === "REFRESH_EXISTING") {
    lines.push("Prepare a prompt to improve the existing article.");
    lines.push("Preserve the existing public URL.");
    lines.push("Do not create a duplicate page, article, or slug.");
  }
  if (brief.taskType === "RESTORE_HISTORICAL") {
    lines.push("Prepare a private recovery writing prompt.");
    lines.push("No archived article body is available in the stored planning evidence.");
    lines.push("Do not restore or publish the historical path.");
  }
  if (brief.taskType === "INTERNAL_LINK_ONLY") {
    lines.push("This is an internal-link task, not a full blog article prompt.");
    lines.push("Do not generate a full article.");
  }
  lines.push(`Approved topic: ${brief.topic || "(not set)"}`);
  lines.push(`Approved working title: ${brief.workingTitle || "(not set)"}`);
  lines.push(`Approved search intent: ${brief.searchIntent || "(not set)"}`);
  lines.push(`Approved content angle: ${brief.contentAngle || "(not set)"}`);
  lines.push(`Approved next step: ${brief.nextStep || "(not set)"}`);
  if (brief.targetPublicUrl) lines.push(`Existing public URL: ${brief.targetPublicUrl}`);
  if (brief.restorePath) lines.push(`Historical path: ${brief.restorePath}`);
  lines.push(`Desired article output from ChatGPT: ${brief.desiredArticleOutput}`);
  return lines.join("\n");
}

type VariableFit = {
  notes: string;
  body: string;
  leftover: string[];
  whyNow: string;
  webEvidence: string;
  coverage: string;
  confidence: string;
  matchedTitle: string;
  signals: string[];
  sources: WritingBriefSource[];
};

function fullFit(brief: WritingBrief): VariableFit {
  return {
    notes: brief.humanNotes,
    body: brief.existingArticle?.body || "",
    leftover: brief.existingArticle?.leftoverHeadings.slice() || [],
    whyNow: brief.whyNow,
    webEvidence: brief.webEvidence,
    coverage: brief.existingCoverage,
    confidence: brief.confidence,
    matchedTitle: brief.matchedTitle,
    signals: brief.selectedGscSignals.slice(),
    sources: brief.sources.slice(),
  };
}

function variableBlock(brief: WritingBrief, fit: VariableFit) {
  const lines = [`Human notes: ${fit.notes || "(none)"}`];
  if (brief.existingArticle) {
    lines.push(`Existing article title: ${brief.existingArticle.title || "(not set)"}`);
    lines.push(`Existing article path: ${brief.existingArticle.publicPath || "(not set)"}`);
    lines.push(`Existing excerpt: ${brief.existingArticle.excerpt || "(none)"}`);
    lines.push(`Category: ${brief.existingArticle.categoryName || "(not set)"}`);
    lines.push(`Current focus keyword: ${brief.existingArticle.focusKeyword || "(none)"}`);
    lines.push(`Featured image: ${brief.existingArticle.featuredImage}`);
    lines.push("Current article snapshot:");
    lines.push(fit.body || "(empty)");
    if (fit.leftover.length) {
      lines.push("Further headings not fully included:");
      for (const heading of fit.leftover) lines.push(`- ${heading}`);
    }
  }
  lines.push(`Why now: ${fit.whyNow || "(none)"}`);
  lines.push(`Web evidence: ${fit.webEvidence || "(none)"}`);
  lines.push(`Existing coverage: ${fit.coverage || "(none)"}`);
  lines.push(`Confidence: ${fit.confidence || "(none)"}`);
  lines.push(`Matched title: ${fit.matchedTitle || "(none)"}`);
  lines.push("Selected SEO signals:");
  if (!fit.signals.length) lines.push("(none)");
  for (const signal of fit.signals) lines.push(`- ${signal}`);
  lines.push("Source references:");
  if (!fit.sources.length) lines.push("(none)");
  fit.sources.forEach((source, index) => {
    lines.push(`${index + 1}. ${source.title || "(untitled)"} | ${source.domain || "(no domain)"} | ${source.url || "(no url)"}`);
  });
  return lines.join("\n");
}

function shrink(fit: VariableFit) {
  if (fit.body.length > 0) {
    const next = Math.max(0, fit.body.length - 400);
    const cut = fit.body.slice(0, next);
    const line = cut.lastIndexOf("\n");
    fit.body = line > 200 ? cut.slice(0, line) : cut.trimEnd();
    return;
  }
  if (fit.leftover.length) {
    fit.leftover.pop();
    return;
  }
  if (fit.notes.length > 0) {
    fit.notes = fit.notes.slice(0, Math.max(0, fit.notes.length - 400)).trimEnd();
    return;
  }
  if (fit.sources.length) {
    fit.sources.pop();
    return;
  }
  if (fit.webEvidence) {
    fit.webEvidence = "";
    return;
  }
  if (fit.whyNow) {
    fit.whyNow = "";
    return;
  }
  if (fit.signals.length) {
    fit.signals.pop();
    return;
  }
  if (fit.matchedTitle) {
    fit.matchedTitle = "";
    return;
  }
  if (fit.coverage) {
    fit.coverage = "";
    return;
  }
  if (fit.confidence) {
    fit.confidence = "";
  }
}

export function buildWritingPromptInput(brief: WritingBrief) {
  const prefix = fixedPrefix(brief);
  const fit = fullFit(brief);
  let rendered = `${prefix}\n\n${variableBlock(brief, fit)}`;
  let guard = 0;
  while (rendered.length > WRITING_PROMPT_INPUT_MAX && guard < 80) {
    const before = rendered;
    shrink(fit);
    rendered = `${prefix}\n\n${variableBlock(brief, fit)}`;
    if (rendered === before) break;
    guard += 1;
  }
  return rendered;
}
