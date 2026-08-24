"use client";

import Link from "next/link";
import { useState } from "react";
import { deletePostAction, saveCategoryAction, deleteCategoryAction } from "@/lib/cms/actions";
import { createId } from "@/lib/cms/ids";
import { slugify } from "@/lib/cms/slug";
import type { BlogCategory, BlogPost } from "@/lib/cms/types";
import { Banner, Field, TextInput } from "@/components/sidhu/fields";

export function BlogList({
  posts,
  categories,
}: {
  posts: BlogPost[];
  categories: BlogCategory[];
}) {
  const [items, setItems] = useState(posts);
  const [cats, setCats] = useState(categories);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [name, setName] = useState("");

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
    });
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setCats((current) => [...current, result.category]);
    setName("");
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
    <div className="space-y-6">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <Link href="/sidhu/blog/new/" className="inline-flex rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
        New Post
      </Link>
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Featured</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((post) => (
              <tr key={post.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{post.title}</td>
                <td className="px-4 py-3">{post.status}</td>
                <td className="px-4 py-3">{cats.find((item) => item.id === post.categoryId)?.name || "—"}</td>
                <td className="px-4 py-3">{(post.publishedAt || post.createdAt).slice(0, 10)}</td>
                <td className="px-4 py-3">{post.featured ? "Yes" : "No"}</td>
                <td className="px-4 py-3">
                  <Link href={`/sidhu/blog/${post.id}/`} className="mr-3 font-semibold text-brand">
                    Edit
                  </Link>
                  <button type="button" className="text-red-700" onClick={() => void remove(post.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">Categories</h2>
        <div className="mt-3 flex gap-2">
          <Field label="Name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <button type="button" className="self-end rounded-md border border-line px-3 py-2 text-sm" onClick={() => void addCategory()}>
            Add
          </button>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {cats.map((category) => (
            <li key={category.id} className="flex items-center justify-between">
              <span>
                {category.name} / {category.slug}
              </span>
              <button type="button" className="text-red-700" onClick={() => void removeCategory(category.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
