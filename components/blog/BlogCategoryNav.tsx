import Link from "next/link";
import type { BlogCategoryNavLink } from "@/lib/cms/blog-category-nav";

export function BlogCategoryNav({ links }: { links: BlogCategoryNavLink[] }) {
  if (!links.length) return null;
  return (
    <nav aria-label="Blog categories" className="mb-10">
      <p className="text-xs font-bold tracking-wide text-muted uppercase">Browse by topic</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.id}>
            <Link
              href={link.href}
              className="inline-flex rounded-full border border-line bg-white px-4 py-1.5 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
