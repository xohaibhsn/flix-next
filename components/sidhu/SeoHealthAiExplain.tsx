"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/sidhu/ui/Button";
import {
  seoAiProviderLabel,
  type SeoAiProvider,
} from "@/lib/cms/ai-seo/provider-type";
import type { SeoExplainFindingInput, SeoExplainResult } from "@/lib/cms/ai-seo/schemas";

export type SeoHealthAiExplainActionInput = SeoExplainFindingInput & {
  provider: SeoAiProvider;
};

export type SeoHealthAiExplainActionResult =
  | { ok: true; explanation: SeoExplainResult; provider: SeoAiProvider }
  | {
      ok: false;
      error: string;
      code?: string;
      openaiConfigured?: boolean;
      geminiConfigured?: boolean;
      configured?: boolean;
    };

export function SeoHealthAiExplain({
  finding,
  openaiConfigured = false,
  geminiConfigured = false,
  explainAction,
}: {
  finding: SeoExplainFindingInput;
  openaiConfigured?: boolean;
  geminiConfigured?: boolean;
  explainAction?: (input: SeoHealthAiExplainActionInput) => Promise<SeoHealthAiExplainActionResult>;
}) {
  const anyConfigured = openaiConfigured || geminiConfigured;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<SeoExplainResult | null>(null);
  const [lastProvider, setLastProvider] = useState<SeoAiProvider | null>(null);
  const [pending, startTransition] = useTransition();

  function runExplain(provider: SeoAiProvider) {
    if (pending) return;
    setOpen(true);
    setError(null);
    const providerReady = provider === "gemini" ? geminiConfigured : openaiConfigured;
    if (!providerReady) {
      setExplanation(null);
      setLastProvider(null);
      setError("Sidhu AI SEO Assistant is not configured yet.");
      return;
    }
    if (!explainAction) {
      setExplanation(null);
      setLastProvider(null);
      setError("AI explanation is temporarily unavailable.");
      return;
    }
    startTransition(async () => {
      const result = await explainAction({ ...finding, provider });
      if (!result.ok) {
        setExplanation(null);
        setLastProvider(null);
        setError(result.error);
        return;
      }
      setError(null);
      setExplanation(result.explanation);
      setLastProvider(result.provider);
    });
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !geminiConfigured}
          className="min-h-9 px-3 text-sm"
          onClick={() => runExplain("gemini")}
          title={geminiConfigured ? "Uses configured Gemini API." : "Gemini is not configured."}
        >
          {pending ? "Sidhu AI is explaining…" : "Explain with Gemini"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !openaiConfigured}
          className="min-h-9 px-3 text-sm"
          onClick={() => runExplain("openai")}
          title={
            openaiConfigured
              ? "Uses configured OpenAI API and may incur API usage."
              : "OpenAI is not configured."
          }
        >
          {pending ? "Sidhu AI is explaining…" : "Explain with OpenAI"}
        </Button>
      </div>
      {!anyConfigured ? (
        <p className="mt-2 text-xs text-muted">Sidhu AI SEO Assistant is not configured yet.</p>
      ) : null}

      {open ? (
        <div className="mt-3 rounded-md border border-line bg-paper px-3 py-3 text-sm text-ink">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Sidhu AI explanation</p>
              {lastProvider ? (
                <p className="mt-0.5 text-xs text-muted">Generated with {seoAiProviderLabel(lastProvider)}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {lastProvider ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  className="min-h-8 px-2 text-xs"
                  onClick={() => runExplain(lastProvider)}
                >
                  Try again with {seoAiProviderLabel(lastProvider)}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending || !geminiConfigured}
                    className="min-h-8 px-2 text-xs"
                    onClick={() => runExplain("gemini")}
                  >
                    Try again with Gemini
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending || !openaiConfigured}
                    className="min-h-8 px-2 text-xs"
                    onClick={() => runExplain("openai")}
                  >
                    Try again with OpenAI
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                className="min-h-8 px-2 text-xs"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                  setExplanation(null);
                  setLastProvider(null);
                }}
              >
                Close
              </Button>
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
