import { assertProfessionalSeedCopy } from "@/lib/cms/dev-copy";
import { defaultPageSeo } from "@/lib/seo";
import type {
  BlogCategory,
  BlogPost,
  CmsPage,
  CmsSection,
  FaqItem,
  NavLink,
  PricingPlan,
  SectionType,
  SiteSettings,
} from "@/lib/cms/types";
import { createId } from "@/lib/cms/ids";
import { HOME_SEO_LONGFORM, SEO_LONGFORM_HOME_ID, SUBSCRIPTION_SEO_LONGFORM } from "@/lib/cms/seo-longform";
import { ORDER_PROCESS_HOW_IT_WORKS } from "@/lib/cms/order-process";

const PLAN_FEATURES = [
  "Live TV on compatible devices",
  "Films and series on demand",
  "HD and FHD, with 4K where available",
  "Firestick, Smart TV, mobile and laptop",
  "Setup help through WhatsApp",
  "7-Day Money Back Guarantee",
];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  highlights: "Highlights",
  "how-it-works": "How It Works",
  services: "Services",
  pricing: "Pricing",
  devices: "Devices",
  "trust-stats": "Trust Stats",
  "why-choose": "Why Choose Us",
  faq: "FAQ",
  cta: "Final CTA",
  "page-hero": "Page Hero",
  "rich-text": "Rich Text",
  "rich-content": "Rich Content / Long Description",
  "info-cards": "Info Cards",
  "contact-info": "Contact Information",
  "contact-form": "Contact Form",
  "messaging-cta": "WhatsApp / Telegram CTA",
  hours: "Support Hours",
};

export function createDefaultSectionData(type: SectionType): CmsSection["data"] {
  switch (type) {
    case "hero":
      return {
        badge: "UK streaming for British households",
        heading: "Your Entertainment.",
        highlight: "Your Way.",
        description:
          "Live TV, films and series on the devices you already use at home — Firestick, Smart TV, phone, tablet and laptop. Message us on WhatsApp to get set up.",
        primaryLabel: "Get Started",
        primaryHref: "/iptv-subscriptions-uk/",
        secondaryLabel: "View Plans",
        secondaryHref: "/iptv-subscriptions-uk/",
        trustItems: [
          { id: "hero-t1", icon: "Zap", label: "Simple Setup" },
          { id: "hero-t2", icon: "ShieldCheck", label: "7-Day Guarantee" },
          { id: "hero-t3", icon: "Clock3", label: "WhatsApp Support" },
        ],
        showcaseBrand: "THE FLIX",
        showcaseEyebrow: "Featured",
        showcaseTitle: "City Lights",
        showcaseMeta: "4K · Drama · 2026",
        showcaseRowLabel: "Continue Watching",
        posters: [
          { id: "p1", title: "Nightfall" },
          { id: "p2", title: "Empire" },
          { id: "p3", title: "Aurora" },
          { id: "p4", title: "Crown" },
          { id: "p5", title: "Pulse" },
        ],
      };
    case "highlights":
      return {
        items: [
          { id: "hl1", icon: "Radio", label: "Live TV streaming", subtitle: "" },
          { id: "hl2", icon: "Clapperboard", label: "Films and series", subtitle: "" },
          { id: "hl3", icon: "SignalHigh", label: "HD / FHD / 4K", subtitle: "" },
          { id: "hl4", icon: "MonitorSmartphone", label: "Multi-device", subtitle: "" },
          { id: "hl5", icon: "Headphones", label: "WhatsApp support", subtitle: "" },
          { id: "hl6", icon: "ShieldCheck", label: "7-Day Guarantee", subtitle: "" },
        ],
      };
    case "how-it-works":
      return {
        ...ORDER_PROCESS_HOW_IT_WORKS,
        steps: ORDER_PROCESS_HOW_IT_WORKS.steps.map((step) => ({ ...step })),
      };
    case "services":
      return {
        eyebrow: "",
        heading: "Everything You Want to Watch",
        description:
          "Live television, blockbuster movies, and a personal watchlist — built for how you actually watch.",
        cards: [
          {
            id: "svc1",
            icon: "Tv",
            title: "Live TV",
            description:
              "News, sports, entertainment, and international channels from around the world — all in one guide.",
            linkLabel: "Explore",
            linkHref: "/iptv-subscriptions-uk/",
            tone: "red",
          },
          {
            id: "svc2",
            icon: "Clapperboard",
            title: "Movies & Series",
            description:
              "A massive on-demand library with the latest releases, classics, and binge-worthy series in HD & 4K.",
            linkLabel: "Explore",
            linkHref: "/iptv-subscriptions-uk/",
            tone: "purple",
          },
          {
            id: "svc3",
            icon: "Heart",
            title: "Favorites",
            description:
              "Save the channels and shows you love. Pick up right where you left off on any device.",
            linkLabel: "Explore",
            linkHref: "/iptv-subscriptions-uk/",
            tone: "green",
          },
        ],
      };
    case "pricing":
      return {
        eyebrow: "",
        heading: "Simple, Transparent Pricing",
        description:
          "View our current streaming packages below. Names and prices are managed centrally so they stay current.",
        useCentralPlans: true,
        plans: [
          {
            id: "plan-1",
            name: "1 Month Plan",
            price: "15.99",
            duration: "/ month",
            badge: "",
            popular: false,
            features: PLAN_FEATURES,
            buttonLabel: "Choose Plan",
            buttonHref: "/contact/",
          },
          {
            id: "plan-12",
            name: "12 Months Plan",
            price: "69.99",
            duration: "/ year",
            badge: "Most Popular",
            popular: true,
            features: PLAN_FEATURES,
            buttonLabel: "Choose Plan",
            buttonHref: "/contact/",
          },
          {
            id: "plan-3",
            name: "3 Months Plan",
            price: "35.99",
            duration: "/ 3 months",
            badge: "",
            popular: false,
            features: PLAN_FEATURES,
            buttonLabel: "Choose Plan",
            buttonHref: "/contact/",
          },
        ],
      };
    case "devices":
      return {
        eyebrow: "Works on all your devices",
        heading: "",
        items: [
          { id: "d1", icon: "Tv", label: "Smart TV" },
          { id: "d2", icon: "Smartphone", label: "Android" },
          { id: "d3", icon: "Tablet", label: "iOS" },
          { id: "d4", icon: "Monitor", label: "Firestick" },
          { id: "d5", icon: "Laptop", label: "PC / Mac" },
          { id: "d6", icon: "Tablet", label: "MAG Box" },
        ],
      };
    case "trust-stats":
      return {
        items: [
          { id: "ts1", icon: "Tv", value: "Live TV", label: "On your television" },
          { id: "ts2", icon: "Clapperboard", value: "On demand", label: "Films & series" },
          { id: "ts3", icon: "ShieldCheck", value: "7-day", label: "Money Back Guarantee" },
          { id: "ts4", icon: "Headphones", value: "WhatsApp", label: "Setup & support" },
        ],
      };
    case "why-choose":
      return {
        eyebrow: "Why Choose Us?",
        heading: "Built for Everyday Watching",
        description: "",
        items: [
          {
            id: "wc1",
            icon: "SignalHigh",
            title: "High Quality Streams",
            description:
              "Watchable HD and 4K on the devices you already own, for everyday British evenings.",
          },
          {
            id: "wc2",
            icon: "Zap",
            title: "Instant Activation",
            description:
              "Pay once and start watching in minutes. Message us on WhatsApp for setup and account details.",
          },
          {
            id: "wc3",
            icon: "MonitorSmartphone",
            title: "All Devices Welcome",
            description:
              "Firestick, Fire TV, Smart TV, Android TV, phone, tablet and laptop — one subscription for the house.",
          },
          {
            id: "wc4",
            icon: "Lock",
            title: "Secure & Private",
            description:
              "Encrypted checkout and private connections. We don’t share your data or flood you with ads.",
          },
          {
            id: "wc5",
            icon: "ShieldCheck",
            title: "Reliable Network",
            description:
              "A UK-focused streaming service with a 7-Day Money Back Guarantee if it is not the right fit.",
          },
          {
            id: "wc6",
            icon: "Headphones",
            title: "24/7 Support",
            description:
              "Real people on WhatsApp when you need help with setup, devices, or your plan.",
          },
        ],
      };
    case "faq":
      return {
        eyebrow: "",
        heading: "Frequently Asked Questions",
        description:
          "Quick answers about setup, devices, and billing. Still stuck? Chat with us on WhatsApp.",
        sourceMode: "category",
        useCentralFaqs: true,
        category: "General",
        selectedFaqIds: [],
        maxItems: 0,
        items: [
          {
            id: "faq1",
            question: "What do I need to get started?",
            answer:
              "A stable internet connection and a compatible device: Firestick, Smart TV, Android TV, phone, tablet or laptop.",
          },
          {
            id: "faq2",
            question: "How fast will I receive my subscription?",
            answer:
              "Activation follows payment. Message us on WhatsApp if you need help getting started.",
          },
          {
            id: "faq3",
            question: "Can I use it on more than one device?",
            answer:
              "You can use the service on compatible devices in the house. If two rooms need to watch at once, ask on WhatsApp before you start so you pick a package that fits.",
          },
          {
            id: "faq4",
            question: "Do you offer a refund or trial?",
            answer:
              "We offer a 7-Day Money Back Guarantee. If the service is not suitable, contact us on WhatsApp within the applicable 7-day period.",
          },
          {
            id: "faq5",
            question: "Which apps should I use?",
            answer:
              "Compatible streaming apps depend on your device. Message us on WhatsApp and we will recommend a player that fits your Firestick, Smart TV, or phone.",
          },
          {
            id: "faq6",
            question: "Is my payment secure?",
            answer:
              "If you have a billing question, message us on WhatsApp.",
          },
        ],
      };
    case "cta":
      return {
        heading: "Ready to start watching?",
        description:
          "Choose a streaming package, then message us on WhatsApp for setup on Firestick, Smart TV, or the device you already own.",
        buttonLabel: "Get Started",
        buttonHref: "/contact/",
      };
    case "page-hero":
      return {
        eyebrow: "The Flix",
        heading: "Page title",
        highlight: "",
        description: "Short supporting text for this page.",
      };
    case "rich-text":
      return {
        heading: "",
        html: "<p>Add your content here.</p>",
      };
    case "rich-content":
      return {
        eyebrow: "",
        heading: "",
        html: "<p>Write a longer description, comparison, or SEO article block here.</p>",
        buttonLabel: "",
        buttonHref: "",
        width: "narrow",
        scrollable: false,
        scrollHeight: "standard",
        ctaSource: "custom",
      };
    case "info-cards":
      return {
        eyebrow: "",
        heading: "Highlights",
        description: "",
        cards: [
          {
            id: "info-1",
            icon: "Check",
            title: "Card title",
            description: "Short supporting copy for this card.",
          },
        ],
      };
    case "contact-info":
      return {
        heading: "Contact details",
        description: "For subscriptions, payment details, setup and support, message our team directly on WhatsApp.",
      };
    case "contact-form":
      return {
        heading: "Send a message",
        description: "For general questions you can use this form. For subscriptions, payment details and setup, WhatsApp is the fastest way to reach us.",
        nameLabel: "Name",
        emailLabel: "Email",
        phoneLabel: "Phone (optional)",
        subjectLabel: "Subject",
        messageLabel: "Message",
        buttonLabel: "Send message",
        successMessage: "Thanks — your message was received. We will get back to you shortly.",
      };
    case "messaging-cta":
      return {
        heading: "Chat with us on WhatsApp",
        description: "For subscriptions, payment details, setup and support, message our team directly on WhatsApp.",
        whatsappLabel: "Chat on WhatsApp",
        telegramLabel: "Open Telegram",
      };
    case "hours":
      return {
        heading: "Support hours",
        description: "Hours come from Site Settings so they stay consistent across the site.",
      };
  }
}

export function createSection(type: SectionType, order: number): CmsSection {
  return {
    id: createId("sec"),
    type,
    label: SECTION_LABELS[type],
    order,
    visible: true,
    data: createDefaultSectionData(type),
  };
}

export function createHomeSections(): CmsSection[] {
  const types: SectionType[] = [
    "hero",
    "highlights",
    "how-it-works",
    "services",
    "pricing",
    "devices",
    "trust-stats",
    "why-choose",
    "rich-content",
    "faq",
    "cta",
  ];
  return types.map((type, index) => ({
    id: type === "rich-content" ? SEO_LONGFORM_HOME_ID : `sec-home-${type}`,
    type,
    label: SECTION_LABELS[type],
    order: index + 1,
    visible: true,
    data: type === "rich-content" ? HOME_SEO_LONGFORM : createDefaultSectionData(type),
  }));
}

function nav(id: string, label: string, href: string): NavLink {
  return { id, label, href, visible: true };
}

export function createSubscriptionSections(): CmsSection[] {
  const hero = createSection("page-hero", 1);
  hero.id = "sec-sub-hero";
  hero.data = {
    eyebrow: "UK streaming packages",
    heading: "Streaming subscriptions",
    highlight: "Built for Everyday Watching",
    description:
      "Live TV, films and series on the devices you already own. Choose a package, then message us on WhatsApp to get set up.",
  };
  const intro = createSection("rich-text", 2);
  intro.id = "sec-sub-intro";
  intro.label = "Intro";
  intro.data = {
    heading: "",
    html: "<p>Choose a plan, then tap Choose Plan to message us on WhatsApp. Our team will send payment details manually, then set you up after payment is confirmed.</p>",
  };
  const pricing = createSection("pricing", 3);
  pricing.id = "sec-sub-pricing";
  const longform = createSection("rich-content", 4);
  longform.id = "sec-sub-longform";
  longform.data = SUBSCRIPTION_SEO_LONGFORM;
  const benefits = createSection("info-cards", 5);
  benefits.id = "sec-sub-benefits";
  benefits.label = "Benefits";
  benefits.data = {
    eyebrow: "",
    heading: "Why subscribers choose The Flix",
    description: "Enjoy reliable streaming, flexible plans, easy setup, and WhatsApp support.",
    cards: [
      { id: "ben-1", icon: "Tv", title: "Live sports & news", description: "Follow leagues, breaking news, and international channels without juggling apps." },
      { id: "ben-2", icon: "Clapperboard", title: "On-demand library", description: "Movies and series in HD, FHD, and 4K so you can catch up whenever you want." },
      { id: "ben-3", icon: "Zap", title: "Simple setup", description: "Most customers are watching within minutes on Firestick, Smart TV, or phone." },
      { id: "ben-4", icon: "Headphones", title: "Support when you need it", description: "WhatsApp help for setup, device questions, and plan changes." },
    ],
  };
  const how = createSection("how-it-works", 6);
  how.id = "sec-sub-how";
  const devices = createSection("devices", 7);
  devices.id = "sec-sub-devices";
  const info = createSection("info-cards", 8);
  info.id = "sec-sub-info";
  info.label = "Good to know";
  info.data = {
    eyebrow: "",
    heading: "Good to know",
    description: "A few practical notes before you message us on WhatsApp.",
    cards: [
      { id: "info-1", icon: "Users", title: "Who this is for", description: "British households that want live TV and on-demand titles on the devices they already own." },
      { id: "info-2", icon: "Headphones", title: "What you receive", description: "Account information and setup help through WhatsApp, for the billed period you choose." },
      { id: "info-3", icon: "ShieldCheck", title: "If it is not a fit", description: "A 7-Day Money Back Guarantee. If the service is not suitable, contact us on WhatsApp within the applicable 7-day period." },
    ],
  };
  const faq = createSection("faq", 9);
  faq.id = "sec-sub-faq";
  (faq.data as { category: string }).category = "Subscription";
  const cta = createSection("cta", 10);
  cta.id = "sec-sub-cta";
  cta.data = {
    heading: "Ready to choose a plan?",
    description: "Choose a streaming package above, then message us on WhatsApp to get set up.",
    buttonLabel: "Talk to support",
    buttonHref: "/contact/",
  };
  return [hero, intro, pricing, longform, benefits, how, devices, info, faq, cta];
}

export function createContactSections(): CmsSection[] {
  const hero = createSection("page-hero", 1);
  hero.id = "sec-contact-hero";
  hero.data = {
    eyebrow: "Support",
    heading: "Contact",
    highlight: "The Flix",
    description: "For subscriptions, payment details, setup and support, contact us directly on WhatsApp.",
  };
  const info = createSection("contact-info", 2);
  info.id = "sec-contact-info";
  const form = createSection("contact-form", 3);
  form.id = "sec-contact-form";
  const chat = createSection("messaging-cta", 4);
  chat.id = "sec-contact-chat";
  const hours = createSection("hours", 5);
  hours.id = "sec-contact-hours";
  const faq = createSection("faq", 6);
  faq.id = "sec-contact-faq";
  (faq.data as { category: string }).category = "Contact";
  return [hero, info, form, chat, hours, faq];
}

export function defaultPages(): CmsPage[] {
  return [
    {
      id: "page-home",
      name: "Home",
      slug: "/",
      status: "published",
      cmsEnabled: true,
      sections: createHomeSections(),
    },
    {
      id: "page-subscriptions",
      name: "IPTV Subscription",
      slug: "/iptv-subscriptions-uk/",
      status: "published",
      cmsEnabled: true,
      sections: createSubscriptionSections(),
    },
    {
      id: "page-contact",
      name: "Contact",
      slug: "/contact/",
      status: "published",
      cmsEnabled: true,
      sections: createContactSections(),
    },
  ];
}

export function defaultSettings(): SiteSettings {
  return {
    siteName: "THE FLIX IPTV",
    tagline: "Your Entertainment. Your Way.",
    email: "support@theflixiptv.com",
    phone: "",
    whatsapp: "",
    whatsappDisplay: "",
    whatsappMessage: "Hi The Flix, I need help with my IPTV plan.",
    whatsappEnabled: false,
    hours: "24/7 support",
    location: "Available worldwide",
    telegramUrl: "",
    telegramEnabled: false,
    socials: {
      facebook: { url: "", visible: false },
      instagram: { url: "", visible: false },
      twitter: { url: "", visible: false },
      youtube: { url: "", visible: false },
      telegram: { url: "", visible: false },
    },
    headerNav: [
      nav("nav-home", "Home", "/welcome/"),
      nav("nav-iptv", "IPTV Subscription", "/iptv-subscriptions-uk/"),
      nav("nav-blog", "Blog", "/blog/"),
      nav("nav-contact", "Contact", "/contact/"),
    ],
    headerCtaLabel: "Get Started",
    headerCtaHref: "/iptv-subscriptions-uk/",
    footerIntro:
      "Premium IPTV with live channels, movies, and series on every device. Reliable streams. Honest pricing.",
    footerCopyright: "All rights reserved.",
    footerQuickLinks: [
      nav("fq-home", "Home", "/welcome/"),
      nav("fq-iptv", "IPTV Subscription", "/iptv-subscriptions-uk/"),
      nav("fq-blog", "Blog", "/blog/"),
      nav("fq-contact", "Contact", "/contact/"),
    ],
    footerSupportLinks: [
      nav("fs-contact", "Contact", "/contact/"),
      nav("fs-faq", "FAQ", "/welcome/#faq"),
      nav("fs-plans", "Plans", "/iptv-subscriptions-uk/"),
    ],
    footerPaymentImages: [],
    branding: {
      logo: null,
      logoAlt: "THE FLIX IPTV",
      favicon: null,
      defaultOgImage: null,
    },
    pageSeo: {
      home: defaultPageSeo("Welcome", "Stream live TV, movies, and series with THE FLIX IPTV.", "/welcome/"),
      subscriptions: defaultPageSeo(
        "IPTV Subscriptions UK",
        "IPTV plans, devices, and FAQs for THE FLIX IPTV.",
        "/iptv-subscriptions-uk/",
      ),
      contact: defaultPageSeo("Contact", "Contact THE FLIX IPTV on WhatsApp for plans, payment details, and setup.", "/contact/"),
      blog: defaultPageSeo("Blog", "Guides and updates from THE FLIX IPTV.", "/blog/"),
    },
  };
}

export function defaultPricingPlans(): PricingPlan[] {
  const now = new Date().toISOString();
  const data = createDefaultSectionData("pricing") as {
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
  return data.plans.map((plan, index) => ({
    ...plan,
    slug: plan.id,
    sortOrder: index + 1,
    active: true,
    createdAt: now,
    updatedAt: now,
  }));
}

export function defaultFaqs(): FaqItem[] {
  const now = new Date().toISOString();
  const home = createDefaultSectionData("faq") as {
    items: Array<{ id: string; question: string; answer: string }>;
  };
  const contact = [
    {
      id: "cf1",
      question: "How quickly do you reply?",
      answer: "Support aims to reply around the clock on WhatsApp.",
      category: "Contact",
    },
    {
      id: "cf2",
      question: "Can I ask about an existing order?",
      answer: "Yes — include your email in the form so we can match your request.",
      category: "Contact",
    },
    {
      id: "cf3",
      question: "Do you help with Firestick setup?",
      answer: "Yes. Message us on WhatsApp and we will talk you through Firestick setup.",
      category: "Contact",
    },
  ];
  return [
    ...home.items.map((item, index) => ({
      ...item,
      category: "General",
      sortOrder: index + 1,
      visible: true,
      createdAt: now,
      updatedAt: now,
    })),
    ...contact.map((item, index) => ({
      ...item,
      sortOrder: index + 1,
      visible: true,
      createdAt: now,
      updatedAt: now,
    })),
  ];
}

export function defaultBlogCategories(): BlogCategory[] {
  const now = new Date().toISOString();
  return [
    { id: "cat-setup", name: "Setup", slug: "setup", description: "Device and playlist setup guides.", active: true, createdAt: now, updatedAt: now },
    { id: "cat-devices", name: "Devices", slug: "devices", description: "Smart TVs, Firestick, and apps.", active: true, createdAt: now, updatedAt: now },
    { id: "cat-quality", name: "Quality", slug: "quality", description: "Streaming quality and bandwidth.", active: true, createdAt: now, updatedAt: now },
    { id: "cat-guides", name: "Guides", slug: "guides", description: "Getting started with The Flix.", active: true, createdAt: now, updatedAt: now },
  ];
}

export function defaultBlogPosts(): BlogPost[] {
  const now = new Date().toISOString();
  return [
    {
      id: "post-firestick",
      title: "How to Watch IPTV on Firestick",
      slug: "how-to-watch-iptv-on-firestick",
      excerpt:
        "A local demo guide covering the usual Firestick apps, playlist steps, and what to check if the stream will not load.",
      content:
        "<h2>Install a player</h2><p>Most Firestick viewers install a player, add a playlist or Xtream details, then pin the app to the home row.</p><h3>If a channel fails</h3><p>Check internet speed, try another server line, and confirm the subscription is still active.</p>",
      categoryId: "cat-setup",
      featuredImage: null,
      status: "published",
      featured: true,
      publishedAt: "2026-08-12T10:00:00.000Z",
      createdAt: now,
      updatedAt: now,
      seoTitle: "",
      seoDescription: "",
      focusKeyword: "firestick iptv",
      canonicalUrl: "",
      robotsIndex: true,
      robotsFollow: true,
      ogTitle: "",
      ogDescription: "",
      ogImage: null,
      sitemapInclude: true,
    },
    {
      id: "post-smart-tv",
      title: "Best IPTV Apps for Smart TVs",
      slug: "best-iptv-apps-for-smart-tvs",
      excerpt: "A short overview of common Smart TV players and why a stable playlist matters more than the app brand.",
      content:
        "<p>Smart TVs vary by brand. Some use built-in apps; others work better with a Firestick or Android box.</p><p>Look for EPG support, catch-up if your plan includes it, and a simple favorites row.</p>",
      categoryId: "cat-devices",
      featuredImage: null,
      status: "published",
      featured: false,
      publishedAt: "2026-08-05T10:00:00.000Z",
      createdAt: now,
      updatedAt: now,
      seoTitle: "",
      seoDescription: "",
      focusKeyword: "",
      canonicalUrl: "",
      robotsIndex: true,
      robotsFollow: true,
      ogTitle: "",
      ogDescription: "",
      ogImage: null,
      sitemapInclude: true,
    },
    {
      id: "post-hd-4k",
      title: "HD vs 4K Streaming: What You Need",
      slug: "hd-vs-4k-streaming-what-you-need",
      excerpt: "Bandwidth, TV capability, and source quality all matter. Here is a plain-language explainer.",
      content:
        "<p>HD is enough for many living rooms. 4K needs a 4K panel and a stronger connection — typically 25 Mbps or more.</p><p>If the picture stutters, drop to FHD before assuming the service is down.</p>",
      categoryId: "cat-quality",
      featuredImage: null,
      status: "published",
      featured: false,
      publishedAt: "2026-07-28T10:00:00.000Z",
      createdAt: now,
      updatedAt: now,
      seoTitle: "",
      seoDescription: "",
      focusKeyword: "",
      canonicalUrl: "",
      robotsIndex: true,
      robotsFollow: true,
      ogTitle: "",
      ogDescription: "",
      ogImage: null,
      sitemapInclude: true,
    },
    {
      id: "post-getting-started",
      title: "Getting Started with The Flix",
      slug: "getting-started-with-the-flix",
      excerpt: "Choose a plan, receive details, and start watching. A walkthrough that mirrors How It Works on Home.",
      content:
        "<p>Pick a plan on the subscription page.</p><p>Message us on WhatsApp for setup and account details. Sales and setup are handled there, not by email.</p>",
      categoryId: "cat-guides",
      featuredImage: null,
      status: "published",
      featured: false,
      publishedAt: "2026-07-20T10:00:00.000Z",
      createdAt: now,
      updatedAt: now,
      seoTitle: "",
      seoDescription: "",
      focusKeyword: "",
      canonicalUrl: "",
      robotsIndex: true,
      robotsFollow: true,
      ogTitle: "",
      ogDescription: "",
      ogImage: null,
      sitemapInclude: true,
    },
  ];
}

export function mergeSectionData(type: SectionType, data: unknown): CmsSection["data"] {
  const fallback = createDefaultSectionData(type);
  if (!data || typeof data !== "object" || Array.isArray(data)) return fallback;
  return { ...fallback, ...(data as Record<string, unknown>) } as CmsSection["data"];
}

assertProfessionalSeedCopy(JSON.stringify(defaultPages()), "default pages");
assertProfessionalSeedCopy(JSON.stringify(defaultFaqs()), "default FAQs");
