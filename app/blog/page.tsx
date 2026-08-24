import Link from "next/link";
import { connection } from "next/server";
import { PageHero } from "@/components/layout/PageHero";
import { SiteShell } from "@/components/layout/SiteShell";
import { Container } from "@/components/ui/Container";
import { cms } from "@/lib/cms/repository";
import { pageSeoMetadata } from "@/lib/metadata";
import type { BlogPost } from "@/lib/cms/types";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageSeoMetadata("blog", "Blog", "Guides and updates from THE FLIX IPTV.", "/blog/");
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

function PostCard({ post, category }: { post: BlogPost; category: string }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      {post.featuredImage?.secureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.featuredImage.secureUrl} alt="" className="h-44 w-full object-cover" />
      ) : null}
      <div className="flex flex-1 flex-col p-6">
        <p className="text-xs font-bold tracking-wide text-brand uppercase">{category}</p>
        <h2 className="mt-3 text-xl font-bold text-ink">
          <Link href={`/blog/${post.slug}/`} className="hover:text-brand">
            {post.title}
          </Link>
        </h2>
        {post.publishedAt ? (
          <time dateTime={post.publishedAt} className="mt-2 text-xs text-muted">
            {formatDate(post.publishedAt)}
          </time>
        ) : null}
        <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{post.excerpt}</p>
        <Link href={`/blog/${post.slug}/`} className="mt-5 text-sm font-semibold text-brand hover:underline">
          Read more
        </Link>
      </div>
    </article>
  );
}

export default async function BlogPage() {
  await connection();
  const [posts, categories] = await Promise.all([cms.listPosts(), cms.listCategories()]);
  const published = posts.filter((post) => post.status === "published");
  const categoryName = (id: string | null) =>
    categories.find((category) => category.id === id)?.name || "Guides";

  return (
    <SiteShell pageSeoKey="blog">
      <PageHero
        eyebrow="Guides"
        title="The Flix"
        accent="Blog"
        description="Setup help, device guides, and streaming notes from THE FLIX IPTV."
      />
      <section className="bg-paper py-16">
        <Container>
          {published.length === 0 ? (
            <p className="text-sm text-muted">No published posts yet.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {published.map((post) => (
                <PostCard key={post.id} post={post} category={categoryName(post.categoryId)} />
              ))}
            </div>
          )}
        </Container>
      </section>
    </SiteShell>
  );
}
