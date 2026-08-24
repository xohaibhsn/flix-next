import { AdminShell } from "@/components/sidhu/AdminShell";
import { RedirectManager } from "@/components/sidhu/RedirectManager";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuRedirectsPage() {
  const rules = await cms.listRedirects();
  return (
    <AdminShell
      title="Redirects"
      subtitle="Database-backed redirects applied at request time. `/` → `/welcome/` stays in Next config and cannot be duplicated here."
    >
      <RedirectManager initialRules={rules} />
    </AdminShell>
  );
}
