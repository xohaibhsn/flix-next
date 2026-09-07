import { CompanyPublicPage, companyPageMetadata } from "@/components/cms/CompanyPublicPage";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return companyPageMetadata("about");
}

export default function AboutUsPage() {
  return <CompanyPublicPage seoKey="about" />;
}
