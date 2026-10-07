import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoPlanningDetail } from "@/components/sidhu/SeoPlanningDetail";
import {
  isGeminiBlogPromptConfigured,
  isGeminiImagePromptConfigured,
  isOpenAiBlogPromptConfigured,
} from "@/lib/cms/ai-seo/config";
import { cms } from "@/lib/cms/repository";
import { buildImageBrief } from "@/lib/cms/seo-planning/image-brief";
import { fingerprintImageBrief } from "@/lib/cms/seo-planning/image-fingerprint";
import {
  imagePromptCacheStatus,
  readGeminiImagePromptCache,
} from "@/lib/cms/seo-planning/image-prompt-cache";
import { buildWritingBrief } from "@/lib/cms/seo-planning/writing-brief";
import { buildWritingArticleContext } from "@/lib/cms/seo-planning/writing-context";
import { fingerprintWritingBrief } from "@/lib/cms/seo-planning/writing-fingerprint";
import {
  readGeminiWritingPromptCache,
  readOpenAiWritingPromptCache,
  selectInitialWritingPromptProvider,
  writingPromptCacheStatus,
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
  const openaiCache = readOpenAiWritingPromptCache(draft.payload);
  const geminiStatus = writingPromptCacheStatus({
    entry: geminiCache,
    currentFingerprint: writingFingerprint,
    providerEligible: writingBrief.providerEligible,
  });
  const openaiStatus = writingPromptCacheStatus({
    entry: openaiCache,
    currentFingerprint: writingFingerprint,
    providerEligible: writingBrief.providerEligible,
  });
  const selected = selectInitialWritingPromptProvider({
    gemini: { entry: geminiCache, status: geminiStatus },
    openai: { entry: openaiCache, status: openaiStatus },
  });

  const imageBrief = buildImageBrief(draft, writingArticle);
  const imageFingerprint = fingerprintImageBrief(imageBrief);
  const geminiImageCache = readGeminiImagePromptCache(draft.payload);
  const geminiImageStatus = imagePromptCacheStatus({
    entry: geminiImageCache,
    currentFingerprint: imageFingerprint,
    providerEligible: imageBrief.providerEligible,
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
          openaiBlogPromptConfigured={isOpenAiBlogPromptConfigured()}
          geminiImagePromptConfigured={isGeminiImagePromptConfigured()}
          initialWritingPromptState={{
            gemini: { status: geminiStatus, cache: geminiCache },
            openai: { status: openaiStatus, cache: openaiCache },
            selected,
          }}
          initialImagePromptState={{
            status: geminiImageStatus,
            cache: geminiImageCache,
          }}
        />
      </SeoModuleChrome>
    </AdminShell>
  );
}
