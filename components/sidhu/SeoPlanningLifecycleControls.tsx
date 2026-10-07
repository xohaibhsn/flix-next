"use client";

import { useState, useTransition } from "react";
import {
  archiveSeoPlanningDraftAction,
  deleteSeoPlanningDraftPermanentlyAction,
  restoreSeoPlanningDraftAction,
} from "@/lib/cms/seo-planning-actions";
import { seoPlanningPermanentDeleteConfirmToken } from "@/lib/cms/seo-planning/lifecycle";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { Banner } from "@/components/sidhu/fields";
import { Button } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

function navigatePlanning(href: string) {
  window.location.assign(href);
}

export function SeoPlanningLifecycleControls({
  draft,
  archived,
}: {
  draft: SeoPlanningDraft;
  archived: boolean;
}) {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function archive() {
    if (pending) return;
    const title = draft.workingTitle || draft.id;
    if (
      !window.confirm(
        `Archive “${title}”?\n\nIt will leave Active Planning and can be restored later.\nBlogPost, Media, and public pages are not affected.`,
      )
    ) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await archiveSeoPlanningDraftAction({ id: draft.id });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      navigatePlanning("/sidhu/seo/planning/?view=archived");
    });
  }

  function restore() {
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await restoreSeoPlanningDraftAction({ id: draft.id });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      navigatePlanning(`/sidhu/seo/planning/${draft.id}/`);
    });
  }

  function permanentDelete() {
    if (pending) return;
    const token = seoPlanningPermanentDeleteConfirmToken(draft);
    if (
      !window.confirm(
        `Permanently delete planning draft “${token}”?\n\nOnly this private Planning record will be removed.\nThe target BlogPost, Media, and public URL are NOT deleted.\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    const typed = window.prompt(
      `Type the draft title exactly to confirm permanent delete:\n\n${token}`,
    );
    if (typed == null) return;
    setMessage(null);
    startTransition(async () => {
      const result = await deleteSeoPlanningDraftPermanentlyAction({
        id: draft.id,
        confirmation: typed,
      });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      navigatePlanning("/sidhu/seo/planning/?view=archived");
    });
  }

  return (
    <SectionCard className="space-y-3">
      <h3 className="text-sm font-semibold text-ink">Lifecycle</h3>
      {archived ? (
        <div className="space-y-3 text-sm">
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
            Archived — read-only. Restore to edit, change workflow, or generate prompts. Permanent
            delete removes only this private Planning record.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={pending} onClick={restore}>
              Restore
            </Button>
            <Button type="button" variant="danger" disabled={pending} onClick={permanentDelete}>
              Delete Permanently
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            Archive removes this draft from the Active Planning list. Evidence, workspace values, and
            prompt caches are kept. BlogPost and Media are never deleted.
          </p>
          <Button type="button" variant="secondary" disabled={pending} onClick={archive}>
            Archive
          </Button>
        </div>
      )}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
    </SectionCard>
  );
}
