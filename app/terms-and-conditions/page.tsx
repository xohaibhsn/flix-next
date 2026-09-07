import { CompanyPublicPage, companyPageMetadata } from "@/components/cms/CompanyPublicPage";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return companyPageMetadata("terms");
}

export default function TermsAndConditionsPage() {
  return <CompanyPublicPage seoKey="terms" />;
}
