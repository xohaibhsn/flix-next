import Link from "next/link";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { DashboardSection, StatCard } from "@/components/sidhu/ui/StatCard";
import { StatusBadge } from "@/components/sidhu/ui/StatusBadge";
import { sidhuButtonClass } from "@/components/sidhu/ui/Button";
import { cms } from "@/lib/cms/repository";
import { getCloudinaryStatusAction, getSystemStatusAction } from "@/lib/cms/actions";
import { getAdminSession } from "@/lib/auth/session";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { listAdminUsers } from "@/lib/auth/admin-users";
import { isDatabaseConfigured } from "@/lib/db/config";

export const dynamic = "force-dynamic";

const QUICK_ACTIONS: Array<{ href: string; label: string; permission: Permission; primary?: boolean }> = [
  { href: "/sidhu/blog/new/", label: "New Blog Post", permission: "blog", primary: true },
  { href: "/sidhu/pages/", label: "Pages", permission: "pages" },
  { href: "/sidhu/media/", label: "Media", permission: "media" },
  { href: "/sidhu/seo/", label: "SEO", permission: "seo" },
  { href: "/sidhu/messages/", label: "Messages", permission: "messages" },
];

const SITE_LINKS: Array<{ href: string; label: string; permission: Permission }> = [
  { href: "/sidhu/pricing/", label: "Pricing", permission: "pricing" },
  { href: "/sidhu/faqs/", label: "FAQs", permission: "faqs" },
  { href: "/sidhu/redirects/", label: "Redirects", permission: "redirects" },
  { href: "/sidhu/settings/", label: "Site Settings", permission: "site_settings" },
];

export default async function SidhuDashboardPage() {
  const session = await getAdminSession();
  const canUsers = Boolean(
    session && hasPermission(session.role, session.permissions, "users_security"),
  );
  const [stats, categories, cloud, system, users] = await Promise.all([
    cms.dashboardStats(),
    cms.listCategories(),
    getCloudinaryStatusAction(),
    getSystemStatusAction(),
    canUsers && isDatabaseConfigured() ? listAdminUsers() : Promise.resolve([]),
  ]);

  const quickActions = QUICK_ACTIONS.filter(
    (item) => session && hasPermission(session.role, session.permissions, item.permission),
  );
  const siteLinks = SITE_LINKS.filter(
    (item) => session && hasPermission(session.role, session.permissions, item.permission),
  );
  const canContent = (permission: Permission) =>
    Boolean(session && hasPermission(session.role, session.permissions, permission));

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
    <AdminShell
      title="Dashboard"
      subtitle="Operational overview of Sidhu CMS content and site modules."
      breadcrumbs={[{ label: "Overview" }, { label: "Dashboard" }]}
    >
      <div className="space-y-8">
        <DashboardSection title="Content">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Pages"
              value={stats.pages}
              href={canContent("pages") ? "/sidhu/pages/" : undefined}
            />
            <StatCard
              label="Blog posts"
              value={stats.posts}
              hint={`${stats.publishedPosts} published · ${stats.drafts} draft`}
              href={canContent("blog") ? "/sidhu/blog/" : undefined}
            />
            <StatCard
              label="Categories"
              value={categories.length}
              href={canContent("blog") ? "/sidhu/blog/" : undefined}
            />
            <StatCard
              label="Media"
              value={stats.media}
              href={canContent("media") ? "/sidhu/media/" : undefined}
            />
          </div>
        </DashboardSection>

        <DashboardSection title="Operations">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Messages"
              value={stats.messages}
              href={canContent("messages") ? "/sidhu/messages/" : undefined}
            />
            {canUsers ? (
              <StatCard label="Users" value={users.length} href="/sidhu/users/" />
            ) : null}
            <StatCard
              label="FAQs"
              value={stats.faqs}
              href={canContent("faqs") ? "/sidhu/faqs/" : undefined}
            />
            <StatCard
              label="Pricing plans"
              value={stats.plans}
              href={canContent("pricing") ? "/sidhu/pricing/" : undefined}
            />
          </div>
        </DashboardSection>

        {siteLinks.length ? (
          <DashboardSection title="Site">
            <div className="flex flex-wrap gap-2">
              {siteLinks.map((item) => (
                <Link key={item.href} href={item.href} className={sidhuButtonClass("secondary", "min-h-9")}>
                  {item.label}
                </Link>
              ))}
            </div>
          </DashboardSection>
        ) : null}

        {canContent("seo") ? (
          <DashboardSection title="SEO">
            <SectionCard padding="sm" className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">SEO Control Center</p>
                <p className="mt-0.5 text-xs text-muted">
                  Open SEO Overview. Health scans stay manual — nothing runs from this dashboard.
                </p>
              </div>
              <Link href="/sidhu/seo/" className={sidhuButtonClass("secondary", "min-h-9")}>
                Open SEO
              </Link>
            </SectionCard>
          </DashboardSection>
        ) : null}

        {quickActions.length ? (
          <DashboardSection title="Quick actions">
            <div className="flex flex-wrap gap-2">
              {quickActions.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={sidhuButtonClass(item.primary ? "primary" : "secondary", "min-h-9")}
                >
                  {item.label}
                </Link>
              ))}
              <Link href="/" className={sidhuButtonClass("ghost", "min-h-9")}>
                View website
              </Link>
            </div>
          </DashboardSection>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard padding="sm">
            <p className="text-sm font-semibold">Cloudinary</p>
            <p className="mt-2 text-sm text-muted">
              Cloud name: {cloud.cloudName || "—"}.{" "}
              <StatusBadge tone={cloud.configured ? "success" : "warning"}>
                {cloud.configured ? "Configured" : "Not configured"}
              </StatusBadge>
            </p>
          </SectionCard>
          <SectionCard padding="sm">
            <p className="text-sm font-semibold">System</p>
            <p className="mt-1 text-xs text-muted">Safe status only. Secrets are never shown.</p>
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
            </dl>
          </SectionCard>
        </div>
      </div>
    </AdminShell>
  );
}
