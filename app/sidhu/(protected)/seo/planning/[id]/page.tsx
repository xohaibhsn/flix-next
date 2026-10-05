import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoPlanningDetail } from "@/components/sidhu/SeoPlanningDetail";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoPlanningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draft = await cms.getSeoPlanningDraftById(id);
  if (!draft) notFound();

  const targetPost = draft.targetPostId ? await cms.getPostById(draft.targetPostId) : null;

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[
        { label: "SEO", href: "/sidhu/seo/" },
        { label: "Planning", href: "/sidhu/seo/planning/" },
        { label: draft.workingTitle || "Draft" },
      ]}
    >
      <SeoModuleChrome>
        <SeoPlanningDetail draft={draft} targetPostTitle={targetPost?.title || null} />
      </SeoModuleChrome>
    </AdminShell>
  );
}
