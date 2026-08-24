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
  | "cta"
  | "page-hero"
  | "rich-text"
  | "rich-content"
  | "info-cards"
  | "contact-info"
  | "contact-form"
  | "messaging-cta"
  | "hours";

export type PageStatus = "draft" | "published";
export type PostStatus = "draft" | "published";
export type RedirectStatus = 301 | 302 | 307 | 308;

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

export type NavLink = {
  id: string;
  label: string;
  href: string;
  visible: boolean;
};

export type SocialPlatform = {
  url: string;
  visible: boolean;
};

export type SocialLinks = {
  facebook: SocialPlatform;
  instagram: SocialPlatform;
  twitter: SocialPlatform;
  youtube: SocialPlatform;
  telegram: SocialPlatform;
};

export type PageSeo = {
  title: string;
  description: string;
  focusKeyword: string;
  canonicalUrl: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImage: MediaRef | null;
  sitemapInclude: boolean;
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
  useCentralPlans: boolean;
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

export type FaqSourceMode = "category" | "selected";

export type FaqData = {
  eyebrow: string;
  heading: string;
  description: string;
  sourceMode: FaqSourceMode;
  useCentralFaqs: boolean;
  category: string;
  selectedFaqIds: string[];
  maxItems: number;
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

export type PageHeroData = {
  eyebrow: string;
  heading: string;
  highlight: string;
  description: string;
};

export type RichTextData = {
  heading: string;
  html: string;
};

export type RichContentWidth = "normal" | "narrow" | "wide";

export type RichContentData = {
  eyebrow: string;
  heading: string;
  html: string;
  buttonLabel: string;
  buttonHref: string;
  width: RichContentWidth;
};

export type InfoCardsData = {
  eyebrow: string;
  heading: string;
  description: string;
  cards: Array<{
    id: string;
    icon: string;
    title: string;
    description: string;
  }>;
};

export type ContactInfoData = {
  heading: string;
  description: string;
};

export type ContactFormData = {
  heading: string;
  description: string;
  nameLabel: string;
  emailLabel: string;
  phoneLabel: string;
  subjectLabel: string;
  messageLabel: string;
  buttonLabel: string;
  successMessage: string;
};

export type MessagingCtaData = {
  heading: string;
  description: string;
  whatsappLabel: string;
  telegramLabel: string;
};

export type HoursData = {
  heading: string;
  description: string;
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
  "page-hero": PageHeroData;
  "rich-text": RichTextData;
  "rich-content": RichContentData;
  "info-cards": InfoCardsData;
  "contact-info": ContactInfoData;
  "contact-form": ContactFormData;
  "messaging-cta": MessagingCtaData;
  hours: HoursData;
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
  whatsappDisplay: string;
  whatsappMessage: string;
  whatsappEnabled: boolean;
  hours: string;
  location: string;
  telegramUrl: string;
  telegramEnabled: boolean;
  socials: SocialLinks;
  headerNav: NavLink[];
  headerCtaLabel: string;
  headerCtaHref: string;
  footerIntro: string;
  footerCopyright: string;
  footerQuickLinks: NavLink[];
  footerSupportLinks: NavLink[];
  footerPaymentImages: MediaRef[];
  branding: {
    logo: MediaRef | null;
    logoAlt: string;
    favicon: MediaRef | null;
    defaultOgImage: MediaRef | null;
  };
  pageSeo: {
    home: PageSeo;
    subscriptions: PageSeo;
    contact: PageSeo;
    blog: PageSeo;
  };
};

export type PricingPlan = {
  id: string;
  name: string;
  slug: string;
  price: string;
  duration: string;
  badge: string;
  popular: boolean;
  features: string[];
  buttonLabel: string;
  buttonHref: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BlogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  categoryId: string | null;
  featuredImage: MediaRef | null;
  status: PostStatus;
  featured: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  seoTitle: string;
  seoDescription: string;
  focusKeyword: string;
  canonicalUrl: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImage: MediaRef | null;
  sitemapInclude: boolean;
};

export type RedirectRule = {
  id: string;
  sourcePath: string;
  destinationPath: string;
  statusCode: RedirectStatus;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  createdAt: string;
};

export type PagesFile = {
  pages: CmsPage[];
};

export type MediaFile = {
  assets: MediaAsset[];
};

export type CmsDashboardStats = {
  pages: number;
  posts: number;
  drafts: number;
  publishedPosts: number;
  faqs: number;
  plans: number;
  media: number;
  redirects: number;
  messages: number;
};
