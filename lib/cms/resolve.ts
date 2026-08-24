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

export function resolveFaqData(data: FaqData, faqs: FaqItem[]): FaqData {
  if (!data.useCentralFaqs) return data;
  const category = data.category.trim();
  return {
    ...data,
    items: faqs
      .filter((item) => item.visible)
      .filter((item) => !category || item.category === category)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
      })),
  };
}
