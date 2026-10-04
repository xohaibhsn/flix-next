"use client";

import { useMemo, useState } from "react";
import { savePlanAction, deletePlanAction } from "@/lib/cms/actions";
import { formatGbpPrice } from "@/lib/cms/currency";
import { createId } from "@/lib/cms/ids";
import type { PricingPlan } from "@/lib/cms/types";
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

function blankPlan(sortOrder: number): PricingPlan {
  const now = new Date().toISOString();
  return {
    id: createId("plan"),
    name: "New plan",
    slug: `plan-${sortOrder + 1}`,
    price: "0.00",
    duration: "/ month",
    badge: "",
    popular: false,
    features: ["Feature"],
    buttonLabel: "Choose Plan",
    buttonHref: "/contact/",
    sortOrder,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function PricingManager({ initialPlans }: { initialPlans: PricingPlan[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [editing, setEditing] = useState<PricingPlan | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () => plans.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [plans],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((plan) =>
      `${plan.name} ${plan.slug} ${plan.price} ${plan.duration}`.toLowerCase().includes(q),
    );
  }, [sorted, query]);

  async function save(plan: PricingPlan) {
    setSaving(true);
    const result = await savePlanAction(plan);
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setPlans((current) => {
      const exists = current.some((item) => item.id === result.plan.id);
      return exists ? current.map((item) => (item.id === result.plan.id ? result.plan : item)) : [...current, result.plan];
    });
    setEditing(null);
    setMessage({ tone: "ok", text: "Plan saved. Public pricing sections that use the central list will update." });
  }

  async function remove(id: string) {
    if (!confirm("Delete this plan?")) return;
    const result = await deletePlanAction(id);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setPlans((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-4">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <DataTableShell
        toolbar={
          <TableToolbar>
            <TableSearch
              id="pricing-search"
              label="Search plans"
              placeholder="Search name or price…"
              value={query}
              onChange={setQuery}
            />
            <Button
              type="button"
              variant="primary"
              className="min-h-9"
              onClick={() => setEditing(blankPlan(plans.length + 1))}
            >
              Add plan
            </Button>
          </TableToolbar>
        }
      >
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={plans.length === 0 ? "No pricing plans yet" : "No matching plans"}
              description={
                plans.length === 0
                  ? "Add a plan used by Home and IPTV Subscription pricing sections."
                  : "Try a different search term."
              }
              action={
                plans.length === 0 ? (
                  <Button
                    type="button"
                    variant="primary"
                    className="min-h-9"
                    onClick={() => setEditing(blankPlan(1))}
                  >
                    Add plan
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
                    <Th>Name</Th>
                    <Th>Price</Th>
                    <Th hideBelow="md">Order</Th>
                    <Th>Status</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </TableHead>
                <tbody>
                  {filtered.map((plan) => (
                    <TableRow key={plan.id}>
                      <Td className="font-medium">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {plan.name}
                          {plan.popular ? <StatusBadge tone="info">Popular</StatusBadge> : null}
                        </span>
                      </Td>
                      <Td>
                        {formatGbpPrice(plan.price)} {plan.duration}
                      </Td>
                      <Td hideBelow="md" className="text-muted">
                        {plan.sortOrder}
                      </Td>
                      <Td>
                        <StatusBadge tone={plan.active ? "success" : "neutral"}>
                          {plan.active ? "Active" : "Hidden"}
                        </StatusBadge>
                      </Td>
                      <Td>
                        <ListActions>
                          <ListActionButton onClick={() => setEditing(plan)}>Edit</ListActionButton>
                          <ListActionButton variant="danger" onClick={() => void remove(plan.id)}>
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
              {filtered.map((plan) => (
                <ListCard key={plan.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{plan.name}</p>
                      <p className="text-sm text-muted">
                        {formatGbpPrice(plan.price)} {plan.duration}
                      </p>
                    </div>
                    <StatusBadge tone={plan.active ? "success" : "neutral"}>
                      {plan.active ? "Active" : "Hidden"}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-muted">
                    Order {plan.sortOrder}
                    {plan.popular ? " · Popular" : ""}
                  </p>
                  <ListActions>
                    <ListActionButton onClick={() => setEditing(plan)}>Edit</ListActionButton>
                    <ListActionButton variant="danger" onClick={() => void remove(plan.id)}>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <TextInput value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
              </Field>
              <Field label="Slug">
                <TextInput value={editing.slug} onChange={(event) => setEditing({ ...editing, slug: event.target.value })} />
              </Field>
              <Field label="Price" hint="Amount only. Public pages display this in pounds (£).">
                <TextInput value={editing.price} onChange={(event) => setEditing({ ...editing, price: event.target.value })} />
              </Field>
              <Field label="Duration">
                <TextInput value={editing.duration} onChange={(event) => setEditing({ ...editing, duration: event.target.value })} />
              </Field>
              <Field label="Badge">
                <TextInput value={editing.badge} onChange={(event) => setEditing({ ...editing, badge: event.target.value })} />
              </Field>
              <Field label="Sort order">
                <TextInput
                  type="number"
                  value={editing.sortOrder}
                  onChange={(event) => setEditing({ ...editing, sortOrder: Number(event.target.value) || 0 })}
                />
              </Field>
              <Field label="Button label">
                <TextInput value={editing.buttonLabel} onChange={(event) => setEditing({ ...editing, buttonLabel: event.target.value })} />
              </Field>
              <Field
                label="Button URL"
                hint="Ignored on the public site while WhatsApp is enabled. Choose Plan opens WhatsApp with this plan's name, price, and duration."
              >
                <TextInput value={editing.buttonHref} onChange={(event) => setEditing({ ...editing, buttonHref: event.target.value })} />
              </Field>
            </div>
            <Field label="Features" hint="One per line">
              <TextArea
                value={editing.features.join("\n")}
                onChange={(event) =>
                  setEditing({ ...editing, features: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })
                }
              />
            </Field>
            <label className="mr-4 text-sm">
              <input type="checkbox" checked={editing.popular} onChange={(event) => setEditing({ ...editing, popular: event.target.checked })} /> Popular
            </label>
            <label className="text-sm">
              <input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /> Active
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Saving…" : "Save plan"}
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
