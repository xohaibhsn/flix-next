import Link from "next/link";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { cms } from "@/lib/cms/repository";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";

export const dynamic = "force-dynamic";

export default async function SidhuDashboardPage() {
  const pages = await cms.listPages();
  const home = await cms.getPageBySlug("/");
  const media = await cms.listMedia();
  const cloud = await getCloudinaryStatusAction();
  const visible = home?.sections.filter((section) => section.visible).length ?? 0;
  const hidden = home?.sections.filter((section) => !section.visible).length ?? 0;

  return (
    <AdminShell title="Dashboard" subtitle="Local CMS overview. No revenue, orders, or ERP widgets.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pages" value={String(pages.length)} />
        <Stat label="Home sections" value={String(home?.sections.length ?? 0)} />
        <Stat label="Visible / hidden" value={`${visible} / ${hidden}`} />
        <Stat label="Media assets" value={String(media.length)} />
      </div>
      <div className="mt-6 rounded-xl border border-line bg-white p-5">
        <p className="text-sm font-semibold">Cloudinary</p>
        <p className="mt-2 text-sm text-muted">
          Cloud name: {cloud.cloudName}. Status: {cloud.configured ? "configured" : "API key/secret missing"}
        </p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/sidhu/pages/home/" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
          Edit Home page
        </Link>
        <Link href="/sidhu/settings/" className="rounded-md border border-line bg-white px-4 py-2 text-sm">
          Site settings
        </Link>
        <Link href="/sidhu/media/" className="rounded-md border border-line bg-white px-4 py-2 text-sm">
          Media library
        </Link>
        <Link href="/" className="rounded-md border border-line bg-white px-4 py-2 text-sm">
          View website
        </Link>
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
