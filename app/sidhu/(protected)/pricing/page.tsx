import { AdminShell } from "@/components/sidhu/AdminShell";
import { PricingManager } from "@/components/sidhu/PricingManager";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuPricingPage() {
  const plans = await cms.listPlans();
  return (
    <AdminShell title="Pricing" subtitle="Central plans used by Home and IPTV Subscription pricing sections.">
      <PricingManager initialPlans={plans} />
    </AdminShell>
  );
}
