"use client";

import { useRef, useState, useTransition } from "react";
import { generateChatgptImagePromptWithGeminiAction } from "@/lib/cms/seo-planning-actions";
import { SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE } from "@/lib/cms/seo-planning/image-brief";
import type {
  ImagePromptCacheEntry,
  ImagePromptCacheStatus,
} from "@/lib/cms/seo-planning/image-prompt-cache";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { Button } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

export type ImagePromptUiState = {
  status: ImagePromptCacheStatus;
  cache: ImagePromptCacheEntry | null;
};

export function markImagePromptStale(state: ImagePromptUiState): ImagePromptUiState {
  if (!state.cache) return { status: "none", cache: null };
  if (state.status === "unusable") return state;
  return { status: "stale", cache: state.cache };
}

function statusLabel(status: ImagePromptCacheStatus) {
  if (status === "current") return "Current";
  if (status === "stale") return "Stale";
  if (status === "unusable") return "Stored";
  return "None";
}

export function SeoPlanningImagePrompt({
  planningDraftId,
  geminiImagePromptConfigured,
  providerEligible,
  providerIneligibleReason,
  dirty,
  state,
  onState,
  onDraft,
  onMessage,
}: {
  planningDraftId: string;
  geminiImagePromptConfigured: boolean;
  providerEligible: boolean;
  providerIneligibleReason: string;
  dirty: boolean;
  state: ImagePromptUiState;
  onState: (next: ImagePromptUiState) => void;
  onDraft: (draft: SeoPlanningDraft) => void;
  onMessage: (message: { tone: "ok" | "error"; text: string } | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  const showPrompt = Boolean(state.cache?.chatgptImagePrompt);
  const copyEnabled =
    state.status === "current" && Boolean(state.cache?.chatgptImagePrompt) && !dirty && !pending;
  const generateEnabled = geminiImagePromptConfigured && providerEligible && !dirty && !pending;

  function runGenerate() {
    if (!generateEnabled || inFlight.current) return;
    if (state.status === "current") {
      const confirmed = window.confirm(
        "Replace the current Gemini ChatGPT image prompt with a new one?",
      );
      if (!confirmed) return;
    }
    inFlight.current = true;
    setError(null);
    setCopyNote(null);
    onMessage(null);
    startTransition(async () => {
      try {
        const result = await generateChatgptImagePromptWithGeminiAction({ planningDraftId });
        if (!result.ok) {
          setError(result.error);
          onMessage({ tone: "error", text: result.error });
          return;
        }
        onDraft(result.draft);
        onState({ status: "current", cache: result.cache });
        setError(null);
        onMessage({ tone: "ok", text: "ChatGPT image prompt generated with Gemini." });
      } finally {
        inFlight.current = false;
      }
    });
  }

  async function copyPrompt() {
    if (!copyEnabled || !state.cache?.chatgptImagePrompt) return;
    try {
      await navigator.clipboard.writeText(state.cache.chatgptImagePrompt);
      setCopyNote("Copied.");
    } catch {
      setCopyNote("Select the prompt text and copy it manually.");
    }
  }

  return (
    <SectionCard className="space-y-3 text-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">ChatGPT Image Prompt</h3>
        <p className="text-xs text-muted">
          This creates a prompt for normal ChatGPT image generation. It does not generate or upload
          images.
        </p>
      </div>

      {!geminiImagePromptConfigured ? (
        <p className="text-sm text-muted">Gemini image-prompt generation is not configured yet.</p>
      ) : null}

      {dirty ? <p className="text-sm text-amber-950">{SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE}</p> : null}

      {!providerEligible && providerIneligibleReason ? (
        <p className="text-sm text-ink">{providerIneligibleReason}</p>
      ) : null}

      {error ? <p className="text-sm text-amber-950">{error}</p> : null}

      <div className="text-xs text-muted">
        Gemini ·{" "}
        <span className={state.status === "current" ? "font-semibold text-ink" : undefined}>
          {statusLabel(state.status)}
        </span>
      </div>

      {showPrompt && state.status === "current" && !dirty ? (
        <p className="text-xs text-muted">
          Generated with Gemini · <span className="font-semibold text-ink">Current</span>
          {state.cache?.model ? ` · ${state.cache.model}` : ""}
          {state.cache?.generatedAt ? ` · ${state.cache.generatedAt}` : ""}
        </p>
      ) : null}

      {showPrompt && (state.status === "stale" || dirty) && state.status !== "unusable" ? (
        <p className="text-xs text-amber-950">
          Generated with Gemini · <span className="font-semibold">Stale</span> — generate again from
          the current saved Image Brief.
        </p>
      ) : null}

      {showPrompt && state.status === "unusable" ? (
        <p className="text-xs text-muted">
          A previous Gemini image prompt is stored privately but is not usable now.
        </p>
      ) : null}

      {showPrompt ? (
        <textarea
          className="min-h-40 w-full rounded-md border border-line bg-white px-3 py-2 font-sans text-sm text-ink"
          readOnly
          value={state.cache?.chatgptImagePrompt || ""}
          aria-label="ChatGPT image prompt"
        />
      ) : (
        <p className="text-sm text-muted">No ChatGPT image prompt yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!generateEnabled}
          className="min-h-9 px-3 text-sm"
          onClick={() => runGenerate()}
          title={
            !geminiImagePromptConfigured
              ? "Gemini image-prompt generation is not configured."
              : dirty
                ? SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE
                : !providerEligible
                  ? providerIneligibleReason || "Not eligible."
                  : "Uses configured Gemini API. One click = one request. Does not generate an image."
          }
        >
          {pending
            ? "Generating with Gemini…"
            : state.status === "current"
              ? "Generate again with Gemini"
              : "Generate with Gemini"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!copyEnabled}
          className="min-h-9 px-3 text-sm"
          onClick={() => void copyPrompt()}
          title={
            copyEnabled
              ? "Copy the displayed prompt to clipboard. Does not call a provider."
              : "Copy is available for the current Gemini image prompt."
          }
        >
          Copy Prompt
        </Button>
      </div>
      {copyNote ? <p className="text-xs text-muted">{copyNote}</p> : null}
    </SectionCard>
  );
}
