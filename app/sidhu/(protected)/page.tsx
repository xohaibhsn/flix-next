import Link from "next/link";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { cms } from "@/lib/cms/repository";
import { getCloudinaryStatusAction, getSystemStatusAction } from "@/lib/cms/actions";

export const dynamic = "force-dynamic";

export default async function SidhuDashboardPage() {
  const [stats, cloud, system] = await Promise.all([
    cms.dashboardStats(),
    getCloudinaryStatusAction(),
    getSystemStatusAction(),
  ]);
  const status = system.ok
    ? system
    : {
        database: false,
        cloudinary: false,
        adminAuth: false,
        environment: "unknown",
        version: "0.1.0",
      };

  return (
    <AdminShell title="Dashboard" subtitle="CMS overview only. No revenue, orders, or ERP widgets.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pages" value={String(stats.pages)} />
        <Stat label="Blog posts" value={String(stats.posts)} />
        <Stat label="Drafts" value={String(stats.drafts)} />
        <Stat label="Published posts" value={String(stats.publishedPosts)} />
        <Stat label="FAQs" value={String(stats.faqs)} />
        <Stat label="Pricing plans" value={String(stats.plans)} />
        <Stat label="Media" value={String(stats.media)} />
        <Stat label="Redirects" value={String(stats.redirects)} />
      </div>
      <div className="mt-6 rounded-xl border border-line bg-white p-5">
        <p className="text-sm font-semibold">Cloudinary</p>
        <p className="mt-2 text-sm text-muted">
          Cloud name: {cloud.cloudName}. Status: {cloud.configured ? "configured" : "API key/secret missing"}
        </p>
      </div>
      <div className="mt-6 rounded-xl border border-line bg-white p-5">
        <p className="text-sm font-semibold">System / Security</p>
        <p className="mt-1 text-xs text-muted">Safe status only. Secrets are never shown here.</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Database</dt>
            <dd>{status.database ? "Configured" : "Not configured"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Cloudinary</dt>
            <dd>{status.cloudinary ? "Configured" : "Not configured"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Admin auth</dt>
            <dd>{status.adminAuth ? "Active" : "Not configured"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Environment</dt>
            <dd>{status.environment}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">App version</dt>
            <dd>{status.version}</dd>
          </div>
        </dl>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/sidhu/pages/home/" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
          Edit Home
        </Link>
        <Link href="/sidhu/blog/new/" className="rounded-md border border-line bg-white px-4 py-2 text-sm">
          New blog post
        </Link>
        <Link href="/sidhu/media/" className="rounded-md border border-line bg-white px-4 py-2 text-sm">
          Media
        </Link>
        <Link href="/sidhu/seo/" className="rounded-md border border-line bg-white px-4 py-2 text-sm">
          SEO
        </Link>
        <Link href="/sidhu/redirects/" className="rounded-md border border-line bg-white px-4 py-2 text-sm">
          Redirects
        </Link>
        <Link href="/sidhu/settings/" className="rounded-md border border-line bg-white px-4 py-2 text-sm">
          Site Settings
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
