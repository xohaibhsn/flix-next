import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { CategoryEditor } from "@/components/sidhu/CategoryEditor";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { getSeoAiProviderAvailability } from "@/lib/cms/ai-seo/config";
import { cms } from "@/lib/cms/repository";
import { logServerError } from "@/lib/security/errors";

export const dynamic = "force-dynamic";

export default async function SidhuEditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let category;
  let assets;
  let cloud;
  let settings;
  try {
    const [categories, media, cloudStatus, siteSettings] = await Promise.all([
      cms.listCategories(),
      cms.listMedia(),
      getCloudinaryStatusAction(),
      cms.getSettings(),
    ]);
    category = categories.find((item) => item.id === id) ?? null;
    assets = media;
    cloud = cloudStatus;
    settings = siteSettings;
  } catch (error) {
    logServerError("sidhu:category-edit", error);
    throw error;
  }
  if (!category) notFound();
  const aiProviders = getSeoAiProviderAvailability();
  return (
    <AdminShell title="Edit category" subtitle="Content and RankMath-style SEO for this category archive.">
      <CategoryEditor
        category={category}
        assets={assets}
        configured={cloud.configured}
        openaiConfigured={aiProviders.openaiConfigured}
        geminiConfigured={aiProviders.geminiConfigured}
        siteName={settings.siteName}
        siteTagline={settings.tagline}
        defaultOgImage={settings.branding.defaultOgImage}
      />
    </AdminShell>
  );
}
