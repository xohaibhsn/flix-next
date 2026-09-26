import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHero } from "@/components/layout/PageHero";
import { SiteShell } from "@/components/layout/SiteShell";
import { Container } from "@/components/ui/Container";
import { JsonLd } from "@/components/seo/JsonLd";
import { cms } from "@/lib/cms/repository";
import { getPublicPostBySlug, getPublicSettings } from "@/lib/cms/public-request-cache";
import { blogPostingJsonLd } from "@/lib/cms/json-ld";
import { pageMetadata, postSeoMetadata } from "@/lib/metadata";
import { renderCmsHtml } from "@/lib/cms/html";
import { contentImageAlt } from "@/lib/cms/media-alt";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = await getPublicPostBySlug(slug);
  if (!post || post.status !== "published") {
    return pageMetadata("Post not found", "This article is not published.", "/blogs/");
  }
  return postSeoMetadata(post);
}

export default async function BlogPostPage({ params }: Props) {
  await connection();
  const { slug } = await params;
  const [post, settings, categories] = await Promise.all([
    getPublicPostBySlug(slug),
    getPublicSettings(),
    cms.listCategories(),
  ]);
  if (!post || post.status !== "published") notFound();
  const category = categories.find((item) => item.id === post.categoryId);
  const featuredMedia = post.featuredImage?.id ? await cms.getMediaById(post.featuredImage.id) : null;
  const heroAlt = contentImageAlt(featuredMedia?.alt, post.title);

  return (
    <SiteShell>
      <JsonLd data={blogPostingJsonLd(post, settings)} />
      <PageHero eyebrow={category?.name || "Blog"} title={post.title} description={post.excerpt} />
      <article className="bg-white py-16">
        <Container className="max-w-3xl">
          {post.featuredImage?.secureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.featuredImage.secureUrl}
              alt={heroAlt}
              className="mb-8 w-full rounded-xl object-cover"
            />
          ) : null}
          {post.publishedAt ? (
            <p className="text-xs text-muted">
              {new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(new Date(post.publishedAt))}
            </p>
          ) : null}
          <div
            className="prose-cms mt-8 text-[15px] leading-relaxed text-ink/80"
            dangerouslySetInnerHTML={{ __html: renderCmsHtml(post.content) }}
          />
          <Link href="/blogs/" className="mt-10 inline-block text-sm font-semibold text-brand hover:underline">
            Back to blog
          </Link>
        </Container>
      </article>
    </SiteShell>
  );
}
