"use client";

import { useState } from "react";
import { deleteFaqAction, saveFaqAction } from "@/lib/cms/actions";
import { FAQ_CATEGORIES } from "@/lib/cms/faq-categories";
import { createId } from "@/lib/cms/ids";
import type { FaqItem } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";

function blankFaq(sortOrder: number): FaqItem {
  const now = new Date().toISOString();
  return {
    id: createId("faq"),
    question: "New question",
    answer: "",
    category: "General",
    sortOrder,
    visible: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function FaqManager({ initialItems }: { initialItems: FaqItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<FaqItem | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  async function save(item: FaqItem) {
    const result = await saveFaqAction(item);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setItems((current) =>
      current.some((row) => row.id === result.item.id)
        ? current.map((row) => (row.id === result.item.id ? result.item : row))
        : [...current, result.item],
    );
    setEditing(null);
    setMessage({ tone: "ok", text: "FAQ saved. Pages that reuse this category will update." });
  }

  async function remove(id: string) {
    if (!confirm("Delete this FAQ?")) return;
    const result = await deleteFaqAction(id);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-4">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <button type="button" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={() => setEditing(blankFaq(items.length + 1))}>
        Add FAQ
      </button>
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Question</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Visible</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item) => (
                <tr key={item.id} className="border-t border-line">
                  <td className="px-4 py-3">{item.question}</td>
                  <td className="px-4 py-3">{item.category}</td>
                  <td className="px-4 py-3">{item.visible ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    <button type="button" className="mr-3 font-semibold text-brand" onClick={() => setEditing(item)}>
                      Edit
                    </button>
                    <button type="button" className="text-red-700" onClick={() => void remove(item.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editing ? (
        <form
          className="space-y-3 rounded-xl border border-line bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save(editing);
          }}
        >
          <Field label="Question">
            <TextInput value={editing.question} onChange={(event) => setEditing({ ...editing, question: event.target.value })} />
          </Field>
          <Field label="Answer">
            <TextArea value={editing.answer} onChange={(event) => setEditing({ ...editing, answer: event.target.value })} />
          </Field>
          <Field label="Category">
            <select
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              value={editing.category}
              onChange={(event) => setEditing({ ...editing, category: event.target.value })}
            >
              {FAQ_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sort order">
            <TextInput
              type="number"
              value={editing.sortOrder}
              onChange={(event) => setEditing({ ...editing, sortOrder: Number(event.target.value) || 0 })}
            />
          </Field>
          <label className="text-sm">
            <input type="checkbox" checked={editing.visible} onChange={(event) => setEditing({ ...editing, visible: event.target.checked })} /> Visible
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
              Save FAQ
            </button>
            <button type="button" className="rounded-md border border-line px-4 py-2 text-sm" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
