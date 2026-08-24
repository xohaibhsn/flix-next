"use client";

import { useMemo, useState } from "react";
import { savePageAction } from "@/lib/cms/actions";
import { createSection } from "@/lib/cms/defaults";
import { createId } from "@/lib/cms/ids";
import { SUPPORTED_SECTION_TYPES } from "@/lib/cms/section-registry";
import type { CmsPage, CmsSection, FaqItem, MediaAsset, SectionType } from "@/lib/cms/types";
import { SectionEditor } from "@/components/sidhu/SectionEditor";
import { Banner } from "@/components/sidhu/fields";

export function HomeBuilder({
  page: initialPage,
  title = "Home page builder",
  hint = "Saving updates the live Home page at /welcome/ after a refresh.",
  faqs = [],
  assets = [],
}: {
  page: CmsPage;
  title?: string;
  hint?: string;
  faqs?: FaqItem[];
  assets?: MediaAsset[];
}) {
  const [page, setPage] = useState(initialPage);
  const [saved, setSaved] = useState(initialPage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const sections = useMemo(
    () => [...page.sections].sort((a, b) => a.order - b.order),
    [page.sections],
  );
  const selected = sections.find((section) => section.id === selectedId) ?? null;
  const dirty = JSON.stringify(page) !== JSON.stringify(saved);

  function updateSections(next: CmsSection[]) {
    setPage({
      ...page,
      sections: next.map((section, index) => ({ ...section, order: index + 1 })),
    });
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= sections.length) return;
    const copy = [...sections];
    const [item] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, item);
    updateSections(copy);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const result = await savePageAction(page);
    setSaving(false);
    if (result.ok) {
      setPage(result.page);
      setSaved(result.page);
      setMessage({ tone: "ok", text: hint });
    } else {
      setMessage({ tone: "error", text: result.error });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted">
            {dirty ? "Unsaved changes" : "All changes saved"} · {sections.length} sections
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-line px-4 py-2 text-sm"
            onClick={() => {
              setPage(saved);
              setMessage({ tone: "info", text: "Reverted to last saved version." });
            }}
            disabled={!dirty || saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="space-y-3">
          {sections.map((section, index) => (
            <article
              key={section.id}
              className={`rounded-xl border bg-white p-4 ${selectedId === section.id ? "border-brand" : "border-line"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">
                    {index + 1}. {section.type}
                  </p>
                  <h2 className="font-semibold">{section.label}</h2>
                  <p className="text-xs text-muted">{section.visible ? "Visible" : "Hidden"}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className="rounded border border-line px-2 py-1 text-xs" onClick={() => setSelectedId(section.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 text-xs"
                    onClick={() =>
                      updateSections(
                        sections.map((row) =>
                          row.id === section.id ? { ...row, visible: !row.visible } : row,
                        ),
                      )
                    }
                  >
                    {section.visible ? "Hide" : "Show"}
                  </button>
                  <button type="button" className="rounded border border-line px-2 py-1 text-xs" onClick={() => move(index, -1)}>
                    Up
                  </button>
                  <button type="button" className="rounded border border-line px-2 py-1 text-xs" onClick={() => move(index, 1)}>
                    Down
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 text-xs"
                    onClick={() => {
                      const copy: CmsSection = {
                        ...structuredClone(section),
                        id: createId("sec"),
                        label: `${section.label} copy`,
                      };
                      const next = [...sections];
                      next.splice(index + 1, 0, copy);
                      updateSections(next);
                      setSelectedId(copy.id);
                    }}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                    onClick={() => {
                      if (!confirm(`Delete “${section.label}”? This cannot be undone until you cancel.`)) return;
                      updateSections(sections.filter((row) => row.id !== section.id));
                      if (selectedId === section.id) setSelectedId(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
          <button
            type="button"
            className="w-full rounded-xl border border-dashed border-brand/40 bg-white py-4 text-sm font-semibold text-brand"
            onClick={() => setAddOpen(true)}
          >
            + Add section
          </button>
        </div>

        <aside className="h-fit rounded-xl border border-line bg-white p-4 xl:sticky xl:top-6">
          {selected ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Edit {selected.label}</h2>
                <button type="button" className="text-xs text-muted" onClick={() => setSelectedId(null)}>
                  Close
                </button>
              </div>
              <SectionEditor
                section={selected}
                faqs={faqs}
                assets={assets}
                onChange={(next) =>
                  updateSections(sections.map((row) => (row.id === next.id ? next : row)))
                }
              />
            </>
          ) : (
            <p className="text-sm text-muted">Select a section to edit its content.</p>
          )}
        </aside>
      </div>

      {addOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6">
            <h2 className="text-lg font-bold">Add section</h2>
            <p className="mt-1 text-sm text-muted">Choose a supported section block.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SUPPORTED_SECTION_TYPES.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  className="rounded-lg border border-line px-3 py-3 text-left text-sm hover:border-brand"
                  onClick={() => {
                    const created = createSection(item.type as SectionType, sections.length + 1);
                    updateSections([...sections, created]);
                    setSelectedId(created.id);
                    setAddOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" className="mt-4 text-sm text-muted" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
