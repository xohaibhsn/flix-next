import { CompanyPublicPage, companyPageMetadata } from "@/components/cms/CompanyPublicPage";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return companyPageMetadata("refund");
}

export default function RefundPolicyPage() {
  return <CompanyPublicPage seoKey="refund" />;
}
