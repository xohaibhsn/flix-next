export type SectionType =
  | "hero"
  | "highlights"
  | "how-it-works"
  | "services"
  | "pricing"
  | "devices"
  | "trust-stats"
  | "why-choose"
  | "faq"
  | "cta";

export type PageStatus = "draft" | "published";

export type MediaRef = {
  id: string;
  publicId: string;
  secureUrl: string;
};

export type MediaAsset = {
  id: string;
  publicId: string;
  secureUrl: string;
  folder: string;
  originalFilename: string;
  format: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  resourceType: string;
  createdAt: string;
  alt: string;
};

export type IconLabelItem = {
  id: string;
  icon: string;
  label: string;
};

export type HeroData = {
  badge: string;
  heading: string;
  highlight: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  trustItems: IconLabelItem[];
  showcaseBrand: string;
  showcaseEyebrow: string;
  showcaseTitle: string;
  showcaseMeta: string;
  showcaseRowLabel: string;
  posters: { id: string; title: string }[];
};

export type HighlightsData = {
  items: Array<IconLabelItem & { subtitle?: string }>;
};

export type HowItWorksData = {
  eyebrow: string;
  heading: string;
  description: string;
  steps: Array<{
    id: string;
    number: string;
    icon: string;
    title: string;
    description: string;
  }>;
};

export type ServicesData = {
  eyebrow: string;
  heading: string;
  description: string;
  cards: Array<{
    id: string;
    icon: string;
    title: string;
    description: string;
    linkLabel: string;
    linkHref: string;
    tone: "red" | "purple" | "green";
  }>;
};

export type PricingData = {
  eyebrow: string;
  heading: string;
  description: string;
  plans: Array<{
    id: string;
    name: string;
    price: string;
    duration: string;
    badge: string;
    popular: boolean;
    features: string[];
    buttonLabel: string;
    buttonHref: string;
  }>;
};

export type DevicesData = {
  eyebrow: string;
  heading: string;
  items: IconLabelItem[];
};

export type TrustStatsData = {
  items: Array<{
    id: string;
    icon: string;
    value: string;
    label: string;
  }>;
};

export type WhyChooseData = {
  eyebrow: string;
  heading: string;
  description: string;
  items: Array<{
    id: string;
    icon: string;
    title: string;
    description: string;
  }>;
};

export type FaqData = {
  eyebrow: string;
  heading: string;
  description: string;
  items: Array<{
    id: string;
    question: string;
    answer: string;
  }>;
};

export type CtaData = {
  heading: string;
  description: string;
  buttonLabel: string;
  buttonHref: string;
};

export type SectionDataMap = {
  hero: HeroData;
  highlights: HighlightsData;
  "how-it-works": HowItWorksData;
  services: ServicesData;
  pricing: PricingData;
  devices: DevicesData;
  "trust-stats": TrustStatsData;
  "why-choose": WhyChooseData;
  faq: FaqData;
  cta: CtaData;
};

export type CmsSection<T extends SectionType = SectionType> = {
  id: string;
  type: T;
  label: string;
  order: number;
  visible: boolean;
  data: SectionDataMap[T];
};

export type CmsPage = {
  id: string;
  name: string;
  slug: string;
  status: PageStatus;
  cmsEnabled: boolean;
  sections: CmsSection[];
};

export type SiteSettings = {
  siteName: string;
  tagline: string;
  email: string;
  phone: string;
  whatsapp: string;
  hours: string;
  location: string;
  branding: {
    logo: MediaRef | null;
    logoAlt: string;
    favicon: MediaRef | null;
    defaultOgImage: MediaRef | null;
  };
};

export type PagesFile = {
  pages: CmsPage[];
};

export type MediaFile = {
  assets: MediaAsset[];
};
