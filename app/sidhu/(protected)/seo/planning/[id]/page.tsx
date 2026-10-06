import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoPlanningDetail } from "@/components/sidhu/SeoPlanningDetail";
import { isGeminiBlogPromptConfigured } from "@/lib/cms/ai-seo/config";
import { cms } from "@/lib/cms/repository";
import { buildWritingBrief } from "@/lib/cms/seo-planning/writing-brief";
import { buildWritingArticleContext } from "@/lib/cms/seo-planning/writing-context";
import { fingerprintWritingBrief } from "@/lib/cms/seo-planning/writing-fingerprint";
import {
  geminiWritingPromptCacheStatus,
  readGeminiWritingPromptCache,
} from "@/lib/cms/seo-planning/writing-prompt-cache";

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
  const categories = draft.recommendation === "REFRESH_EXISTING" ? await cms.listCategories() : [];
  const writingArticle = buildWritingArticleContext({ draft, targetPost, categories });
  const writingBrief = buildWritingBrief(draft, writingArticle);
  const writingFingerprint = fingerprintWritingBrief(writingBrief);
  const geminiCache = readGeminiWritingPromptCache(draft.payload);
  const writingPromptStatus = geminiWritingPromptCacheStatus({
    entry: geminiCache,
    currentFingerprint: writingFingerprint,
    providerEligible: writingBrief.providerEligible,
  });

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
        <SeoPlanningDetail
          draft={draft}
          targetPostTitle={targetPost?.title || null}
          writingArticle={writingArticle}
          geminiBlogPromptConfigured={isGeminiBlogPromptConfigured()}
          initialWritingPromptState={{ status: writingPromptStatus, cache: geminiCache }}
        />
      </SeoModuleChrome>
    </AdminShell>
  );
}
