"use client";

import { useState, useTransition } from "react";
import { SEO_RESEARCH_INTENTS } from "@/lib/cms/ai-seo/research-schemas";
import { updateSeoPlanningSuggestionAction } from "@/lib/cms/seo-planning-actions";
import { SEO_PLANNING_FIELD_CAPS } from "@/lib/cms/seo-planning/constants";
import {
  SEO_PLANNING_SUGGESTION_DIRTY_MESSAGE,
  SEO_PLANNING_SUGGESTION_DRIFT_MESSAGE,
  SEO_PLANNING_SUGGESTION_KEYS,
  SEO_PLANNING_SUGGESTION_READY_APPLY_MESSAGE,
  SEO_PLANNING_SUGGESTION_REPLACE_MESSAGE,
  currentSeoPlanningSuggestionValue,
  seoPlanningSuggestionDrift,
  seoPlanningSuggestionsForDisplay,
  type SeoPlanningSuggestionKey,
  type SeoPlanningSuggestionOperation,
} from "@/lib/cms/seo-planning/suggestions";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { TextArea, TextInput, inputClass } from "@/components/sidhu/fields";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { Button } from "@/components/sidhu/ui/Button";

const LABELS: Record<SeoPlanningSuggestionKey, string> = {
  workingTitle: "Working title",
  topic: "Topic",
  searchIntent: "Search intent",
  contentAngle: "Content angle",
  nextStep: "Next step",
};

type EditorMode = {
  key: SeoPlanningSuggestionKey;
  kind: "edit" | "confirm";
  draftValue: string;
};

function successText(operation: SeoPlanningSuggestionOperation): string {
  if (operation === "APPLY") {
    return "Suggestion applied to this planning draft. Still private — nothing was published.";
  }
  if (operation === "IGNORE") {
    return "Suggestion ignored. Still private — nothing was published.";
  }
  return "Suggestion updated. Still private — nothing was published.";
}

export function SeoPlanningSuggestions({
  draft,
  blocked,
  unsavedWorkspace,
  onBusy,
  onDraft,
  onMessage,
}: {
  draft: SeoPlanningDraft;
  blocked: boolean;
  unsavedWorkspace: boolean;
  onBusy: (busy: boolean) => void;
  onDraft: (draft: SeoPlanningDraft) => void;
  onMessage: (message: { tone: "ok" | "error"; text: string } | null) => void;
}) {
  const [mode, setMode] = useState<EditorMode | null>(null);
  const [busy, startTransition] = useTransition();
  const suggestions = seoPlanningSuggestionsForDisplay(draft);
  const rows = SEO_PLANNING_SUGGESTION_KEYS.flatMap((key) => {
    const suggestion = suggestions[key];
    return suggestion ? [{ key, suggestion }] : [];
  });
  const readyLocked = draft.workflowStatus === "READY_TO_PUBLISH";

  function run(
    key: SeoPlanningSuggestionKey,
    operation: SeoPlanningSuggestionOperation,
    extra: { value?: string; acknowledgeReplace?: boolean },
  ) {
    if (blocked || busy) return;
    onBusy(true);
    onMessage(null);
    const input: {
      id: string;
      key: SeoPlanningSuggestionKey;
      operation: SeoPlanningSuggestionOperation;
      value?: string;
      acknowledgeReplace?: boolean;
    } = { id: draft.id, key, operation };
    if (operation === "EDIT") input.value = extra.value;
    if (operation === "APPLY") input.acknowledgeReplace = extra.acknowledgeReplace === true;
    startTransition(async () => {
      try {
        const result = await updateSeoPlanningSuggestionAction(input);
        if (!result.ok) {
          if (result.needsReplaceConfirmation) {
            const suggestion = seoPlanningSuggestionsForDisplay(draft)[key];
            setMode({
              key,
              kind: "confirm",
              draftValue: suggestion?.value || "",
            });
            return;
          }
          onMessage({ tone: "error", text: result.error });
          return;
        }
        setMode(null);
        onDraft(result.draft);
        onMessage({ tone: "ok", text: successText(operation) });
      } finally {
        onBusy(false);
      }
    });
  }

  return (
    <SectionCard className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">Suggestions</h3>
        <p className="text-xs text-muted">
          Private suggestions from the saved research snapshot. Applying a suggestion updates this
          planning draft only.
        </p>
      </div>
      {unsavedWorkspace ? (
        <p className="text-sm text-amber-950">{SEO_PLANNING_SUGGESTION_DIRTY_MESSAGE}</p>
      ) : null}
      {!blocked && readyLocked ? (
        <p className="text-sm text-amber-950">{SEO_PLANNING_SUGGESTION_READY_APPLY_MESSAGE}</p>
      ) : null}
      {!rows.length ? (
        <p className="text-sm text-muted">No suggestions in the saved research snapshot.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ key, suggestion }) => {
            const current = currentSeoPlanningSuggestionValue(draft, key);
            const editor = mode?.key === key ? mode : null;
            const ignored = suggestion.status === "IGNORED";
            const drift = seoPlanningSuggestionDrift(draft, key, suggestion);
            const applyLocked = blocked || busy || ignored || readyLocked;

            return (
              <div key={key} className="space-y-2 rounded-md border border-line px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{LABELS[key]}</p>
                  <span className="rounded-md border border-line bg-paper px-2 py-0.5 text-xs font-semibold tracking-wide text-ink uppercase">
                    {suggestion.status}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Suggested value</p>
                    <p className="mt-1 text-sm break-words text-ink">{suggestion.value}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                      Current planning value
                    </p>
                    <p className="mt-1 text-sm break-words text-ink">{current || "—"}</p>
                  </div>
                </div>
                {drift ? <p className="text-xs text-amber-900">{SEO_PLANNING_SUGGESTION_DRIFT_MESSAGE}</p> : null}
                {editor?.kind === "edit" ? (
                  <div className="space-y-2">
                    {key === "searchIntent" ? (
                      <select
                        className={inputClass}
                        value={editor.draftValue}
                        disabled={blocked || busy}
                        onChange={(event) =>
                          setMode({ key, kind: "edit", draftValue: event.target.value })
                        }
                      >
                        {SEO_RESEARCH_INTENTS.map((intent) => (
                          <option key={intent} value={intent}>
                            {intent}
                          </option>
                        ))}
                      </select>
                    ) : key === "contentAngle" || key === "nextStep" ? (
                      <TextArea
                        value={editor.draftValue}
                        maxLength={
                          key === "contentAngle"
                            ? SEO_PLANNING_FIELD_CAPS.suggestedAngle
                            : SEO_PLANNING_FIELD_CAPS.nextStep
                        }
                        rows={3}
                        disabled={blocked || busy}
                        onChange={(event) =>
                          setMode({ key, kind: "edit", draftValue: event.target.value })
                        }
                      />
                    ) : (
                      <TextInput
                        value={editor.draftValue}
                        maxLength={
                          key === "workingTitle"
                            ? SEO_PLANNING_FIELD_CAPS.workingTitle
                            : SEO_PLANNING_FIELD_CAPS.topic
                        }
                        disabled={blocked || busy}
                        onChange={(event) =>
                          setMode({ key, kind: "edit", draftValue: event.target.value })
                        }
                      />
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        className="min-h-9 text-sm"
                        disabled={blocked || busy}
                        onClick={() => run(key, "EDIT", { value: editor.draftValue })}
                      >
                        Save suggestion
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-9 text-sm"
                        disabled={busy}
                        onClick={() => setMode(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
                {editor?.kind === "confirm" ? (
                  <div className="space-y-2">
                    <p className="text-sm text-ink">{SEO_PLANNING_SUGGESTION_REPLACE_MESSAGE}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        className="min-h-9 text-sm"
                        disabled={applyLocked}
                        onClick={() => run(key, "APPLY", { acknowledgeReplace: true })}
                      >
                        Confirm replace
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-9 text-sm"
                        disabled={busy}
                        onClick={() => setMode(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
                {editor == null ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-9 text-sm"
                      disabled={applyLocked}
                      onClick={() => {
                        if (applyLocked) return;
                        if (current !== suggestion.value) {
                          setMode({ key, kind: "confirm", draftValue: suggestion.value });
                          return;
                        }
                        run(key, "APPLY", { acknowledgeReplace: false });
                      }}
                    >
                      Apply
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-9 text-sm"
                      disabled={blocked || busy || ignored}
                      onClick={() => {
                        if (blocked || busy || ignored) return;
                        setMode({ key, kind: "edit", draftValue: suggestion.value });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-9 text-sm"
                      disabled={blocked || busy || ignored}
                      onClick={() => {
                        if (blocked || busy || ignored) return;
                        run(key, "IGNORE", {});
                      }}
                    >
                      Ignore
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
