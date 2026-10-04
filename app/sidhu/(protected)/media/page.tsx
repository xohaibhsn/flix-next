import { AdminShell } from "@/components/sidhu/AdminShell";
import { MediaLibrary } from "@/components/sidhu/MediaLibrary";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { getMediaUsageById } from "@/lib/cms/media-refs";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuMediaPage() {
  const [assets, settings, pages, posts, categories, cloud] = await Promise.all([
    cms.listMedia(),
    cms.getSettings(),
    cms.listPages(),
    cms.listPosts(),
    cms.listCategories(),
    getCloudinaryStatusAction(),
  ]);
  const usageById = getMediaUsageById(assets, { settings, pages, posts, categories });

  return (
    <AdminShell
      title="Media"
      subtitle="Edit alt text on existing images without re-uploading. Upload Image is still the primary add action. In-use images cannot be deleted until they are unassigned."
      breadcrumbs={[{ label: "Content" }, { label: "Media" }]}
    >
      <MediaLibrary
        configured={cloud.configured}
        initialAssets={assets.map((asset) => {
          const usage = usageById.get(asset.id) || { inUse: false, references: [] };
          return {
            ...asset,
            inUse: usage.inUse,
            usageCount: usage.references.length,
            usageReferences: usage.references.slice(0, 8),
          };
        })}
      />
    </AdminShell>
  );
}
