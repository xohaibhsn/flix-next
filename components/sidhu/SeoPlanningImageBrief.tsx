"use client";

import type { ImageBrief } from "@/lib/cms/seo-planning/image-brief";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

function show(value: string, empty: string) {
  return value.trim() ? value : empty;
}

function dispositionLabel(value: ImageBrief["existingFeaturedDisposition"]) {
  if (value === "create_new") return "Create new featured image";
  if (value === "review_existing") return "Review existing featured image";
  if (value === "missing_needs_image") return "Featured image missing — needed";
  if (value === "none_needed_internal_link") return "Not needed for internal-link planning";
  return value;
}

function workflowNote(brief: ImageBrief) {
  if (brief.taskType === "INTERNAL_LINK_ONLY") {
    return "Internal-link planning does not use a featured Image Brief.";
  }
  if (brief.workflowStatus === "CONTENT_NEEDED") {
    return "Preview only — move this plan to Image Needed before the future image-prompt phase.";
  }
  if (brief.workflowStatus === "IMAGE_NEEDED" && brief.providerEligible) {
    return "Ready for the future image-prompt phase (featured blog image).";
  }
  if (brief.providerIneligibleReason) {
    return brief.providerIneligibleReason;
  }
  return "";
}

export function SeoPlanningImageBrief({
  brief,
  dirty,
  dirtyMessage,
}: {
  brief: ImageBrief;
  dirty: boolean;
  dirtyMessage: string;
}) {
  const note = workflowNote(brief);

  return (
    <SectionCard className="space-y-3 text-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">Image Brief</h3>
        <p className="text-xs text-muted">
          Read-only featured-image brief derived from the saved plan. It does not generate or upload
          images.
        </p>
      </div>
      {dirty ? <p className="text-sm text-amber-950">{dirtyMessage}</p> : null}
      {note ? <p className="text-sm text-ink">{note}</p> : null}
      {brief.taskType === "INTERNAL_LINK_ONLY" ? null : (
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Purpose</dt>
            <dd className="mt-1 text-ink">Featured blog image</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Topic</dt>
            <dd className="mt-1 text-ink">{show(brief.topic, "Not set")}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Working title</dt>
            <dd className="mt-1 text-ink">{show(brief.workingTitle, "Not set")}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Visual subject</dt>
            <dd className="mt-1 text-ink">{show(brief.visualSubject, "Not set")}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Visual concept</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{show(brief.visualConcept, "Not set")}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Target size</dt>
            <dd className="mt-1 text-ink">
              {brief.recommendedAspectRatio} · {brief.recommendedSourceSize}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Social reuse</dt>
            <dd className="mt-1 text-muted">{brief.ogReuseNote}</dd>
          </div>
          {brief.taskType === "REFRESH_EXISTING" ? (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
                Current featured image
              </dt>
              <dd className="mt-1 text-ink">
                {brief.existingFeaturedImage === "present"
                  ? "Present"
                  : brief.existingFeaturedImage === "absent"
                    ? "Absent"
                    : "Unavailable"}
                {brief.articleTitle ? ` · ${brief.articleTitle}` : ""}
                {brief.articleCategory ? ` · ${brief.articleCategory}` : ""}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Disposition</dt>
            <dd className="mt-1 text-ink">{dispositionLabel(brief.existingFeaturedDisposition)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
              Text in image
            </dt>
            <dd className="mt-1 text-ink">No baked-in title or URL text</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Avoid</dt>
            <dd className="mt-1">
              <ul className="list-disc space-y-1 pl-4 text-ink">
                {brief.avoid.slice(0, 4).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      )}
    </SectionCard>
  );
}
