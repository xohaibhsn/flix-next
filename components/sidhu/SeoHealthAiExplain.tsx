"use client";

import { useState, useTransition } from "react";
import type { SeoExplainFindingInput, SeoExplainResult } from "@/lib/cms/ai-seo/schemas";

export type SeoHealthAiExplainActionResult =
  | { ok: true; explanation: SeoExplainResult }
  | { ok: false; error: string; code?: string; configured?: boolean };

export function SeoHealthAiExplain({
  finding,
  configured,
  explainAction,
}: {
  finding: SeoExplainFindingInput;
  configured: boolean;
  explainAction?: (input: SeoExplainFindingInput) => Promise<SeoHealthAiExplainActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<SeoExplainResult | null>(null);
  const [pending, startTransition] = useTransition();

  function runExplain() {
    if (pending) return;
    setOpen(true);
    setError(null);
    if (!configured) {
      setExplanation(null);
      setError("Sidhu AI SEO Assistant is not configured yet.");
      return;
    }
    if (!explainAction) {
      setExplanation(null);
      setError("AI explanation is temporarily unavailable.");
      return;
    }
    startTransition(async () => {
      const result = await explainAction(finding);
      if (!result.ok) {
        setExplanation(null);
        setError(result.error);
        return;
      }
      setError(null);
      setExplanation(result.explanation);
    });
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={runExplain}
        className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-semibold text-ink disabled:opacity-60"
      >
        {pending ? "Sidhu AI is explaining…" : "Explain with Sidhu AI"}
      </button>

      {open ? (
        <div className="mt-3 rounded-md border border-line bg-paper px-3 py-3 text-sm text-ink">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Sidhu AI explanation</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={runExplain}
                className="text-xs font-semibold text-brand hover:underline disabled:opacity-60"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                  setExplanation(null);
                }}
                className="text-xs font-semibold text-muted hover:underline"
              >
                Close
              </button>
            </div>
          </div>

          {pending && !explanation && !error ? (
            <p className="mt-2 text-muted">Preparing a plain-language explanation…</p>
          ) : null}

          {error ? <p className="mt-2 text-amber-900">{error}</p> : null}

          {explanation ? (
            <dl className="mt-3 space-y-3">
              <div>
                <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Summary</dt>
                <dd className="mt-1 leading-relaxed">{explanation.summary}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Why it matters</dt>
                <dd className="mt-1 leading-relaxed">{explanation.whyItMatters}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Recommended next step</dt>
                <dd className="mt-1 leading-relaxed">{explanation.recommendedNextStep}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold tracking-wide text-muted uppercase">What not to do</dt>
                <dd className="mt-1 leading-relaxed">{explanation.whatNotToDo}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
