import Link from "next/link";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

function editHref(slug: string) {
  if (slug === "/") return "/sidhu/pages/home/";
  if (slug === "/iptv-subscriptions-uk/") return "/sidhu/pages/subscriptions/";
  if (slug === "/contact/") return "/sidhu/pages/contact/";
  return null;
}

export default async function SidhuPagesPage() {
  const pages = await cms.listPages();

  return (
    <AdminShell title="Pages" subtitle="Home, IPTV Subscription, and Contact use the same section builder.">
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">CMS</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => {
              const href = editHref(page.slug);
              return (
                <tr key={page.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{page.name}</td>
                  <td className="px-4 py-3 text-muted">{page.slug}</td>
                  <td className="px-4 py-3">{page.cmsEnabled ? "Enabled" : "Not yet"}</td>
                  <td className="px-4 py-3">
                    {href ? (
                      <Link href={href} className="font-semibold text-brand">
                        Edit
                      </Link>
                    ) : (
                      <span className="text-muted">No editor</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
