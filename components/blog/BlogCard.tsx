import Link from "next/link";
import type { BlogPost } from "@/types/content";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function BlogCard({ post }: { post: BlogPost }) {
  return (
    <article className="flex flex-col rounded-xl border border-line bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-xs font-bold tracking-wide text-brand uppercase">
        {post.category}
      </p>
      <h2 className="mt-3 text-xl font-bold text-ink">
        <Link href={`/blog/${post.slug}/`} className="hover:text-brand">
          {post.title}
        </Link>
      </h2>
      <time dateTime={post.date} className="mt-2 text-xs text-muted">
        {formatDate(post.date)}
      </time>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{post.excerpt}</p>
      <Link
        href={`/blog/${post.slug}/`}
        className="mt-5 text-sm font-semibold text-brand hover:underline"
      >
        Read more
      </Link>
    </article>
  );
}
