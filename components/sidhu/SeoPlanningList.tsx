import Link from "next/link";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { sidhuButtonClass } from "@/components/sidhu/ui/Button";

function recommendationLabel(value: string) {
  return value.replaceAll("_", " ");
}

function effectiveTarget(draft: SeoPlanningDraft) {
  if (draft.recommendation === "NEW_BLOG") {
    return draft.proposedSlug ? `/blogs/${draft.proposedSlug}/` : "—";
  }
  if (draft.recommendation === "REFRESH_EXISTING") {
    return draft.matchedPublicUrl || draft.targetPostId || "—";
  }
  if (draft.recommendation === "RESTORE_HISTORICAL") {
    return draft.restorePath || "—";
  }
  if (draft.recommendation === "INTERNAL_LINK_ONLY") {
    return draft.matchedPublicUrl || draft.topic || "—";
  }
  return "—";
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SeoPlanningList({ drafts }: { drafts: SeoPlanningDraft[] }) {
  return (
    <div className="space-y-5">
      <SectionCard className="space-y-2">
        <h2 className="text-lg font-semibold text-ink">SEO Planning</h2>
        <p className="text-sm text-muted">
          Private planning drafts created from Opportunities. Nothing here is published.
        </p>
      </SectionCard>

      {!drafts.length ? (
        <SectionCard padding="sm">
          <p className="text-sm text-muted">
            No planning drafts yet. Research UK opportunities, then use Proceed with this.
          </p>
        </SectionCard>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-paper/60 text-xs font-semibold tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-2">Title / topic</th>
                <th className="px-3 py-2">Recommendation</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft) => (
                <tr key={draft.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-3 align-top">
                    <p className="font-medium text-ink">{draft.workingTitle || "Untitled plan"}</p>
                    <p className="text-xs text-muted">{draft.topic}</p>
                  </td>
                  <td className="px-3 py-3 align-top text-ink">{recommendationLabel(draft.recommendation)}</td>
                  <td className="px-3 py-3 align-top text-ink">{draft.workflowStatus.replaceAll("_", " ")}</td>
                  <td className="max-w-[220px] break-all px-3 py-3 align-top text-muted">
                    {effectiveTarget(draft)}
                  </td>
                  <td className="px-3 py-3 align-top text-muted">{formatUpdated(draft.updatedAt)}</td>
                  <td className="px-3 py-3 align-top text-right">
                    <Link
                      href={`/sidhu/seo/planning/${draft.id}/`}
                      className={sidhuButtonClass("secondary", "min-h-9 text-sm")}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
