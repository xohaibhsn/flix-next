"use client";

import { useMemo } from "react";
import {
  buildSeoPlanningEditorialReadinessChecklist,
  type EditorialReadinessItemStatus,
} from "@/lib/cms/seo-planning/editorial-readiness";
import type { WritingArticleContext } from "@/lib/cms/seo-planning/writing-brief";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

function statusLabel(status: EditorialReadinessItemStatus) {
  if (status === "ok") return "OK";
  if (status === "hold") return "HOLD";
  if (status === "blocked") return "BLOCKED";
  if (status === "absent") return "ABSENT";
  return "INFO";
}

function statusClass(status: EditorialReadinessItemStatus) {
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (status === "hold") return "border-amber-200 bg-amber-50 text-amber-950";
  if (status === "blocked") return "border-red-200 bg-red-50 text-red-950";
  if (status === "absent") return "border-line bg-paper text-muted";
  return "border-line bg-paper text-ink";
}

export function SeoPlanningEditorialReadinessChecklist({
  draft,
  writingArticle = { status: "skipped" },
  aiArticleGenerationEnabled = false,
  openaiBlogArticleConfigured = false,
}: {
  draft: SeoPlanningDraft;
  writingArticle?: WritingArticleContext;
  aiArticleGenerationEnabled?: boolean;
  openaiBlogArticleConfigured?: boolean;
}) {
  const checklist = useMemo(
    () =>
      buildSeoPlanningEditorialReadinessChecklist({
        draft,
        writingArticle,
        aiArticleGenerationEnabled,
        openaiBlogArticleConfigured,
      }),
    [draft, writingArticle, aiArticleGenerationEnabled, openaiBlogArticleConfigured],
  );

  return (
    <SectionCard className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">
          Editorial Readiness Checklist{" "}
          <span className="font-normal text-muted">(read-only)</span>
        </h3>
        <p className="text-xs text-muted">
          Derived from stored Planning data and existing eligibility helpers. Not a publish
          approval. Does not duplicate Blog Pre-Publish QA.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-semibold tracking-wide uppercase">
        <span className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-950">
          AI Apply: unavailable
        </span>
        <span className="rounded-md border border-line bg-paper px-2 py-1 text-ink">
          Autonomous Publishing: {checklist.autonomousPublishing}
        </span>
        <span className="rounded-md border border-line bg-paper px-2 py-1 text-ink">
          Scheduler: {checklist.scheduler}
        </span>
      </div>

      <ul className="space-y-2">
        {checklist.items.map((item) => (
          <li
            key={item.id}
            className={`rounded-md border px-3 py-2 text-sm ${statusClass(item.status)}`}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs font-semibold tracking-wide uppercase">
                {statusLabel(item.status)}
              </span>
              <span className="font-medium">{item.label}</span>
            </div>
            <p className="mt-1 text-xs opacity-90">{item.detail}</p>
          </li>
        ))}
      </ul>

      <div className="space-y-1 text-xs text-muted">
        <p className="font-semibold tracking-wide text-ink uppercase">Important distinctions</p>
        <ul className="list-disc space-y-0.5 pl-4">
          {checklist.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted">
        No Apply, Publish, Schedule, or bypass controls on this checklist.
      </p>
    </SectionCard>
  );
}
