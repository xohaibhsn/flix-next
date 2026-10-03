"use client";

import { useState, useTransition } from "react";
import type { DraftSeoTitleMetaResult } from "@/lib/cms/ai-seo/draft";
import type { SeoDraftInput, SeoDraftResult } from "@/lib/cms/ai-seo/schemas";

export type SeoAiDraftActionResult = DraftSeoTitleMetaResult & { configured?: boolean };

export function SeoAiDraftPanel({
  context,
  draftAction,
  onUseTitle,
  onUseDescription,
}: {
  context: SeoDraftInput;
  draftAction: (input: SeoDraftInput) => Promise<SeoAiDraftActionResult>;
  onUseTitle: (value: string) => void;
  onUseDescription: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SeoDraftResult | null>(null);
  const [appliedTitle, setAppliedTitle] = useState<string | null>(null);
  const [appliedDescription, setAppliedDescription] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runDraft() {
    if (pending) return;
    setOpen(true);
    setError(null);
    setDraft(null);
    setAppliedTitle(null);
    setAppliedDescription(null);
    startTransition(async () => {
      const result = await draftAction(context);
      if (!result.ok) {
        setDraft(null);
        setError(result.error);
        return;
      }
      setError(null);
      setDraft(result.draft);
    });
  }

  return (
    <div className="mt-3 rounded-md border border-line bg-paper px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">Sidhu AI SEO Assistant</p>
          <p className="mt-0.5 text-xs text-muted">
            Draft title and description options. Choosing one fills the form only — Save is still required.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={runDraft}
          className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-60"
        >
          {pending ? "Sidhu AI is drafting…" : "Draft with Sidhu AI"}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3 text-sm text-ink">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={runDraft}
              className="text-xs font-semibold text-brand hover:underline disabled:opacity-60"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
                setDraft(null);
                setAppliedTitle(null);
                setAppliedDescription(null);
              }}
              className="text-xs font-semibold text-muted hover:underline"
            >
              Close
            </button>
          </div>

          {pending && !draft && !error ? (
            <p className="text-muted">Preparing title and description drafts…</p>
          ) : null}

          {error ? <p className="text-amber-900">{error}</p> : null}

          {draft ? (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-muted">{draft.guidance}</p>

              <div>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">Current title</p>
                <p className="mt-1 text-sm text-ink">{context.currentTitle || "(blank — fallback title may be used)"}</p>
                <p className="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">Title suggestions</p>
                <ul className="mt-2 space-y-2">
                  {draft.titles.map((option) => (
                    <li key={`title:${option.value}`} className="rounded-md border border-line bg-white px-3 py-2">
                      <p className="font-medium">{option.value}</p>
                      <p className="mt-1 text-xs text-muted">{option.reason}</p>
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-brand hover:underline"
                        onClick={() => {
                          onUseTitle(option.value);
                          setAppliedTitle(option.value);
                        }}
                      >
                        Use this title
                      </button>
                    </li>
                  ))}
                </ul>
                {appliedTitle ? (
                  <p className="mt-2 text-xs text-emerald-800">
                    Unsaved title set to “{appliedTitle}”. Save the editor to keep it.
                  </p>
                ) : null}
              </div>

              <div>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">Current description</p>
                <p className="mt-1 text-sm text-ink">
                  {context.currentDescription || "(blank — fallback description may be used)"}
                </p>
                <p className="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">Description suggestions</p>
                <ul className="mt-2 space-y-2">
                  {draft.descriptions.map((option) => (
                    <li key={`desc:${option.value}`} className="rounded-md border border-line bg-white px-3 py-2">
                      <p className="font-medium">{option.value}</p>
                      <p className="mt-1 text-xs text-muted">{option.reason}</p>
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-brand hover:underline"
                        onClick={() => {
                          onUseDescription(option.value);
                          setAppliedDescription(option.value);
                        }}
                      >
                        Use this description
                      </button>
                    </li>
                  ))}
                </ul>
                {appliedDescription ? (
                  <p className="mt-2 text-xs text-emerald-800">
                    Unsaved description set. Save the editor to keep it.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
