import type { FaqData, FaqItem, PricingData, PricingPlan } from "@/lib/cms/types";

export function resolvePricingData(data: PricingData, plans: PricingPlan[]): PricingData {
  if (!data.useCentralPlans) return data;
  return {
    ...data,
    plans: plans
      .filter((plan) => plan.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        price: plan.price,
        duration: plan.duration,
        badge: plan.badge,
        popular: plan.popular,
        features: plan.features,
        buttonLabel: plan.buttonLabel,
        buttonHref: plan.buttonHref,
      })),
  };
}

function toFaqRow(item: FaqItem) {
  return {
    id: item.id,
    question: item.question,
    answer: item.answer,
  };
}

function applyMax(items: FaqData["items"], maxItems: number) {
  if (!maxItems || maxItems <= 0) return items;
  return items.slice(0, maxItems);
}

export function resolveFaqData(data: FaqData, faqs: FaqItem[]): FaqData {
  const visible = faqs.filter((item) => item.visible);
  const selectedIds = Array.isArray(data.selectedFaqIds) ? data.selectedFaqIds : [];
  const mode: "category" | "selected" | "inline" =
    data.sourceMode === "selected"
      ? "selected"
      : data.sourceMode === "category"
        ? "category"
        : data.useCentralFaqs === false
          ? "inline"
          : "category";

  if (mode === "selected") {
    const byId = new Map(visible.map((item) => [item.id, item]));
    const items = selectedIds
      .map((id) => byId.get(id))
      .filter((item): item is FaqItem => Boolean(item))
      .map(toFaqRow);
    return { ...data, items: applyMax(items, data.maxItems) };
  }

  if (mode === "inline") {
    return data;
  }

  const category = (data.category || "").trim();
  const items = visible
    .filter((item) => !category || item.category === category)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(toFaqRow);
  return { ...data, items: applyMax(items, data.maxItems) };
}
