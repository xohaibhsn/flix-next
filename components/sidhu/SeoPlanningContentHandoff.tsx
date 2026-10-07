"use client";

import { useState, useTransition } from "react";
import { handoffSeoPlanningToBlogAction } from "@/lib/cms/seo-planning-actions";
import { isInternalLinkPlanningRecommendation } from "@/lib/cms/seo-planning/workspace";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { Banner } from "@/components/sidhu/fields";
import { Button } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

function navigateEditor(href: string) {
  window.location.assign(href);
}

export function SeoPlanningContentHandoff({
  draft,
  archived,
}: {
  draft: SeoPlanningDraft;
  archived: boolean;
}) {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const recommendation = draft.recommendation;
  const linkedPostId = String(draft.linkedPostId || "").trim();

  if (archived) {
    return (
      <SectionCard className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Content Handoff</h3>
        <p className="text-sm text-muted">
          Restore this planning draft before opening or creating a Blog editor handoff.
        </p>
      </SectionCard>
    );
  }

  if (isInternalLinkPlanningRecommendation(recommendation)) {
    return (
      <SectionCard className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Content Handoff</h3>
        <p className="text-sm text-muted">
          Internal-link plans do not create or edit articles. Use the future Internal Link workflow
          instead.
        </p>
      </SectionCard>
    );
  }

  if (recommendation === "RESTORE_HISTORICAL") {
    return (
      <SectionCard className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Content Handoff</h3>
        <p className="text-sm text-muted">
          Historical restore needs a separate recovery review before article creation. Content
          Handoff is not available for this plan yet.
        </p>
      </SectionCard>
    );
  }

  if (recommendation !== "REFRESH_EXISTING" && recommendation !== "NEW_BLOG") {
    return (
      <SectionCard className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Content Handoff</h3>
        <p className="text-sm text-muted">
          Content Handoff is not available for this planning recommendation.
        </p>
      </SectionCard>
    );
  }

  const isRefresh = recommendation === "REFRESH_EXISTING";
  const hasLinkedDraft = !isRefresh && Boolean(linkedPostId);
  const buttonLabel = isRefresh
    ? "Open in Blog Editor"
    : hasLinkedDraft
      ? "Open Blog Draft"
      : "Create Blog Draft";
  const supportText = isRefresh
    ? "Opens the existing article in the Blog editor. Does not overwrite content, slug, media, or publication status. You edit and save as usual."
    : hasLinkedDraft
      ? "Reopens the private Blog draft already linked to this plan. Does not publish and does not create a duplicate."
      : "Creates one private Blog draft only (not published), then opens the existing Blog editor. Writing prompts are not imported as article body.";

  function runHandoff() {
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await handoffSeoPlanningToBlogAction({ planningDraftId: draft.id });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      navigateEditor(result.editorPath);
    });
  }

  return (
    <SectionCard className="space-y-3">
      <h3 className="text-sm font-semibold text-ink">Content Handoff</h3>
      <p className="text-sm text-muted">{supportText}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" disabled={pending} onClick={runHandoff}>
          {pending ? "Opening…" : buttonLabel}
        </Button>
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
    </SectionCard>
  );
}
