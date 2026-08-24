import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { HomeBuilder } from "@/components/sidhu/HomeBuilder";
import { defaultPages } from "@/lib/cms/defaults";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuContactBuilderPage() {
  const page =
    (await cms.getPageBySlug("/contact/")) ?? defaultPages().find((item) => item.slug === "/contact/");
  if (!page) notFound();

  return (
    <AdminShell
      title="Contact"
      subtitle="Section builder for /contact/. Global phone, email, and WhatsApp still come from Site Settings."
    >
      <HomeBuilder
        page={page}
        title="Contact page builder"
        hint="Saving updates the live Contact page after a refresh. Contact values come from Site Settings."
      />
    </AdminShell>
  );
}
