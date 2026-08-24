import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PageHero } from "@/components/layout/PageHero";
import { SiteShell } from "@/components/layout/SiteShell";
import { Container } from "@/components/ui/Container";
import { cms } from "@/lib/cms/repository";
import { pageMetadata } from "@/lib/metadata";
import type { BlogPost } from "@/lib/cms/types";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const category = (await cms.listCategories()).find((item) => item.slug === slug && item.active);
  if (!category) return pageMetadata("Category not found", "", "/blog/");
  return pageMetadata(category.name, category.description || `Posts in ${category.name}.`, `/category/${category.slug}/`);
}

function Card({ post }: { post: BlogPost }) {
  return (
    <article className="rounded-xl border border-line bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-ink">
        <Link href={`/blog/${post.slug}/`} className="hover:text-brand">
          {post.title}
        </Link>
      </h2>
      <p className="mt-3 text-sm text-muted">{post.excerpt}</p>
    </article>
  );
}

export default async function CategoryPage({ params }: Props) {
  await connection();
  const { slug } = await params;
  const [categories, posts] = await Promise.all([cms.listCategories(), cms.listPosts()]);
  const category = categories.find((item) => item.slug === slug && item.active);
  if (!category) notFound();
  const items = posts.filter((post) => post.status === "published" && post.categoryId === category.id);

  return (
    <SiteShell>
      <PageHero eyebrow="Category" title={category.name} description={category.description || "Published posts in this topic."} />
      <section className="bg-paper py-16">
        <Container>
          {items.length === 0 ? (
            <p className="text-sm text-muted">No published posts in this category yet.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {items.map((post) => (
                <Card key={post.id} post={post} />
              ))}
            </div>
          )}
        </Container>
      </section>
    </SiteShell>
  );
}
