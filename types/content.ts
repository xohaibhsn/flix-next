export type NavItem = {
  label: string;
  href: string;
};

export type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  note?: string;
  featured?: boolean;
  features: string[];
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  date: string;
  content: string[];
};

export type ServiceCard = {
  title: string;
  text: string;
  href: string;
  tone: "red" | "purple" | "green";
};

export type HowItWorksStep = {
  n: string;
  title: string;
  text: string;
};

export type TrustStat = {
  value: string;
  label: string;
};

export type Reason = {
  title: string;
  text: string;
};
