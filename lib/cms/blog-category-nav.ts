import { categoryPublicPath } from "@/lib/cms/category-seo";
import type { BlogCategory } from "@/lib/cms/types";

export type BlogCategoryNavLink = {
  id: string;
  label: string;
  href: string;
};

/** Active CMS categories shown on /blogs/, in repository order. */
export function blogIndexCategoryNavLinks(
  categories: Array<Pick<BlogCategory, "id" | "name" | "slug" | "active">>,
): BlogCategoryNavLink[] {
  return categories
    .filter((category) => category.active && category.slug.trim() && category.name.trim())
    .map((category) => ({
      id: category.id,
      label: category.name.trim(),
      href: categoryPublicPath(category.slug.trim()),
    }));
}
