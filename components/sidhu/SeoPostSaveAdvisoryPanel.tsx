"use client";

import Link from "next/link";
import type { SeoPostSaveAdvisory, SeoPostSaveFinding } from "@/lib/cms/seo-post-save-guard";

function severityLabel(severity: SeoPostSaveFinding["severity"]) {
  if (severity === "needs-attention") return "Needs attention";
  if (severity === "review") return "Review";
  return "Editorial suggestion";
}

function severityClass(severity: SeoPostSaveFinding["severity"]) {
  if (severity === "needs-attention") return "border-amber-300 bg-amber-50 text-amber-950";
  if (severity === "review") return "border-sky-200 bg-sky-50 text-sky-950";
  return "border-line bg-paper text-ink";
}

export function SeoPostSaveAdvisoryPanel({
  advisory,
  compact = false,
}: {
  advisory: SeoPostSaveAdvisory | null | undefined;
  compact?: boolean;
}) {
  if (!advisory) return null;

  if (advisory.status === "unavailable") {
    return (
      <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-muted">
        <p className="font-semibold text-ink">SEO check after save</p>
        <p className="mt-1">{advisory.message}</p>
      </div>
    );
  }

  if (advisory.status === "healthy") {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <p className="font-semibold">SEO check after save</p>
        <p className="mt-1">✓ {advisory.message}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line bg-admin-surface px-3 py-3 text-sm text-ink">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">SEO check after save</p>
        <Link href={advisory.healthHref} className="text-xs font-semibold text-ink underline-offset-2 hover:underline">
          Open SEO Health
        </Link>
      </div>
      <p className="mt-1 text-muted">{advisory.message}</p>
      {compact ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-muted">
            {advisory.findings.length} finding{advisory.findings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-2">
            {advisory.findings.map((finding) => (
              <li
                key={`${finding.issueCode}-${finding.field}-${finding.title}`}
                className={`rounded-md border px-3 py-2 ${severityClass(finding.severity)}`}
              >
                <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
                  {severityLabel(finding.severity)}
                </p>
                <p className="mt-1 font-medium">{finding.title}</p>
                <p className="mt-0.5 text-xs opacity-90">{finding.explanation}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <ul className="mt-3 space-y-2">
          {advisory.findings.map((finding) => (
            <li
              key={`${finding.issueCode}-${finding.field}-${finding.title}`}
              className={`rounded-md border px-3 py-2 ${severityClass(finding.severity)}`}
            >
              <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
                {severityLabel(finding.severity)}
              </p>
              <p className="mt-1 font-medium">{finding.title}</p>
              <p className="mt-0.5 text-xs opacity-90">{finding.explanation}</p>
              <p className="mt-1 text-xs opacity-80">Field: {finding.field}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
