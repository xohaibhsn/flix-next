import Link from "next/link";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { cms } from "@/lib/cms/repository";
import { getCloudinaryStatusAction, getSystemStatusAction } from "@/lib/cms/actions";
import { getAdminSession } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

const SHORTCUTS: Array<{ href: string; label: string; permission: Permission; primary?: boolean }> = [
  { href: "/sidhu/pages/home/", label: "Edit Home", permission: "pages", primary: true },
  { href: "/sidhu/blog/new/", label: "New blog post", permission: "blog" },
  { href: "/sidhu/media/", label: "Media", permission: "media" },
  { href: "/sidhu/seo/", label: "SEO", permission: "seo" },
  { href: "/sidhu/redirects/", label: "Redirects", permission: "redirects" },
  { href: "/sidhu/settings/", label: "Site Settings", permission: "site_settings" },
];

export default async function SidhuDashboardPage() {
  const [stats, cloud, system, session] = await Promise.all([
    cms.dashboardStats(),
    getCloudinaryStatusAction(),
    getSystemStatusAction(),
    getAdminSession(),
  ]);
  const shortcuts = SHORTCUTS.filter(
    (item) => session && hasPermission(session.role, session.permissions, item.permission),
  );
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
        {shortcuts.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              item.primary
                ? "rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
                : "rounded-md border border-line bg-white px-4 py-2 text-sm"
            }
          >
            {item.label}
          </Link>
        ))}
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
