"use client";

import { useMemo, useState } from "react";
import { deleteFaqAction, saveFaqAction } from "@/lib/cms/actions";
import { FAQ_CATEGORIES } from "@/lib/cms/faq-categories";
import { createId } from "@/lib/cms/ids";
import type { FaqItem } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";
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
import { ListActionButton, ListActions } from "@/components/sidhu/ui/ListActions";
import { StatusBadge } from "@/components/sidhu/ui/StatusBadge";
import { Button } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

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
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () => items.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((item) =>
      `${item.question} ${item.category} ${item.answer}`.toLowerCase().includes(q),
    );
  }, [sorted, query]);

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

      <DataTableShell
        toolbar={
          <TableToolbar>
            <TableSearch
              id="faqs-search"
              label="Search FAQs"
              placeholder="Search question or category…"
              value={query}
              onChange={setQuery}
            />
            <Button
              type="button"
              variant="primary"
              className="min-h-9"
              onClick={() => setEditing(blankFaq(items.length + 1))}
            >
              Add FAQ
            </Button>
          </TableToolbar>
        }
      >
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={items.length === 0 ? "No FAQs yet" : "No matching FAQs"}
              description={
                items.length === 0
                  ? "Add frequently asked questions for the public site."
                  : "Try a different search term."
              }
              action={
                items.length === 0 ? (
                  <Button
                    type="button"
                    variant="primary"
                    className="min-h-9"
                    onClick={() => setEditing(blankFaq(1))}
                  >
                    Add FAQ
                  </Button>
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
                    <Th hideBelow="md">Order</Th>
                    <Th>Question</Th>
                    <Th hideBelow="md">Category</Th>
                    <Th>Status</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </TableHead>
                <tbody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <Td hideBelow="md" className="text-muted">
                        {item.sortOrder}
                      </Td>
                      <Td className="font-medium">
                        <span className="line-clamp-2">{item.question}</span>
                      </Td>
                      <Td hideBelow="md">{item.category}</Td>
                      <Td>
                        <StatusBadge tone={item.visible ? "success" : "neutral"}>
                          {item.visible ? "Visible" : "Hidden"}
                        </StatusBadge>
                      </Td>
                      <Td>
                        <ListActions>
                          <ListActionButton onClick={() => setEditing(item)}>Edit</ListActionButton>
                          <ListActionButton variant="danger" onClick={() => void remove(item.id)}>
                            Delete
                          </ListActionButton>
                        </ListActions>
                      </Td>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </TableScroll>
            <ListStack>
              {filtered.map((item) => (
                <ListCard key={item.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold text-ink">{item.question}</p>
                    <StatusBadge tone={item.visible ? "success" : "neutral"}>
                      {item.visible ? "Visible" : "Hidden"}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-muted">
                    {item.category} · Order {item.sortOrder}
                  </p>
                  <ListActions>
                    <ListActionButton onClick={() => setEditing(item)}>Edit</ListActionButton>
                    <ListActionButton variant="danger" onClick={() => void remove(item.id)}>
                      Delete
                    </ListActionButton>
                  </ListActions>
                </ListCard>
              ))}
            </ListStack>
          </>
        )}
      </DataTableShell>

      {editing ? (
        <SectionCard padding="sm">
          <form
            className="space-y-3"
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
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary">
                Save FAQ
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}
    </div>
  );
}
