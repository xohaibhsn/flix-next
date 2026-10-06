import { AdminShell } from "@/components/sidhu/AdminShell";
import { BlogEditor } from "@/components/sidhu/BlogEditor";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { getSeoAiProviderAvailability } from "@/lib/cms/ai-seo/config";
import { emptyPost } from "@/lib/cms/blog";
import { cms } from "@/lib/cms/repository";
import { logServerError } from "@/lib/security/errors";

export const dynamic = "force-dynamic";

export default async function SidhuNewPostPage() {
  const post = emptyPost();
  let categories;
  let assets;
  let cloud;
  let settings;
  try {
    categories = await cms.listCategories();
    assets = await cms.listMedia();
    cloud = await getCloudinaryStatusAction();
    settings = await cms.getSettings();
  } catch (error) {
    logServerError("sidhu:blog-new", error);
    throw error;
  }
  const aiProviders = getSeoAiProviderAvailability();
  return (
    <AdminShell title="New post" subtitle="Draft is the default. Publish when the article is ready.">
      <BlogEditor
        post={post}
        categories={categories}
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
