"use client";

import { useState } from "react";
import { deletePlanAction, savePlanAction } from "@/lib/cms/actions";
import { createId } from "@/lib/cms/ids";
import type { PricingPlan } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";

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
      <button
        type="button"
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
        onClick={() => setEditing(blankPlan(plans.length + 1))}
      >
        Add plan
      </button>
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {plans
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((plan) => (
                <tr key={plan.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">
                    {plan.name} {plan.popular ? <span className="text-xs text-brand">Popular</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {plan.price} {plan.duration}
                  </td>
                  <td className="px-4 py-3">{plan.active ? "Active" : "Hidden"}</td>
                  <td className="px-4 py-3">
                    <button type="button" className="mr-3 font-semibold text-brand" onClick={() => setEditing(plan)}>
                      Edit
                    </button>
                    <button type="button" className="text-red-700" onClick={() => void remove(plan.id)}>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <TextInput value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
            </Field>
            <Field label="Slug">
              <TextInput value={editing.slug} onChange={(event) => setEditing({ ...editing, slug: event.target.value })} />
            </Field>
            <Field label="Price">
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
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
              {saving ? "Saving…" : "Save plan"}
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
