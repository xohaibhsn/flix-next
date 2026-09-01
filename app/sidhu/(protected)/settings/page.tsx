import { AdminShell } from "@/components/sidhu/AdminShell";
import { SiteSettingsForm } from "@/components/sidhu/SiteSettingsForm";
import { cms } from "@/lib/cms/repository";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";

export const dynamic = "force-dynamic";

export default async function SidhuSettingsPage() {
  const [settings, assets, cloud] = await Promise.all([
    cms.getSettings(),
    cms.listMedia(),
    getCloudinaryStatusAction(),
  ]);

  return (
    <AdminShell
      title="Site Settings"
      subtitle="Global site name, tagline, logo, favicon, default Open Graph image, and public head scripts. The Home Hero heading is edited under Pages → Home."
    >
      <SiteSettingsForm
        settings={settings}
        configured={cloud.configured}
        cloudName={cloud.cloudName}
        initialAssets={assets}
      />
    </AdminShell>
  );
}
