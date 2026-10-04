"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { deletePostAction, saveCategoryAction, deleteCategoryAction } from "@/lib/cms/actions";
import { createId } from "@/lib/cms/ids";
import { slugify } from "@/lib/cms/slug";
import type { BlogCategory, BlogPost } from "@/lib/cms/types";
import { Banner, Field, TextInput } from "@/components/sidhu/fields";
import { blogPostPath } from "@/lib/cms/blog-paths";
import {
  DataTable,
  DataTableShell,
  ListCard,
  ListStack,
  TableHead,
  TableRow,
  TableScroll,
  TableSearch,
  TableToolbar,
  Td,
  Th,
} from "@/components/sidhu/ui/DataTable";
import { EmptyState } from "@/components/sidhu/ui/EmptyState";
import { ListActionButton, ListActionLink, ListActions } from "@/components/sidhu/ui/ListActions";
import { StatusBadge } from "@/components/sidhu/ui/StatusBadge";
import { SubNav } from "@/components/sidhu/ui/SubNav";
import { Button, sidhuButtonClass } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import Link from "next/link";

type BlogTab = "posts" | "categories" | "listing-seo";

export function BlogList({
  posts,
  categories,
  listingSeo,
}: {
  posts: BlogPost[];
  categories: BlogCategory[];
  listingSeo?: ReactNode;
}) {
  const [items, setItems] = useState(posts);
  const [cats, setCats] = useState(categories);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<BlogTab>("posts");

  const tabs = useMemo(() => {
    const list: Array<{ id: BlogTab; label: string; count?: number }> = [
      { id: "posts", label: "Posts", count: items.length },
      { id: "categories", label: "Categories", count: cats.length },
    ];
    if (listingSeo) list.push({ id: "listing-seo", label: "Blog Listing SEO" });
    return list;
  }, [items.length, cats.length, listingSeo]);

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((post) => {
      const category = cats.find((item) => item.id === post.categoryId)?.name || "";
      return (
        post.title.toLowerCase().includes(q) ||
        post.slug.toLowerCase().includes(q) ||
        category.toLowerCase().includes(q) ||
        post.status.toLowerCase().includes(q)
      );
    });
  }, [items, cats, query]);

  async function remove(id: string) {
    if (!confirm("Delete this post?")) return;
    const result = await deletePostAction(id);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  async function addCategory() {
    const slug = slugify(name);
    const now = new Date().toISOString();
    const result = await saveCategoryAction({
      id: createId("cat"),
      name,
      slug,
      description: "",
      active: true,
      createdAt: now,
      updatedAt: now,
      seoTitle: "",
      seoDescription: "",
      focusKeyword: "",
      canonicalUrl: "",
      robotsIndex: null,
      robotsFollow: null,
      ogTitle: "",
      ogDescription: "",
      ogImage: null,
      sitemapInclude: null,
    });
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setCats((current) => [...current, result.category]);
    setName("");
    setMessage({ tone: "ok", text: "Category added." });
  }

  async function removeCategory(id: string) {
    if (!confirm("Delete this category?")) return;
    const result = await deleteCategoryAction(id);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setCats((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-4">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <SubNav items={tabs} value={tab} onChange={setTab} ariaLabel="Blog sections" />

      {tab === "posts" ? (
        <DataTableShell
          toolbar={
            <TableToolbar>
              <TableSearch
                id="blog-posts-search"
                label="Search posts"
                placeholder="Search title, category, status…"
                value={query}
                onChange={setQuery}
              />
            </TableToolbar>
          }
        >
          {filteredPosts.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={items.length === 0 ? "No blog posts yet" : "No matching posts"}
                description={
                  items.length === 0
                    ? "Create a draft to start publishing guides and updates."
                    : "Try a different search term."
                }
                action={
                  items.length === 0 ? (
                    <Link href="/sidhu/blog/new/" className={sidhuButtonClass("primary", "min-h-9")}>
                      New Post
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <TableScroll className="hidden md:block">
                <DataTable>
                  <TableHead>
                    <tr>
                      <Th>Title</Th>
                      <Th>Status</Th>
                      <Th hideBelow="md">Category</Th>
                      <Th hideBelow="md">Date</Th>
                      <Th hideBelow="lg">Featured</Th>
                      <Th>
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </TableHead>
                  <tbody>
                    {filteredPosts.map((post) => {
                      const category = cats.find((item) => item.id === post.categoryId)?.name || "—";
                      return (
                        <TableRow key={post.id}>
                          <Td className="font-medium">{post.title}</Td>
                          <Td>
                            <StatusBadge tone={post.status === "published" ? "success" : "warning"}>
                              {post.status === "published" ? "Published" : "Draft"}
                            </StatusBadge>
                          </Td>
                          <Td hideBelow="md">{category}</Td>
                          <Td hideBelow="md" className="text-muted">
                            {(post.publishedAt || post.createdAt).slice(0, 10)}
                          </Td>
                          <Td hideBelow="lg">{post.featured ? "Yes" : "No"}</Td>
                          <Td>
                            <ListActions>
                              <ListActionLink href={`/sidhu/blog/${post.id}/`} variant="secondary">
                                Edit
                              </ListActionLink>
                              {post.status === "published" && post.slug ? (
                                <ListActionLink
                                  href={blogPostPath(post.slug)}
                                  variant="quiet"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="View public post"
                                >
                                  View
                                </ListActionLink>
                              ) : null}
                              <ListActionButton variant="danger" onClick={() => void remove(post.id)}>
                                Delete
                              </ListActionButton>
                            </ListActions>
                          </Td>
                        </TableRow>
                      );
                    })}
                  </tbody>
                </DataTable>
              </TableScroll>
              <ListStack>
                {filteredPosts.map((post) => {
                  const category = cats.find((item) => item.id === post.categoryId)?.name || "—";
                  return (
                    <ListCard key={post.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-semibold text-ink">{post.title}</p>
                        <StatusBadge tone={post.status === "published" ? "success" : "warning"}>
                          {post.status === "published" ? "Published" : "Draft"}
                        </StatusBadge>
                      </div>
                      <p className="text-xs text-muted">
                        {category} · {(post.publishedAt || post.createdAt).slice(0, 10)}
                        {post.featured ? " · Featured" : ""}
                      </p>
                      <ListActions>
                        <ListActionLink href={`/sidhu/blog/${post.id}/`} variant="secondary">
                          Edit
                        </ListActionLink>
                        {post.status === "published" && post.slug ? (
                          <ListActionLink
                            href={blogPostPath(post.slug)}
                            variant="quiet"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View
                          </ListActionLink>
                        ) : null}
                        <ListActionButton variant="danger" onClick={() => void remove(post.id)}>
                          Delete
                        </ListActionButton>
                      </ListActions>
                    </ListCard>
                  );
                })}
              </ListStack>
            </>
          )}
        </DataTableShell>
      ) : null}

      {tab === "categories" ? (
        <SectionCard className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Categories</h2>
            <p className="mt-0.5 text-xs text-muted">Organise posts. Edit opens the category SEO/editor screen.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Field label="Name">
                <TextInput value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
            </div>
            <Button type="button" variant="secondary" className="min-h-10" onClick={() => void addCategory()}>
              Add
            </Button>
          </div>
          {cats.length === 0 ? (
            <EmptyState title="No categories yet" description="Add a category name to get started." />
          ) : (
            <>
              <TableScroll className="hidden md:block">
                <DataTable className="min-w-0">
                  <TableHead>
                    <tr>
                      <Th>Name</Th>
                      <Th>Slug</Th>
                      <Th>
                        <span className="sr-only">Actions</span>
                      </Th>
                    </tr>
                  </TableHead>
                  <tbody>
                    {cats.map((category) => (
                      <TableRow key={category.id}>
                        <Td className="font-medium">{category.name}</Td>
                        <Td className="font-mono text-xs text-muted">{category.slug}</Td>
                        <Td>
                          <ListActions>
                            <ListActionLink href={`/sidhu/blog/category/${category.id}/`} variant="secondary">
                              Edit
                            </ListActionLink>
                            <ListActionButton variant="danger" onClick={() => void removeCategory(category.id)}>
                              Delete
                            </ListActionButton>
                          </ListActions>
                        </Td>
                      </TableRow>
                    ))}
                  </tbody>
                </DataTable>
              </TableScroll>
              <ListStack className="rounded-xl border border-line md:hidden">
                {cats.map((category) => (
                  <ListCard key={category.id}>
                    <p className="font-semibold">{category.name}</p>
                    <p className="font-mono text-xs text-muted">{category.slug}</p>
                    <ListActions>
                      <ListActionLink href={`/sidhu/blog/category/${category.id}/`} variant="secondary">
                        Edit
                      </ListActionLink>
                      <ListActionButton variant="danger" onClick={() => void removeCategory(category.id)}>
                        Delete
                      </ListActionButton>
                    </ListActions>
                  </ListCard>
                ))}
              </ListStack>
            </>
          )}
        </SectionCard>
      ) : null}

      {tab === "listing-seo" && listingSeo ? (
        <div role="tabpanel" aria-labelledby="sidhu-subnav-listing-seo">
          {listingSeo}
        </div>
      ) : null}
    </div>
  );
}
