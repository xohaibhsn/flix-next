"use client";

import { useMemo, useState, useTransition } from "react";
import { SEO_RESEARCH_INTENTS } from "@/lib/cms/ai-seo/research-schemas";
import type { SeoResearchGscEvidence, SeoResearchSource } from "@/lib/cms/ai-seo/research-schemas";
import {
  saveSeoPlanningWorkspaceAction,
  type SaveSeoPlanningWorkspaceResult,
} from "@/lib/cms/seo-planning-actions";
import {
  allowedSeoPlanningTransitions,
  isContentPlanningRecommendation,
  isInternalLinkPlanningRecommendation,
  readWorkspaceHumanNotes,
  seoPlanningTransitionButtonLabel,
} from "@/lib/cms/seo-planning/workspace";
import type { SeoPlanningDraft, SeoPlanningWorkflowStatus } from "@/lib/cms/types";
import { SeoPlanningSuggestions } from "@/components/sidhu/SeoPlanningSuggestions";
import { SeoPlanningWritingBrief } from "@/components/sidhu/SeoPlanningWritingBrief";
import { SeoPlanningImageBrief } from "@/components/sidhu/SeoPlanningImageBrief";
import {
  markImagePromptStale,
  SeoPlanningImagePrompt,
  type ImagePromptUiState,
} from "@/components/sidhu/SeoPlanningImagePrompt";
import {
  markWritingPromptStale,
  SeoPlanningWritingPrompt,
  type WritingPromptUiState,
} from "@/components/sidhu/SeoPlanningWritingPrompt";
import {
  buildWritingBrief,
  SEO_PLANNING_WRITING_PROMPT_DIRTY_MESSAGE,
  type WritingArticleContext,
} from "@/lib/cms/seo-planning/writing-brief";
import {
  buildImageBrief,
  SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE,
} from "@/lib/cms/seo-planning/image-brief";
import { Banner, Field, TextArea, TextInput, inputClass } from "@/components/sidhu/fields";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { StickyEditorBar } from "@/components/sidhu/ui/StickyEditorBar";
import { Button } from "@/components/sidhu/ui/Button";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function recommendationLabel(value: string) {
  return value.replaceAll("_", " ");
}

function workflowLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function intentLabel(value: string) {
  return value.replaceAll("_", " ");
}

type FormState = {
  topic: string;
  workingTitle: string;
  searchIntent: string;
  humanNotes: string;
  workflowStatus: SeoPlanningWorkflowStatus;
};

function formFromDraft(draft: SeoPlanningDraft): FormState {
  return {
    topic: draft.topic,
    workingTitle: draft.workingTitle,
    searchIntent: draft.searchIntent || "INFORMATIONAL",
    humanNotes: readWorkspaceHumanNotes(draft.payload),
    workflowStatus: draft.workflowStatus,
  };
}

export function SeoPlanningDetail({
  draft: initialDraft,
  targetPostTitle,
  writingArticle = { status: "skipped" },
  geminiBlogPromptConfigured = false,
  openaiBlogPromptConfigured = false,
  geminiImagePromptConfigured = false,
  initialWritingPromptState = {
    gemini: { status: "none", cache: null },
    openai: { status: "none", cache: null },
    selected: null,
  },
  initialImagePromptState = { status: "none", cache: null },
}: {
  draft: SeoPlanningDraft;
  targetPostTitle: string | null;
  writingArticle?: WritingArticleContext;
  geminiBlogPromptConfigured?: boolean;
  openaiBlogPromptConfigured?: boolean;
  geminiImagePromptConfigured?: boolean;
  initialWritingPromptState?: WritingPromptUiState;
  initialImagePromptState?: ImagePromptUiState;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [form, setForm] = useState<FormState>(() => formFromDraft(initialDraft));
  const [savedForm, setSavedForm] = useState<FormState>(() => formFromDraft(initialDraft));
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [suggestionBusy, setSuggestionBusy] = useState(false);
  const [writingPromptState, setWritingPromptState] =
    useState<WritingPromptUiState>(initialWritingPromptState);
  const [imagePromptState, setImagePromptState] =
    useState<ImagePromptUiState>(initialImagePromptState);
  const [pending, startTransition] = useTransition();
  const controlsLocked = pending || suggestionBusy;

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);
  const writingBrief = useMemo(
    () => buildWritingBrief(draft, writingArticle),
    [draft, writingArticle],
  );
  const imageBrief = useMemo(
    () => buildImageBrief(draft, writingArticle),
    [draft, writingArticle],
  );

  const contentWorkflow = isContentPlanningRecommendation(draft.recommendation);
  const internalLink = isInternalLinkPlanningRecommendation(draft.recommendation);
  const transitions = contentWorkflow ? allowedSeoPlanningTransitions(form.workflowStatus) : [];

  const payload = asRecord(draft.payload) || {};
  const opportunity = asRecord(payload.opportunity) || {};
  const sources = Array.isArray(payload.sources) ? (payload.sources as SeoResearchSource[]) : [];
  const gscEvidence = Array.isArray(opportunity.gscEvidence)
    ? (opportunity.gscEvidence as SeoResearchGscEvidence[])
    : [];
  const gscMeta = asRecord(payload.gsc);

  function saveWithWorkflow(nextWorkflow: SeoPlanningWorkflowStatus) {
    if (pending || suggestionBusy) return;
    setMessage(null);
    const payloadInput = {
      id: draft.id,
      topic: form.topic,
      workingTitle: form.workingTitle,
      searchIntent: form.searchIntent,
      humanNotes: form.humanNotes,
      workflowStatus: nextWorkflow,
    };
    startTransition(async () => {
      const result: SaveSeoPlanningWorkspaceResult =
        await saveSeoPlanningWorkspaceAction(payloadInput);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setDraft(result.draft);
      const nextForm = formFromDraft(result.draft);
      setForm(nextForm);
      setSavedForm(nextForm);
      setWritingPromptState((prev) => markWritingPromptStale(prev));
      setImagePromptState((prev) => markImagePromptStale(prev));
      setMessage({ tone: "ok", text: "Planning draft saved. Still private — nothing was published." });
    });
  }

  function adoptSuggestionDraft(next: SeoPlanningDraft) {
    const nextForm = formFromDraft(next);
    setDraft(next);
    setForm(nextForm);
    setSavedForm(nextForm);
    setWritingPromptState((prev) => markWritingPromptStale(prev));
    setImagePromptState((prev) => markImagePromptStale(prev));
  }

  return (
    <div className="space-y-5 pb-24">
      <SectionCard className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-amber-900 uppercase">
          Private planning draft · Not published
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide uppercase">
          <span className="rounded-md border border-line bg-paper px-2 py-1 text-ink">
            {recommendationLabel(draft.recommendation)}
          </span>
          <span className="rounded-md border border-line bg-paper px-2 py-1 text-ink">
            {workflowLabel(form.workflowStatus)}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-ink">{form.workingTitle || "Untitled plan"}</h2>
        <p className="text-sm text-muted">{form.topic}</p>
        <p className="text-xs text-muted">Updated {formatUpdated(draft.updatedAt)}</p>
      </SectionCard>

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <SectionCard className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Target</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {draft.recommendation === "NEW_BLOG" ? (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Proposed slug</dt>
              <dd className="mt-1 break-all text-ink">
                {draft.proposedSlug ? `/blogs/${draft.proposedSlug}/` : "—"}
              </dd>
            </div>
          ) : null}
          {draft.recommendation === "REFRESH_EXISTING" ? (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Current article</dt>
              <dd className="mt-1 break-all text-ink">
                {targetPostTitle || "—"}
                {draft.matchedPublicUrl ? (
                  <span className="mt-0.5 block text-xs text-muted">{draft.matchedPublicUrl}</span>
                ) : null}
              </dd>
            </div>
          ) : null}
          {draft.recommendation === "RESTORE_HISTORICAL" ? (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Restore path</dt>
              <dd className="mt-1 break-all text-ink">{draft.restorePath || "—"}</dd>
            </div>
          ) : null}
          {draft.recommendation === "INTERNAL_LINK_ONLY" ? (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Link target</dt>
              <dd className="mt-1 break-all text-ink">
                {targetPostTitle || draft.matchedPublicUrl || "—"}
                {draft.matchedPublicUrl && targetPostTitle ? (
                  <span className="mt-0.5 block text-xs text-muted">{draft.matchedPublicUrl}</span>
                ) : null}
              </dd>
            </div>
          ) : null}
        </dl>
      </SectionCard>

      <SectionCard className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Planning</h3>
        <Field label="Topic">
          <TextInput
            value={form.topic}
            onChange={(event) => setForm({ ...form, topic: event.target.value })}
            maxLength={160}
            disabled={controlsLocked}
          />
        </Field>
        <Field label="Working title">
          <TextInput
            value={form.workingTitle}
            onChange={(event) => setForm({ ...form, workingTitle: event.target.value })}
            maxLength={180}
            disabled={controlsLocked}
          />
        </Field>
        <Field label="Search intent">
          <select
            className={inputClass}
            value={form.searchIntent}
            disabled={controlsLocked}
            onChange={(event) => setForm({ ...form, searchIntent: event.target.value })}
          >
            {SEO_RESEARCH_INTENTS.map((intent) => (
              <option key={intent} value={intent}>
                {intentLabel(intent)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Human notes" hint="Private planning notes only. Not published.">
          <TextArea
            value={form.humanNotes}
            onChange={(event) => setForm({ ...form, humanNotes: event.target.value })}
            maxLength={4000}
            rows={6}
            disabled={controlsLocked}
          />
        </Field>
      </SectionCard>

      <SeoPlanningSuggestions
        draft={draft}
        blocked={dirty || controlsLocked}
        unsavedWorkspace={dirty}
        onBusy={setSuggestionBusy}
        onDraft={adoptSuggestionDraft}
        onMessage={setMessage}
      />

      <SeoPlanningWritingBrief
        brief={writingBrief}
        dirty={dirty}
        dirtyMessage={SEO_PLANNING_WRITING_PROMPT_DIRTY_MESSAGE}
      />

      <SeoPlanningWritingPrompt
        planningDraftId={draft.id}
        geminiBlogPromptConfigured={geminiBlogPromptConfigured}
        openaiBlogPromptConfigured={openaiBlogPromptConfigured}
        providerEligible={writingBrief.providerEligible}
        providerIneligibleReason={writingBrief.providerIneligibleReason}
        dirty={dirty}
        state={writingPromptState}
        onState={setWritingPromptState}
        onDraft={setDraft}
        onMessage={setMessage}
      />

      <SeoPlanningImageBrief
        brief={imageBrief}
        dirty={dirty}
        dirtyMessage={SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE}
      />

      <SeoPlanningImagePrompt
        planningDraftId={draft.id}
        geminiImagePromptConfigured={geminiImagePromptConfigured}
        providerEligible={imageBrief.providerEligible}
        providerIneligibleReason={imageBrief.providerIneligibleReason}
        dirty={dirty}
        state={imagePromptState}
        onState={setImagePromptState}
        onDraft={setDraft}
        onMessage={setMessage}
      />

      <SectionCard className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Workflow</h3>
        {internalLink ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-ink">Internal-link planning task</p>
            <p className="text-muted">
              Status stays Planning. Link-task completion workflow comes later. Still private — nothing is
              published.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-xs font-semibold tracking-wide text-muted uppercase">Current</span>
              <span className="mt-1 block font-medium text-ink">{workflowLabel(form.workflowStatus)}</span>
            </p>
            {form.workflowStatus === "READY_TO_PUBLISH" ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                Still private — this does not publish anything.
              </p>
            ) : null}
            {transitions.length ? (
              <div className="flex flex-wrap gap-2">
                {transitions.map((to) => (
                  <Button
                    key={to}
                    type="button"
                    variant="secondary"
                    className="min-h-10"
                    disabled={controlsLocked}
                    onClick={() => saveWithWorkflow(to)}
                  >
                    {seoPlanningTransitionButtonLabel(form.workflowStatus, to)}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-muted">No workflow moves available from this status.</p>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard className="space-y-3 text-sm">
        <h3 className="text-sm font-semibold text-ink">Evidence snapshot</h3>
        <p className="text-xs text-muted">Read-only opportunity evidence from Proceed. Not editable.</p>
        {opportunity.whyNow ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Why now</p>
            <p className="mt-1 text-ink">{String(opportunity.whyNow)}</p>
          </div>
        ) : null}
        {opportunity.webEvidence ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Web evidence</p>
            <p className="mt-1 text-ink">{String(opportunity.webEvidence)}</p>
          </div>
        ) : null}
        {opportunity.suggestedAngle ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Suggested angle</p>
            <p className="mt-1 text-ink">{String(opportunity.suggestedAngle)}</p>
          </div>
        ) : null}
        {opportunity.nextStep ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Next step</p>
            <p className="mt-1 text-ink">{String(opportunity.nextStep)}</p>
          </div>
        ) : null}
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Confidence</p>
          <p className="mt-1 text-ink">{String(opportunity.confidence || "—")}</p>
        </div>
        {gscMeta ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">GSC run meta</p>
            <p className="mt-1 text-ink">{String(gscMeta.statusLabel || gscMeta.status || "—")}</p>
            {gscMeta.helperText ? (
              <p className="mt-0.5 text-xs text-muted">{String(gscMeta.helperText)}</p>
            ) : null}
          </div>
        ) : null}
        {gscEvidence.length ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              GSC evidence ({gscEvidence.length})
            </p>
            {gscEvidence.map((row) => (
              <div key={row.id} className="rounded-md border border-line px-3 py-2 text-xs text-muted">
                <p className="font-semibold text-ink">
                  {row.id} · {row.kind}
                  {row.classification ? ` · ${row.classification}` : ""}
                </p>
                {row.normalizedPath || row.pageUrl ? (
                  <p className="mt-0.5 break-all">{row.normalizedPath || row.pageUrl}</p>
                ) : null}
                <p className="mt-0.5">
                  Clicks {row.clicks} · Impressions {row.impressions} · CTR {(row.ctr * 100).toFixed(1)}% · Pos{" "}
                  {row.position.toFixed(1)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">No linked GSC evidence stored on this planning draft.</p>
        )}
        {sources.length ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              Sources ({sources.length})
            </p>
            <ul className="mt-1 space-y-1 text-xs text-muted">
              {sources.map((source) => (
                <li key={source.url} className="break-all">
                  {source.title || source.domain || source.url}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SectionCard>

      <StickyEditorBar
        title={form.workingTitle || "Planning draft"}
        dirty={dirty}
        saving={controlsLocked}
        saveLabel="Save planning draft"
        onSave={() => saveWithWorkflow(form.workflowStatus)}
      />
    </div>
  );
}
