import { permanentRedirect } from "next/navigation";
import { blogPostPath } from "@/lib/cms/blog-paths";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export default async function LegacyBlogPostRedirect({ params }: Props) {
  const { slug } = await params;
  permanentRedirect(blogPostPath(slug));
}
