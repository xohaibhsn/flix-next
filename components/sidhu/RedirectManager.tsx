"use client";

import { useState } from "react";
import { deleteRedirectAction, saveRedirectAction } from "@/lib/cms/actions";
import { createId } from "@/lib/cms/ids";
import { isKnownLocalDestination } from "@/lib/cms/page-paths";
import {
  isDangerousUrl,
  isReservedRedirectSource,
  isSelfRedirect,
  REDIRECT_ERRORS,
  withSlash,
  wouldCreateRedirectLoop,
} from "@/lib/cms/redirects";
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

function clientRedirectError(rule: RedirectRule, rules: RedirectRule[], known: Set<string>) {
  const source = rule.sourcePath.trim();
  const destination = rule.destinationPath.trim();
  if (!source || !destination) return REDIRECT_ERRORS.empty;
  if (isDangerousUrl(destination) || destination.startsWith("//")) return REDIRECT_ERRORS.unsafe;
  if (isReservedRedirectSource(source)) return REDIRECT_ERRORS.reserved;
  if (isSelfRedirect(source, destination)) return REDIRECT_ERRORS.self;
  if (rules.some((item) => item.id !== rule.id && item.active && rule.active && withSlash(item.sourcePath) === withSlash(source))) {
    return REDIRECT_ERRORS.duplicate;
  }
  if (wouldCreateRedirectLoop(rule, rules)) return REDIRECT_ERRORS.loop;
  if (rule.active && destination.startsWith("/") && !destination.startsWith("//") && !isKnownLocalDestination(destination, known)) {
    return REDIRECT_ERRORS.unknownDest;
  }
  return null;
}

export function RedirectManager({
  initialRules,
  knownDestinations,
}: {
  initialRules: RedirectRule[];
  knownDestinations: string[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [editing, setEditing] = useState<RedirectRule | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const known = new Set(knownDestinations);

  function upsert(rule: RedirectRule) {
    setRules((current) =>
      current.some((item) => item.id === rule.id)
        ? current.map((item) => (item.id === rule.id ? rule : item))
        : [...current, rule],
    );
  }

  async function save(rule: RedirectRule) {
    const localError = clientRedirectError(rule, rules, known);
    if (localError) {
      setMessage({ tone: "error", text: localError });
      return false;
    }
    const result = await saveRedirectAction(rule);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return false;
    }
    upsert(result.rule);
    setEditing(null);
    setMessage({ tone: "ok", text: "Redirect saved. It applies on the next request without a code push." });
    return true;
  }

  async function toggleActive(rule: RedirectRule) {
    setBusyId(rule.id);
    await save({ ...rule, active: !rule.active });
    setBusyId(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this redirect?")) return;
    const result = await deleteRedirectAction(id);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setRules((current) => current.filter((item) => item.id !== id));
    setMessage({ tone: "ok", text: "Redirect deleted." });
  }

  return (
    <div className="space-y-4">
      <Banner tone="info">
        All public redirects live here, including `/` → `/welcome/`. Disable or delete a rule to stop it.
        If the root redirect is off, `/` shows the same Home CMS as `/welcome/`. `/sidhu` and `/api` cannot
        be used as sources. Source and destination cannot be the same.
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
                  <button
                    type="button"
                    className="mr-3 font-semibold text-brand disabled:opacity-50"
                    disabled={busyId === rule.id}
                    onClick={() => void toggleActive(rule)}
                  >
                    {rule.active ? "Disable" : "Enable"}
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
          <Field label="Source path" hint="Including `/`. Trailing slashes are normalized.">
            <TextInput value={editing.sourcePath} onChange={(event) => setEditing({ ...editing, sourcePath: event.target.value })} />
          </Field>
          <Field label="Destination" hint="Internal path of an existing page, or an http(s) URL.">
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
              <option value={301}>301 permanent</option>
              <option value={302}>302 temporary</option>
              <option value={307}>307 temporary</option>
              <option value={308}>308 permanent</option>
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
