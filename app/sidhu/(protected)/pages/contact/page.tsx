import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { HomeBuilder } from "@/components/sidhu/HomeBuilder";
import { defaultPages } from "@/lib/cms/defaults";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuContactBuilderPage() {
  const [page, faqs, assets] = await Promise.all([
    cms.getPageBySlug("/contact/"),
    cms.listFaqs(),
    cms.listMedia(),
  ]);
  const resolved = page ?? defaultPages().find((item) => item.slug === "/contact/");
  if (!resolved) notFound();

  return (
    <AdminShell
      title="Contact"
      subtitle="Section builder for /contact/. Global phone, email, and WhatsApp still come from Site Settings."
    >
      <HomeBuilder
        page={resolved}
        title="Contact page builder"
        hint="Saving updates the live Contact page after a refresh. Contact values come from Site Settings."
        faqs={faqs}
        assets={assets}
      />
    </AdminShell>
  );
}
