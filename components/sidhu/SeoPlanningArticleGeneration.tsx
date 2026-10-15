"use client";

import { useMemo, useState, useTransition } from "react";
import {
  generateNewBlogArticlePreviewAction,
  type GenerateNewBlogArticlePreviewActionResult,
} from "@/lib/cms/seo-planning-actions";
import { sanitizeHtml } from "@/lib/cms/html";
import type { WritingBrief } from "@/lib/cms/seo-planning/writing-brief";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { Banner } from "@/components/sidhu/fields";
import { Button } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

export const SEO_AI_ARTICLE_UI_DIRTY_MESSAGE = "Save Planning changes before generating.";
export const SEO_AI_ARTICLE_UI_NOT_CONFIGURED_MESSAGE = "Article generation is not configured.";
export const SEO_AI_ARTICLE_UI_INELIGIBLE_MESSAGE =
  "This Planning draft is not eligible for article generation.";
export const SEO_AI_ARTICLE_UI_STALE_MESSAGE = "Planning changed. Generate a fresh article preview.";
export const SEO_AI_ARTICLE_UI_GENERATE_FAILED_MESSAGE =
  "The article preview could not be generated. Nothing was saved.";
export const SEO_AI_ARTICLE_UI_EDITORIAL_WARNING =
  "AI-generated draft — facts and sources require human review.";
export const SEO_AI_ARTICLE_UI_NOT_PUBLICATION_READY = "Not publication-ready";
export const SEO_AI_ARTICLE_UI_PREVIEW_ONLY_NOTE =
  "Private preview only. Applying this article to a Blog draft is not available in this release candidate.";

export type PrivateArticlePreviewUi = {
  spec: string;
  planningDraftId: string;
  planningUpdatedAt: string;
  recommendation: "NEW_BLOG";
  writingFingerprint: string;
  model: string;
  article: { title: string; excerpt: string; html: string };
  evidenceTrust: {
    publicationReady: false;
    evidencePackComplete: false;
    aiProse: string;
  };
  requiresHumanFactualReview: true;
  publicationReady: false;
  privatePreview: true;
};

export function isArticleGenerationUiEligible(args: {
  featureEnabled: boolean;
  providerConfigured: boolean;
  draft: Pick<SeoPlanningDraft, "recommendation" | "workflowStatus">;
  writingBrief: Pick<WritingBrief, "providerEligible" | "taskType">;
  archived: boolean;
  dirty: boolean;
  mutationPending: boolean;
}): { eligible: boolean; reason: string } {
  if (!args.featureEnabled) {
    return { eligible: false, reason: "" };
  }
  if (args.archived) {
    return { eligible: false, reason: SEO_AI_ARTICLE_UI_INELIGIBLE_MESSAGE };
  }
  if (args.draft.recommendation !== "NEW_BLOG") {
    return { eligible: false, reason: SEO_AI_ARTICLE_UI_INELIGIBLE_MESSAGE };
  }
  if (
    !args.writingBrief.providerEligible ||
    args.writingBrief.taskType !== "NEW_BLOG" ||
    args.draft.workflowStatus !== "CONTENT_NEEDED"
  ) {
    return { eligible: false, reason: SEO_AI_ARTICLE_UI_INELIGIBLE_MESSAGE };
  }
  if (!args.providerConfigured) {
    return { eligible: false, reason: SEO_AI_ARTICLE_UI_NOT_CONFIGURED_MESSAGE };
  }
  if (args.dirty) {
    return { eligible: false, reason: SEO_AI_ARTICLE_UI_DIRTY_MESSAGE };
  }
  if (args.mutationPending) {
    return { eligible: false, reason: "Wait for the current Planning change to finish." };
  }
  return { eligible: true, reason: "" };
}

export function shouldInvalidateArticlePreview(args: {
  preview: PrivateArticlePreviewUi | null;
  draft: Pick<SeoPlanningDraft, "id" | "updatedAt" | "recommendation" | "workflowStatus">;
  archived: boolean;
  dirty: boolean;
}): boolean {
  if (!args.preview) return false;
  if (args.dirty || args.archived) return true;
  if (args.preview.planningDraftId !== args.draft.id) return true;
  if (args.preview.planningUpdatedAt !== args.draft.updatedAt) return true;
  if (args.draft.recommendation !== "NEW_BLOG") return true;
  if (args.draft.workflowStatus !== "CONTENT_NEEDED") return true;
  return false;
}

export function mapArticleGenerationUiError(
  result: { error?: string; code?: string } | null | undefined,
): string {
  const code = String(result?.code || "");
  if (code === "feature_disabled" || code === "not_configured") {
    return SEO_AI_ARTICLE_UI_NOT_CONFIGURED_MESSAGE;
  }
  if (
    code === "ineligible" ||
    code === "unsupported_recommendation" ||
    code === "refresh_target_blocked" ||
    code === "planning_archived"
  ) {
    return SEO_AI_ARTICLE_UI_INELIGIBLE_MESSAGE;
  }
  if (code === "stale_planning" || code === "brief_changed") {
    return SEO_AI_ARTICLE_UI_STALE_MESSAGE;
  }
  const error = String(result?.error || "").trim();
  if (!error) return SEO_AI_ARTICLE_UI_GENERATE_FAILED_MESSAGE;
  // Never surface stack-like or SQL-looking payloads.
  if (/stack|sql|password|api[_-]?key|secret|Bearer\s/i.test(error)) {
    return SEO_AI_ARTICLE_UI_GENERATE_FAILED_MESSAGE;
  }
  return error.slice(0, 300);
}

function asPreview(raw: unknown): PrivateArticlePreviewUi | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const article = row.article;
  if (!article || typeof article !== "object" || Array.isArray(article)) return null;
  const art = article as Record<string, unknown>;
  const trust = row.evidenceTrust;
  if (!trust || typeof trust !== "object" || Array.isArray(trust)) return null;
  const trustRow = trust as Record<string, unknown>;
  if (
    row.recommendation !== "NEW_BLOG" ||
    row.publicationReady !== false ||
    row.privatePreview !== true ||
    row.requiresHumanFactualReview !== true ||
    trustRow.publicationReady !== false ||
    typeof row.planningDraftId !== "string" ||
    typeof row.planningUpdatedAt !== "string" ||
    typeof row.writingFingerprint !== "string" ||
    typeof row.spec !== "string" ||
    typeof row.model !== "string" ||
    typeof art.title !== "string" ||
    typeof art.excerpt !== "string" ||
    typeof art.html !== "string"
  ) {
    return null;
  }
  return {
    spec: row.spec,
    planningDraftId: row.planningDraftId,
    planningUpdatedAt: row.planningUpdatedAt,
    recommendation: "NEW_BLOG",
    writingFingerprint: row.writingFingerprint,
    model: row.model,
    article: {
      title: art.title,
      excerpt: art.excerpt,
      html: art.html,
    },
    evidenceTrust: {
      publicationReady: false,
      evidencePackComplete: false,
      aiProse: String(trustRow.aiProse || "ai_generated_untrusted"),
    },
    requiresHumanFactualReview: true,
    publicationReady: false,
    privatePreview: true,
  };
}

export function SeoPlanningArticleGeneration({
  draft,
  writingBrief,
  featureEnabled,
  providerConfigured,
  dirty,
  mutationPending,
  archived,
}: {
  draft: SeoPlanningDraft;
  writingBrief: WritingBrief;
  featureEnabled: boolean;
  providerConfigured: boolean;
  dirty: boolean;
  mutationPending: boolean;
  archived: boolean;
}) {
  const [preview, setPreview] = useState<PrivateArticlePreviewUi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staleNote, setStaleNote] = useState<string | null>(null);
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const [generating, startGenerateTransition] = useTransition();

  const gate = useMemo(
    () =>
      isArticleGenerationUiEligible({
        featureEnabled,
        providerConfigured,
        draft,
        writingBrief,
        archived,
        dirty,
        mutationPending,
      }),
    [featureEnabled, providerConfigured, draft, writingBrief, archived, dirty, mutationPending],
  );

  // Invalidate temporary client preview when Planning diverges (render-time adjust).
  if (
    shouldInvalidateArticlePreview({
      preview,
      draft,
      archived,
      dirty,
    })
  ) {
    setPreview(null);
    setShowHtmlSource(false);
    setStaleNote(SEO_AI_ARTICLE_UI_STALE_MESSAGE);
  }

  if (!featureEnabled) {
    return null;
  }

  const busy = generating || mutationPending;
  const generateEnabled = gate.eligible && !busy;
  const safeHtml = preview ? sanitizeHtml(preview.article.html) : "";

  function runGenerate() {
    if (!generateEnabled || generating) return;
    setError(null);
    setStaleNote(null);
    startGenerateTransition(async () => {
      const result: GenerateNewBlogArticlePreviewActionResult =
        await generateNewBlogArticlePreviewAction({ planningDraftId: draft.id });
      if (!result.ok) {
        setPreview(null);
        setError(mapArticleGenerationUiError(result));
        return;
      }
      if (result.blogSaved) {
        setPreview(null);
        setError(SEO_AI_ARTICLE_UI_GENERATE_FAILED_MESSAGE);
        return;
      }
      const next = asPreview(result.preview);
      if (!next) {
        setPreview(null);
        setError("The article preview was invalid. Nothing was saved.");
        return;
      }
      setPreview(next);
      setShowHtmlSource(false);
      setError(null);
    });
  }

  const unavailable =
    draft.recommendation !== "NEW_BLOG" ||
    archived ||
    writingBrief.taskType !== "NEW_BLOG" ||
    !writingBrief.providerEligible ||
    draft.workflowStatus !== "CONTENT_NEEDED";

  return (
    <SectionCard className="space-y-3 text-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">AI Article Generation</h3>
        <p className="text-xs text-muted">
          Creates a private editorial preview only. It does not publish a Blog post.
        </p>
      </div>

      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-semibold tracking-wide text-muted uppercase">Provider</dt>
          <dd className="mt-0.5 text-ink">OpenAI</dd>
        </div>
        <div>
          <dt className="font-semibold tracking-wide text-muted uppercase">Configured</dt>
          <dd className="mt-0.5 text-ink">{providerConfigured ? "Yes" : "No"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold tracking-wide text-muted uppercase">Saved topic / title</dt>
          <dd className="mt-0.5 text-ink">
            {draft.topic || "—"}
            {draft.workingTitle ? (
              <span className="mt-0.5 block text-muted">{draft.workingTitle}</span>
            ) : null}
          </dd>
        </div>
      </dl>

      {unavailable ? (
        <p className="text-sm text-ink">{SEO_AI_ARTICLE_UI_INELIGIBLE_MESSAGE}</p>
      ) : null}

      {!unavailable && !providerConfigured ? (
        <p className="text-sm text-muted">{SEO_AI_ARTICLE_UI_NOT_CONFIGURED_MESSAGE}</p>
      ) : null}

      {!unavailable && dirty ? (
        <p className="text-sm text-amber-950">{SEO_AI_ARTICLE_UI_DIRTY_MESSAGE}</p>
      ) : null}

      {staleNote && !preview ? <p className="text-sm text-amber-950">{staleNote}</p> : null}

      {error ? <Banner tone="error">{error}</Banner> : null}

      {preview ? (
        <div className="space-y-3 rounded-md border border-line px-3 py-3">
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
            {SEO_AI_ARTICLE_UI_EDITORIAL_WARNING}
          </p>
          <p className="text-xs font-semibold tracking-wide text-amber-950 uppercase">
            {SEO_AI_ARTICLE_UI_NOT_PUBLICATION_READY}
          </p>
          <p className="text-xs text-muted">{SEO_AI_ARTICLE_UI_PREVIEW_ONLY_NOTE}</p>
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Title</p>
            <p className="mt-1 font-medium text-ink">{preview.article.title}</p>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Excerpt</p>
            <p className="mt-1 text-ink">{preview.article.excerpt}</p>
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                Article preview
              </p>
              <Button
                type="button"
                variant="ghost"
                className="min-h-8 px-2 text-xs"
                onClick={() => setShowHtmlSource((value) => !value)}
              >
                {showHtmlSource ? "Hide HTML source" : "Show HTML source"}
              </Button>
            </div>
            {showHtmlSource ? (
              <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-line bg-paper px-3 py-2 text-xs whitespace-pre-wrap text-muted">
                {safeHtml}
              </pre>
            ) : (
              <div
                className="prose-cms mt-2 max-h-80 overflow-auto rounded-md border border-line px-3 py-2 text-sm"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={!generateEnabled} onClick={runGenerate}>
          {generating ? "Generating..." : "Generate Article"}
        </Button>
      </div>
    </SectionCard>
  );
}
