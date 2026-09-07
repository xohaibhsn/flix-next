import { CompanyPublicPage, companyPageMetadata } from "@/components/cms/CompanyPublicPage";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return companyPageMetadata("privacy");
}

export default function PrivacyPolicyPage() {
  return <CompanyPublicPage seoKey="privacy" />;
}
