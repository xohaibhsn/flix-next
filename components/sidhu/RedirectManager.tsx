"use client";

import { useMemo, useState } from "react";
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
  const [query, setQuery] = useState("");
  const known = new Set(knownDestinations);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((rule) =>
      `${rule.sourcePath} ${rule.destinationPath} ${rule.statusCode}`.toLowerCase().includes(q),
    );
  }, [rules, query]);

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

      <DataTableShell
        toolbar={
          <TableToolbar>
            <TableSearch
              id="redirects-search"
              label="Search redirects"
              placeholder="Search source or destination…"
              value={query}
              onChange={setQuery}
            />
            <Button type="button" variant="primary" className="min-h-9" onClick={() => setEditing(blank())}>
              Add redirect
            </Button>
          </TableToolbar>
        }
      >
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={rules.length === 0 ? "No redirects" : "No matching redirects"}
              description={
                rules.length === 0
                  ? "Add a redirect to send visitors from an old path to a new one."
                  : "Try a different search term."
              }
              action={
                rules.length === 0 ? (
                  <Button type="button" variant="primary" className="min-h-9" onClick={() => setEditing(blank())}>
                    Add redirect
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
                    <Th>Source</Th>
                    <Th>Destination</Th>
                    <Th hideBelow="md">Type</Th>
                    <Th>Status</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </TableHead>
                <tbody>
                  {filtered.map((rule) => (
                    <TableRow key={rule.id}>
                      <Td className="font-mono text-xs">{rule.sourcePath}</Td>
                      <Td className="font-mono text-xs">{rule.destinationPath}</Td>
                      <Td hideBelow="md">{rule.statusCode}</Td>
                      <Td>
                        <StatusBadge tone={rule.active ? "success" : "neutral"}>
                          {rule.active ? "Active" : "Inactive"}
                        </StatusBadge>
                      </Td>
                      <Td>
                        <ListActions>
                          <ListActionButton onClick={() => setEditing(rule)}>Edit</ListActionButton>
                          <ListActionButton
                            variant="secondary"
                            disabled={busyId === rule.id}
                            onClick={() => void toggleActive(rule)}
                          >
                            {rule.active ? "Disable" : "Enable"}
                          </ListActionButton>
                          <ListActionButton variant="danger" onClick={() => void remove(rule.id)}>
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
              {filtered.map((rule) => (
                <ListCard key={rule.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold">{rule.sourcePath}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted">→ {rule.destinationPath}</p>
                    </div>
                    <StatusBadge tone={rule.active ? "success" : "neutral"}>
                      {rule.active ? "Active" : "Inactive"}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-muted">{rule.statusCode}</p>
                  <ListActions>
                    <ListActionButton onClick={() => setEditing(rule)}>Edit</ListActionButton>
                    <ListActionButton
                      variant="secondary"
                      disabled={busyId === rule.id}
                      onClick={() => void toggleActive(rule)}
                    >
                      {rule.active ? "Disable" : "Enable"}
                    </ListActionButton>
                    <ListActionButton variant="danger" onClick={() => void remove(rule.id)}>
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
        <SectionCard
          className="space-y-3"
          padding="sm"
        >
          <form
            className="space-y-3"
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
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary">
                Save
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
