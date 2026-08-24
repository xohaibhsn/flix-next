"use client";

import { useState } from "react";
import { deleteRedirectAction, saveRedirectAction } from "@/lib/cms/actions";
import { createId } from "@/lib/cms/ids";
import type { RedirectRule } from "@/lib/cms/types";
import { Banner, Field, TextInput } from "@/components/sidhu/fields";

function blank(): RedirectRule {
  const now = new Date().toISOString();
  return {
    id: createId("redir"),
    sourcePath: "/old-path/",
    destinationPath: "/welcome/",
    statusCode: 301,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function RedirectManager({ initialRules }: { initialRules: RedirectRule[] }) {
  const [rules, setRules] = useState(initialRules);
  const [editing, setEditing] = useState<RedirectRule | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  async function save(rule: RedirectRule) {
    const result = await saveRedirectAction(rule);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setRules((current) =>
      current.some((item) => item.id === result.rule.id)
        ? current.map((item) => (item.id === result.rule.id ? result.rule : item))
        : [...current, result.rule],
    );
    setEditing(null);
    setMessage({ tone: "ok", text: "Redirect saved. It applies on the next request without a code push." });
  }

  async function remove(id: string) {
    if (!confirm("Delete this redirect?")) return;
    const result = await deleteRedirectAction(id);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setRules((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-4">
      <Banner tone="info">
        `/` → `/welcome/` is handled in Next config and cannot be duplicated here. Use this manager for extra Junaid redirects.
      </Banner>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <button type="button" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" onClick={() => setEditing(blank())}>
        Add redirect
      </button>
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Destination</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-t border-line">
                <td className="px-4 py-3">{rule.sourcePath}</td>
                <td className="px-4 py-3">{rule.destinationPath}</td>
                <td className="px-4 py-3">{rule.statusCode}</td>
                <td className="px-4 py-3">{rule.active ? "Yes" : "No"}</td>
                <td className="px-4 py-3">
                  <button type="button" className="mr-3 font-semibold text-brand" onClick={() => setEditing(rule)}>
                    Edit
                  </button>
                  <button type="button" className="text-red-700" onClick={() => void remove(rule.id)}>
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
          <Field label="Source path">
            <TextInput value={editing.sourcePath} onChange={(event) => setEditing({ ...editing, sourcePath: event.target.value })} />
          </Field>
          <Field label="Destination">
            <TextInput value={editing.destinationPath} onChange={(event) => setEditing({ ...editing, destinationPath: event.target.value })} />
          </Field>
          <Field label="Status">
            <select
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
              value={editing.statusCode}
              onChange={(event) =>
                setEditing({ ...editing, statusCode: Number(event.target.value) as RedirectRule["statusCode"] })
              }
            >
              <option value={301}>301</option>
              <option value={302}>302</option>
              <option value={307}>307</option>
              <option value={308}>308</option>
            </select>
          </Field>
          <label className="text-sm">
            <input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /> Active
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
              Save
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
