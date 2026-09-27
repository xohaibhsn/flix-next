import { AdminShell } from "@/components/sidhu/AdminShell";
import { MediaLibrary } from "@/components/sidhu/MediaLibrary";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { referencedMediaIds } from "@/lib/cms/media-refs";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuMediaPage() {
  const [assets, settings, posts, categories, cloud] = await Promise.all([
    cms.listMedia(),
    cms.getSettings(),
    cms.listPosts(),
    cms.listCategories(),
    getCloudinaryStatusAction(),
  ]);
  const usedIds = referencedMediaIds(settings, posts, categories);

  return (
      <AdminShell title="Media" subtitle="Edit alt text on existing images without re-uploading. Upload Image is still the primary add action. In-use images cannot be deleted until they are unassigned.">
      <MediaLibrary
        configured={cloud.configured}
        initialAssets={assets.map((asset) => ({ ...asset, inUse: usedIds.has(asset.id) }))}
      />
    </AdminShell>
  );
}
