"use client";

import type { PrePublishIssue, PrePublishQaResult } from "@/lib/cms/seo-prepublish-qa-types";
import { Banner } from "@/components/sidhu/fields";
import { Button } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

function IssueList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "blocker" | "warning";
  items: PrePublishIssue[];
}) {
  if (!items.length) return null;
  const cls =
    tone === "blocker"
      ? "border-red-200 bg-red-50 text-red-950"
      : "border-amber-200 bg-amber-50 text-amber-950";
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={`${item.code}-${item.field || ""}-${item.message}`}
            className={`rounded-md border px-3 py-2 text-sm ${cls}`}
          >
            <p className="font-medium">{item.message}</p>
            {item.field ? <p className="mt-0.5 text-xs opacity-80">Field: {item.field}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SeoPrePublishQaPanel({
  result,
  pending,
  onPublishAnyway,
}: {
  result: PrePublishQaResult | null;
  pending?: boolean;
  onPublishAnyway?: () => void;
}) {
  if (!result || result.mode === "skip") return null;
  if (result.status === "pass" && !result.warnings.length && !result.blockers.length) return null;

  if (result.status === "blocked") {
    return (
      <SectionCard className="space-y-3 border-red-200">
        <h3 className="text-sm font-semibold text-ink">Pre-Publish SEO QA</h3>
        <Banner tone="error">Publishing was blocked. Fix the issues below, then save again.</Banner>
        <IssueList title="Blockers" tone="blocker" items={result.blockers} />
        <IssueList title="Warnings" tone="warning" items={result.warnings} />
      </SectionCard>
    );
  }

  if (result.status === "warnings" && result.confirmationRequired) {
    return (
      <SectionCard className="space-y-3 border-amber-200">
        <h3 className="text-sm font-semibold text-ink">Pre-Publish SEO QA</h3>
        <Banner tone="info">
          Warnings need a deliberate confirmation. Review them, then choose Publish Anyway if you still
          want to publish this exact candidate.
        </Banner>
        <IssueList title="Warnings" tone="warning" items={result.warnings} />
        {onPublishAnyway ? (
          <Button type="button" variant="primary" disabled={pending} onClick={onPublishAnyway}>
            {pending ? "Publishing…" : "Publish Anyway"}
          </Button>
        ) : null}
      </SectionCard>
    );
  }

  if (result.warnings.length) {
    return (
      <SectionCard className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Pre-Publish SEO QA</h3>
        <p className="text-sm text-muted">Saved with the warnings below noted for review.</p>
        <IssueList title="Warnings" tone="warning" items={result.warnings} />
      </SectionCard>
    );
  }

  return null;
}
