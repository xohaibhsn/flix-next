import { connection } from "next/server";
import { cms } from "@/lib/cms/repository";
import { createHomeSections } from "@/lib/cms/defaults";
import { SectionRenderer } from "@/components/cms/SectionRenderer";

export async function HomePage() {
  await connection();
  const page = await cms.getPageBySlug("/");
  const sections = page?.sections?.length ? page.sections : createHomeSections();
  return <SectionRenderer sections={sections} />;
}
