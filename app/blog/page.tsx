import { BlogCard } from "@/components/blog/BlogCard";
import { PageHero } from "@/components/layout/PageHero";
import { SiteShell } from "@/components/layout/SiteShell";
import { Container } from "@/components/ui/Container";
import { blogPosts } from "@/lib/demo-content";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageMetadata(
    "Blog",
    "Guides and updates from THE FLIX IPTV. Local demo posts only — the MySQL/TipTap CMS is not connected yet.",
    "/blog/",
  );
}

export default function BlogPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Guides"
        title="The Flix"
        accent="Blog"
        description="Local demo articles so the blog index and post routes can be reviewed. Real CMS content comes later."
      />
      <section className="bg-paper py-16">
        <Container>
          <div className="grid gap-6 md:grid-cols-2">
            {blogPosts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </Container>
      </section>
    </SiteShell>
  );
}
