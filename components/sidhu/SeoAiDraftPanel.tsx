"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { DraftSeoTitleMetaResult } from "@/lib/cms/ai-seo/draft";
import {
  seoAiProviderLabel,
  type SeoAiProvider,
} from "@/lib/cms/ai-seo/provider-type";
import type { SeoDraftInput, SeoDraftResult } from "@/lib/cms/ai-seo/schemas";
import { Button, sidhuButtonClass } from "@/components/sidhu/ui/Button";
import { cn } from "@/components/sidhu/ui/cn";

export type SeoAiDraftActionInput = SeoDraftInput & { provider: SeoAiProvider };

export type SeoAiDraftActionResult = DraftSeoTitleMetaResult & {
  openaiConfigured?: boolean;
  geminiConfigured?: boolean;
  configured?: boolean;
};

export function SeoAiDraftPanel({
  context,
  draftAction,
  openaiConfigured = false,
  geminiConfigured = false,
  onUseTitle,
  onUseDescription,
}: {
  context: SeoDraftInput;
  draftAction: (input: SeoAiDraftActionInput) => Promise<SeoAiDraftActionResult>;
  openaiConfigured?: boolean;
  geminiConfigured?: boolean;
  onUseTitle: (value: string) => void;
  onUseDescription: (value: string) => void;
}) {
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SeoDraftResult | null>(null);
  const [lastProvider, setLastProvider] = useState<SeoAiProvider | null>(null);
  const [appliedTitle, setAppliedTitle] = useState<string | null>(null);
  const [appliedDescription, setAppliedDescription] = useState<string | null>(null);
  const [undoTitle, setUndoTitle] = useState<string | null>(null);
  const [undoDescription, setUndoDescription] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const anyConfigured = openaiConfigured || geminiConfigured;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openDrawer() {
    setOpen(true);
  }

  function closeDrawer() {
    setOpen(false);
  }

  function runDraft(provider: SeoAiProvider) {
    if (pending) return;
    setOpen(true);
    setError(null);
    setDraft(null);
    setLastProvider(null);
    setAppliedTitle(null);
    setAppliedDescription(null);
    setUndoTitle(null);
    setUndoDescription(null);
    const providerReady = provider === "gemini" ? geminiConfigured : openaiConfigured;
    if (!providerReady) {
      setError("Sidhu AI SEO Assistant is not configured yet.");
      return;
    }
    startTransition(async () => {
      const result = await draftAction({ ...context, provider });
      if (!result.ok) {
        setDraft(null);
        setLastProvider(null);
        setError(result.error);
        return;
      }
      setError(null);
      setDraft(result.draft);
      setLastProvider(result.provider);
    });
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-paper px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Sidhu AI SEO Assistant</p>
          <p className="mt-0.5 text-xs text-muted">
            Opens a compact assistant. Drafting is deliberate — Save is still required.
          </p>
        </div>
        <button
          type="button"
          className={sidhuButtonClass("secondary", "min-h-9 text-sm")}
          onClick={openDrawer}
        >
          Ask Sidhu AI
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Close Sidhu AI assistant"
            onClick={closeDrawer}
          />
          <aside
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Sidhu AI SEO Assistant"
            className={cn(
              "relative flex h-full w-full max-w-md flex-col border-l border-line bg-admin-surface shadow-none",
              "animate-none",
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">Sidhu AI SEO Assistant</p>
                <p className="mt-0.5 text-xs text-muted">Title and description options for this editor.</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
                aria-label="Close Sidhu AI assistant"
                onClick={closeDrawer}
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
              <section className="space-y-2 rounded-lg border border-line bg-paper p-3">
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">Current</p>
                <div>
                  <p className="text-xs text-muted">Title</p>
                  <p className="text-ink">{context.currentTitle || "(blank — fallback title may be used)"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Description</p>
                  <p className="text-ink">
                    {context.currentDescription || "(blank — fallback description may be used)"}
                  </p>
                </div>
              </section>

              {!draft && !pending && !error ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted">
                    Generate three title and three description options. Choose Gemini or OpenAI deliberately —
                    one click is one request.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending || !geminiConfigured}
                      onClick={() => runDraft("gemini")}
                      title={geminiConfigured ? "Uses configured Gemini API." : "Gemini is not configured."}
                    >
                      Draft with Gemini
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending || !openaiConfigured}
                      onClick={() => runDraft("openai")}
                      title={
                        openaiConfigured
                          ? "Uses configured OpenAI API and may incur API usage."
                          : "OpenAI is not configured."
                      }
                    >
                      Draft with OpenAI
                    </Button>
                  </div>
                  {!anyConfigured ? (
                    <p className="text-xs text-muted">Sidhu AI SEO Assistant is not configured yet.</p>
                  ) : null}
                </div>
              ) : null}

              {pending && !draft && !error ? (
                <p className="text-muted">Sidhu AI is drafting…</p>
              ) : null}

              {error ? (
                <div className="space-y-2">
                  <p className="text-amber-900">{error}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending || !geminiConfigured}
                      onClick={() => runDraft("gemini")}
                    >
                      Draft with Gemini
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending || !openaiConfigured}
                      onClick={() => runDraft("openai")}
                    >
                      Draft with OpenAI
                    </Button>
                  </div>
                </div>
              ) : null}

              {draft ? (
                <div className="space-y-5">
                  {lastProvider ? (
                    <p className="text-xs text-muted">Generated with {seoAiProviderLabel(lastProvider)}</p>
                  ) : null}

                  <details className="rounded-md border border-line bg-paper px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-ink">Guidance</summary>
                    <p className="mt-2 text-xs leading-relaxed text-muted">{draft.guidance}</p>
                  </details>

                  <section>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Titles</p>
                    <ul className="mt-2 space-y-2">
                      {draft.titles.map((option) => (
                        <li key={`title:${option.value}`} className="rounded-md border border-line px-3 py-2">
                          <p className="font-medium text-ink">{option.value}</p>
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-muted">Why?</summary>
                            <p className="mt-1 text-xs text-muted">{option.reason}</p>
                          </details>
                          <button
                            type="button"
                            className="mt-2 text-xs font-semibold text-ink underline-offset-2 hover:underline"
                            onClick={() => {
                              setUndoTitle(context.currentTitle || "");
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
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-800">
                        <span>AI suggestion applied — not saved. Save the editor to keep it.</span>
                        {undoTitle !== null ? (
                          <button
                            type="button"
                            className="font-semibold text-muted underline-offset-2 hover:underline"
                            onClick={() => {
                              onUseTitle(undoTitle);
                              setAppliedTitle(null);
                              setUndoTitle(null);
                            }}
                          >
                            Undo
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                  <section>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Descriptions</p>
                    <ul className="mt-2 space-y-2">
                      {draft.descriptions.map((option) => (
                        <li key={`desc:${option.value}`} className="rounded-md border border-line px-3 py-2">
                          <p className="font-medium text-ink">{option.value}</p>
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-muted">Why?</summary>
                            <p className="mt-1 text-xs text-muted">{option.reason}</p>
                          </details>
                          <button
                            type="button"
                            className="mt-2 text-xs font-semibold text-ink underline-offset-2 hover:underline"
                            onClick={() => {
                              setUndoDescription(context.currentDescription || "");
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
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-800">
                        <span>AI suggestion applied — not saved. Save the editor to keep it.</span>
                        {undoDescription !== null ? (
                          <button
                            type="button"
                            className="font-semibold text-muted underline-offset-2 hover:underline"
                            onClick={() => {
                              onUseDescription(undoDescription);
                              setAppliedDescription(null);
                              setUndoDescription(null);
                            }}
                          >
                            Undo
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                  <div className="space-y-2 border-t border-line pt-3">
                    <p className="text-xs text-muted">Generate again — choose the provider deliberately.</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending || !geminiConfigured}
                        onClick={() => runDraft("gemini")}
                        className="text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-60"
                      >
                        {pending ? "Generating…" : "Generate again with Gemini"}
                      </button>
                      <button
                        type="button"
                        disabled={pending || !openaiConfigured}
                        onClick={() => runDraft("openai")}
                        className="text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-60"
                      >
                        {pending ? "Generating…" : "Generate again with OpenAI"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
