"use client";

import { useRef, useState, useTransition } from "react";
import {
  generateChatgptImagePromptWithGeminiAction,
  generateChatgptImagePromptWithOpenAiAction,
} from "@/lib/cms/seo-planning-actions";
import { SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE } from "@/lib/cms/seo-planning/image-brief";
import type {
  ImagePromptCacheEntry,
  ImagePromptCacheStatus,
  ImagePromptProvider,
} from "@/lib/cms/seo-planning/image-prompt-cache";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { Button } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

export type ImagePromptProviderUi = {
  status: ImagePromptCacheStatus;
  cache: ImagePromptCacheEntry | null;
};

export type ImagePromptUiState = {
  gemini: ImagePromptProviderUi;
  openai: ImagePromptProviderUi;
  selected: ImagePromptProvider | null;
};

export function markImagePromptStale(state: ImagePromptUiState): ImagePromptUiState {
  function markOne(entry: ImagePromptProviderUi): ImagePromptProviderUi {
    if (!entry.cache) return { status: "none", cache: null };
    if (entry.status === "unusable") return entry;
    return { status: "stale", cache: entry.cache };
  }
  return {
    gemini: markOne(state.gemini),
    openai: markOne(state.openai),
    selected: state.selected,
  };
}

function providerLabel(provider: ImagePromptProvider) {
  return provider === "gemini" ? "Gemini" : "OpenAI";
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
  openaiImagePromptConfigured,
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
  openaiImagePromptConfigured: boolean;
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
  const [pendingProvider, setPendingProvider] = useState<ImagePromptProvider | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  const selected = state.selected;
  const selectedEntry = selected ? state[selected] : null;
  const showPrompt = Boolean(selectedEntry?.cache?.chatgptImagePrompt);
  const copyEnabled =
    Boolean(selected) &&
    selectedEntry?.status === "current" &&
    Boolean(selectedEntry.cache?.chatgptImagePrompt) &&
    !dirty &&
    !pending;

  function generateEnabled(provider: ImagePromptProvider) {
    const configured =
      provider === "gemini" ? geminiImagePromptConfigured : openaiImagePromptConfigured;
    return configured && providerEligible && !dirty && !pending;
  }

  function runGenerate(provider: ImagePromptProvider) {
    if (!generateEnabled(provider) || inFlight.current) return;
    const entry = state[provider];
    if (entry.status === "current") {
      const confirmed = window.confirm(
        `Replace the current ${providerLabel(provider)} ChatGPT image prompt with a new one?`,
      );
      if (!confirmed) return;
    }
    inFlight.current = true;
    setError(null);
    setCopyNote(null);
    onMessage(null);
    setPendingProvider(provider);
    startTransition(async () => {
      try {
        const result =
          provider === "gemini"
            ? await generateChatgptImagePromptWithGeminiAction({ planningDraftId })
            : await generateChatgptImagePromptWithOpenAiAction({ planningDraftId });
        if (!result.ok) {
          setError(result.error);
          onMessage({ tone: "error", text: result.error });
          return;
        }
        onDraft(result.draft);
        onState({
          ...state,
          [provider]: { status: "current", cache: result.cache },
          selected: provider,
        });
        setError(null);
        onMessage({
          tone: "ok",
          text: `ChatGPT image prompt generated with ${providerLabel(provider)}.`,
        });
      } finally {
        setPendingProvider(null);
        inFlight.current = false;
      }
    });
  }

  async function copyPrompt() {
    if (!copyEnabled || !selected || !selectedEntry?.cache?.chatgptImagePrompt) return;
    try {
      await navigator.clipboard.writeText(selectedEntry.cache.chatgptImagePrompt);
      setCopyNote("Copied.");
    } catch {
      setCopyNote("Select the prompt text and copy it manually.");
    }
  }

  function selectProvider(provider: ImagePromptProvider) {
    if (!state[provider].cache) return;
    setCopyNote(null);
    onState({ ...state, selected: provider });
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
      {!openaiImagePromptConfigured ? (
        <p className="text-sm text-muted">OpenAI image-prompt generation is not configured yet.</p>
      ) : null}

      {dirty ? <p className="text-sm text-amber-950">{SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE}</p> : null}

      {!providerEligible && providerIneligibleReason ? (
        <p className="text-sm text-ink">{providerIneligibleReason}</p>
      ) : null}

      {error ? <p className="text-sm text-amber-950">{error}</p> : null}

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span>
          Gemini ·{" "}
          <span className={state.gemini.status === "current" ? "font-semibold text-ink" : undefined}>
            {statusLabel(state.gemini.status)}
          </span>
        </span>
        <span>
          OpenAI ·{" "}
          <span className={state.openai.status === "current" ? "font-semibold text-ink" : undefined}>
            {statusLabel(state.openai.status)}
          </span>
        </span>
      </div>

      {(state.gemini.cache || state.openai.cache) && (
        <div className="flex flex-wrap gap-2">
          {(["gemini", "openai"] as const).map((provider) => {
            const entry = state[provider];
            if (!entry.cache) return null;
            const active = selected === provider;
            return (
              <Button
                key={provider}
                type="button"
                variant={active ? "primary" : "secondary"}
                className="min-h-8 px-3 text-xs"
                disabled={pending}
                onClick={() => selectProvider(provider)}
              >
                Show {providerLabel(provider)}
              </Button>
            );
          })}
        </div>
      )}

      {showPrompt && selected && selectedEntry?.status === "current" && !dirty ? (
        <p className="text-xs text-muted">
          Generated with {providerLabel(selected)} ·{" "}
          <span className="font-semibold text-ink">Current</span>
          {selectedEntry.cache?.model ? ` · ${selectedEntry.cache.model}` : ""}
          {selectedEntry.cache?.generatedAt ? ` · ${selectedEntry.cache.generatedAt}` : ""}
        </p>
      ) : null}

      {showPrompt &&
      selected &&
      (selectedEntry?.status === "stale" || dirty) &&
      selectedEntry?.status !== "unusable" ? (
        <p className="text-xs text-amber-950">
          Generated with {providerLabel(selected)} · <span className="font-semibold">Stale</span> —
          generate again from the current saved Image Brief.
        </p>
      ) : null}

      {showPrompt && selected && selectedEntry?.status === "unusable" ? (
        <p className="text-xs text-muted">
          A previous {providerLabel(selected)} image prompt is stored privately but is not usable now.
        </p>
      ) : null}

      {showPrompt ? (
        <textarea
          className="min-h-40 w-full rounded-md border border-line bg-white px-3 py-2 font-sans text-sm text-ink"
          readOnly
          value={selectedEntry?.cache?.chatgptImagePrompt || ""}
          aria-label="ChatGPT image prompt"
        />
      ) : (
        <p className="text-sm text-muted">No ChatGPT image prompt yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!generateEnabled("gemini")}
          className="min-h-9 px-3 text-sm"
          onClick={() => runGenerate("gemini")}
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
          {pending && pendingProvider === "gemini"
            ? "Generating with Gemini…"
            : state.gemini.status === "current"
              ? "Generate again with Gemini"
              : "Generate with Gemini"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!generateEnabled("openai")}
          className="min-h-9 px-3 text-sm"
          onClick={() => runGenerate("openai")}
          title={
            !openaiImagePromptConfigured
              ? "OpenAI image-prompt generation is not configured."
              : dirty
                ? SEO_PLANNING_IMAGE_BRIEF_DIRTY_MESSAGE
                : !providerEligible
                  ? providerIneligibleReason || "Not eligible."
                  : "Uses configured OpenAI API. One click = one request. No tools. Does not generate an image."
          }
        >
          {pending && pendingProvider === "openai"
            ? "Generating with OpenAI…"
            : state.openai.status === "current"
              ? "Generate again with OpenAI"
              : "Generate with OpenAI"}
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
              : "Copy is available for the current displayed image prompt."
          }
        >
          Copy Prompt
        </Button>
      </div>
      {copyNote ? <p className="text-xs text-muted">{copyNote}</p> : null}
    </SectionCard>
  );
}
