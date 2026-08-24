export const FAQ_CATEGORIES = ["General", "Subscription", "Contact", "Blog"] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number];
