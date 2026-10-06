"use client";

import { useState, useTransition } from "react";
import { generateChatgptWritingPromptWithGeminiAction } from "@/lib/cms/seo-planning-actions";
import { SEO_PLANNING_WRITING_PROMPT_DIRTY_MESSAGE } from "@/lib/cms/seo-planning/writing-brief";
import type {
  WritingPromptCacheEntry,
  WritingPromptCacheStatus,
} from "@/lib/cms/seo-planning/writing-prompt-cache";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { Button } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

export type WritingPromptUiState = {
  status: WritingPromptCacheStatus;
  cache: WritingPromptCacheEntry | null;
};

export function markWritingPromptStale(state: WritingPromptUiState): WritingPromptUiState {
  if (!state.cache) return { status: "none", cache: null };
  if (state.status === "unusable") return state;
  return { status: "stale", cache: state.cache };
}

export function SeoPlanningWritingPrompt({
  planningDraftId,
  geminiBlogPromptConfigured,
  providerEligible,
  providerIneligibleReason,
  dirty,
  state,
  onState,
  onDraft,
  onMessage,
}: {
  planningDraftId: string;
  geminiBlogPromptConfigured: boolean;
  providerEligible: boolean;
  providerIneligibleReason: string;
  dirty: boolean;
  state: WritingPromptUiState;
  onState: (next: WritingPromptUiState) => void;
  onDraft: (draft: SeoPlanningDraft) => void;
  onMessage: (message: { tone: "ok" | "error"; text: string } | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const generateEnabled = geminiBlogPromptConfigured && providerEligible && !dirty && !pending;
  const showPrompt = Boolean(state.cache?.chatgptPrompt);
  const copyEnabled = showPrompt && state.status === "current" && !dirty && !pending;
  const buttonLabel =
    state.status === "current" ? "Generate again with Gemini" : "Generate with Gemini";

  function runGenerate() {
    if (!generateEnabled) return;
    if (state.status === "current") {
      const confirmed = window.confirm(
        "Replace the current Gemini ChatGPT writing prompt with a new one?",
      );
      if (!confirmed) return;
    }
    setError(null);
    setCopyNote(null);
    onMessage(null);
    startTransition(async () => {
      const result = await generateChatgptWritingPromptWithGeminiAction({
        planningDraftId,
      });
      if (!result.ok) {
        setError(result.error);
        onMessage({ tone: "error", text: result.error });
        return;
      }
      onDraft(result.draft);
      onState({ status: "current", cache: result.cache });
      setError(null);
      onMessage({ tone: "ok", text: "ChatGPT writing prompt generated with Gemini." });
    });
  }

  async function copyPrompt() {
    if (!copyEnabled || !state.cache?.chatgptPrompt) return;
    try {
      await navigator.clipboard.writeText(state.cache.chatgptPrompt);
      setCopyNote("Copied.");
    } catch {
      setCopyNote("Select the prompt text and copy it manually.");
    }
  }

  return (
    <SectionCard className="space-y-3 text-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">ChatGPT Writing Prompt</h3>
        <p className="text-xs text-muted">
          This creates a prompt for normal ChatGPT. It does not write or publish the CMS article.
        </p>
      </div>

      {!geminiBlogPromptConfigured ? (
        <p className="text-sm text-muted">Gemini writing-prompt generation is not configured yet.</p>
      ) : null}

      {dirty ? <p className="text-sm text-amber-950">{SEO_PLANNING_WRITING_PROMPT_DIRTY_MESSAGE}</p> : null}

      {!providerEligible && providerIneligibleReason ? (
        <p className="text-sm text-ink">{providerIneligibleReason}</p>
      ) : null}

      {error ? <p className="text-sm text-amber-950">{error}</p> : null}

      {showPrompt && state.status === "current" && !dirty ? (
        <p className="text-xs text-muted">
          Generated with Gemini · <span className="font-semibold text-ink">Current</span>
        </p>
      ) : null}

      {showPrompt && (state.status === "stale" || dirty) && state.status !== "unusable" ? (
        <p className="text-xs text-amber-950">
          Generated with Gemini · <span className="font-semibold">Stale</span> — generate again from the
          current saved Writing Brief.
        </p>
      ) : null}

      {showPrompt && state.status === "unusable" ? (
        <p className="text-xs text-muted">
          A previous Gemini prompt is stored privately but is not usable now.
        </p>
      ) : null}

      {showPrompt ? (
        <textarea
          className="min-h-48 w-full rounded-md border border-line bg-white px-3 py-2 font-sans text-sm text-ink"
          readOnly
          value={state.cache?.chatgptPrompt || ""}
          aria-label="ChatGPT writing prompt"
        />
      ) : (
        <p className="text-sm text-muted">No Gemini ChatGPT writing prompt yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!generateEnabled}
          className="min-h-9 px-3 text-sm"
          onClick={runGenerate}
          title={
            !geminiBlogPromptConfigured
              ? "Gemini writing-prompt generation is not configured."
              : dirty
                ? SEO_PLANNING_WRITING_PROMPT_DIRTY_MESSAGE
                : !providerEligible
                  ? providerIneligibleReason || "Not eligible."
                  : "Uses configured Gemini API. One click = one request."
          }
        >
          {pending ? "Generating with Gemini…" : buttonLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!copyEnabled}
          className="min-h-9 px-3 text-sm"
          onClick={() => void copyPrompt()}
          title={
            copyEnabled
              ? "Copy prompt to clipboard. Does not call Gemini."
              : "Copy is available for the current prompt."
          }
        >
          Copy Prompt
        </Button>
      </div>
      {copyNote ? <p className="text-xs text-muted">{copyNote}</p> : null}
    </SectionCard>
  );
}
