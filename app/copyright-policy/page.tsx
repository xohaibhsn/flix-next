import { CompanyPublicPage, companyPageMetadata } from "@/components/cms/CompanyPublicPage";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return companyPageMetadata("copyright");
}

export default function CopyrightPolicyPage() {
  return <CompanyPublicPage seoKey="copyright" />;
}
