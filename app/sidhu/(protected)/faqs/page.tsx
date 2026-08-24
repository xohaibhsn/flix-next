import { AdminShell } from "@/components/sidhu/AdminShell";
import { FaqManager } from "@/components/sidhu/FaqManager";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuFaqsPage() {
  const items = await cms.listFaqs();
  return (
    <AdminShell title="FAQs" subtitle="Central FAQ library. Page FAQ sections can reuse a category instead of duplicating copy.">
      <FaqManager initialItems={items} />
    </AdminShell>
  );
}
