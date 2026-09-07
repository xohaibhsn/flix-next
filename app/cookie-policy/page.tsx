import { CompanyPublicPage, companyPageMetadata } from "@/components/cms/CompanyPublicPage";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return companyPageMetadata("cookie");
}

export default function CookiePolicyPage() {
  return <CompanyPublicPage seoKey="cookie" />;
}
