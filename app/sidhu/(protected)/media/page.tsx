import { AdminShell } from "@/components/sidhu/AdminShell";
import { MediaLibrary } from "@/components/sidhu/MediaLibrary";
import { cms } from "@/lib/cms/repository";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";

export const dynamic = "force-dynamic";

export default async function SidhuMediaPage() {
  const [assets, settings, cloud] = await Promise.all([
    cms.listMedia(),
    cms.getSettings(),
    getCloudinaryStatusAction(),
  ]);
  const usedIds = [
    settings.branding.logo?.id,
    settings.branding.favicon?.id,
    settings.branding.defaultOgImage?.id,
  ].filter(Boolean) as string[];

  return (
    <AdminShell title="Media" subtitle="Upload, preview, copy URL, and delete Cloudinary images. SVG is not accepted in this phase.">
      <MediaLibrary
        configured={cloud.configured}
        initialAssets={assets.map((asset) => ({ ...asset, inUse: usedIds.includes(asset.id) }))}
      />
    </AdminShell>
  );
}
