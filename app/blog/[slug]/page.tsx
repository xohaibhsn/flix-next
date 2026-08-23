import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/layout/PageHero";
import { SiteShell } from "@/components/layout/SiteShell";
import { Container } from "@/components/ui/Container";
import { blogPosts, getPostBySlug } from "@/lib/demo-content";
import { pageMetadata } from "@/lib/metadata";

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) {
    return pageMetadata("Post not found", "This demo post does not exist.", "/blog/");
  }
  return pageMetadata(post.title, post.excerpt, `/blog/${post.slug}/`);
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <SiteShell>
      <PageHero
        eyebrow={post.category}
        title={post.title}
        description={post.excerpt}
      />
      <article className="bg-white py-16">
        <Container className="max-w-3xl">
          <p className="text-xs text-muted">
            Demo post · {post.date} · not from CMS
          </p>
          <div className="mt-8 space-y-4">
            {post.content.map((paragraph) => (
              <p key={paragraph} className="text-[15px] leading-relaxed text-ink/80">
                {paragraph}
              </p>
            ))}
          </div>
          <Link
            href="/blog/"
            className="mt-10 inline-block text-sm font-semibold text-brand hover:underline"
          >
            Back to blog
          </Link>
        </Container>
      </article>
    </SiteShell>
  );
}
