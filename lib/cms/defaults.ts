import type { CmsPage, CmsSection, SectionType, SiteSettings } from "@/lib/cms/types";
import { createId } from "@/lib/cms/ids";

const PLAN_FEATURES = [
  "20,000+ Live Channels (demo)",
  "80,000+ Movies & Series (demo)",
  "4K / FHD / HD Quality",
  "Anti-Freeze Technology",
  "All Devices Supported",
  "Instant Activation",
  "TV Guide (EPG)",
  "24/7 Customer Support",
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
};

export function createDefaultSectionData(type: SectionType): CmsSection["data"] {
  switch (type) {
    case "hero":
      return {
        badge: "Reliable Streaming. Anytime. Anywhere.",
        heading: "Your Entertainment.",
        highlight: "Your Way.",
        description:
          "Stream 20,000+ live TV channels and 80,000+ movies & series in stunning 4K. Instant setup on Smart TVs, phones, Firestick, and more.",
        primaryLabel: "Get Started",
        primaryHref: "/iptv-subscriptions-uk/",
        secondaryLabel: "View Plans",
        secondaryHref: "/iptv-subscriptions-uk/",
        trustItems: [
          { id: "hero-t1", icon: "Zap", label: "Instant Setup" },
          { id: "hero-t2", icon: "ShieldCheck", label: "99.9% Uptime" },
          { id: "hero-t3", icon: "Clock3", label: "24/7 Support" },
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
          { id: "hl1", icon: "Radio", label: "20,000+ Live TV Channels", subtitle: "" },
          { id: "hl2", icon: "Clapperboard", label: "80,000+ Movies & Series", subtitle: "" },
          { id: "hl3", icon: "SignalHigh", label: "HD / FHD / 4K", subtitle: "" },
          { id: "hl4", icon: "MonitorSmartphone", label: "Multi-device", subtitle: "" },
          { id: "hl5", icon: "Headphones", label: "24/7 Support", subtitle: "" },
          { id: "hl6", icon: "Zap", label: "99.9% Uptime", subtitle: "" },
        ],
      };
    case "how-it-works":
      return {
        eyebrow: "",
        heading: "Get Started in 3 Simple Steps",
        description:
          "From choosing a plan to first stream in under 5 minutes. No technician, no complicated setup.",
        steps: [
          {
            id: "hiw1",
            number: "1",
            icon: "ShoppingCart",
            title: "Choose a Plan",
            description:
              "Pick the package that fits you — 1, 3, or 12 months. No hidden fees in this demo copy.",
          },
          {
            id: "hiw2",
            number: "2",
            icon: "Mail",
            title: "Get Your Details",
            description:
              "After payment, login details arrive by email. Real checkout is not connected yet.",
          },
          {
            id: "hiw3",
            number: "3",
            icon: "Play",
            title: "Start Watching",
            description:
              "Open any compatible player, add your details, and enjoy live TV, movies & sports.",
          },
        ],
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
          "Temporary local demo prices only. One package, full access — checkout is not connected yet.",
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
          { id: "ts1", icon: "Tv", value: "20K+", label: "Live Channels" },
          { id: "ts2", icon: "Clapperboard", value: "80K+", label: "Movies & Series" },
          { id: "ts3", icon: "Users", value: "10K+", label: "Happy Customers" },
          { id: "ts4", icon: "SignalHigh", value: "99.9%", label: "Uptime" },
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
              "Stable HD and 4K streams with anti-freeze servers so big games and premieres stay smooth.",
          },
          {
            id: "wc2",
            icon: "Zap",
            title: "Instant Activation",
            description:
              "Pay once and start watching in minutes. Login details arrive by email — no waiting around.",
          },
          {
            id: "wc3",
            icon: "MonitorSmartphone",
            title: "All Devices Welcome",
            description:
              "Smart TVs, Firestick, Android, iPhone, MAG, Windows, and Mac. One subscription, every screen.",
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
              "Premium capacity and 99.9% uptime so your evening watch isn’t a buffering session.",
          },
          {
            id: "wc6",
            icon: "Headphones",
            title: "24/7 Support",
            description:
              "Real people on WhatsApp and email around the clock — setup help, channel requests, and more.",
          },
        ],
      };
    case "faq":
      return {
        eyebrow: "",
        heading: "Frequently Asked Questions",
        description:
          "Quick answers about setup, devices, and billing. Still stuck? Chat with us on WhatsApp.",
        items: [
          {
            id: "faq1",
            question: "What do I need to get started?",
            answer:
              "A stable internet connection (10 Mbps+ recommended for HD, 25 Mbps for 4K) and any compatible device: Smart TV, Firestick, Android, iPhone, MAG box, or a computer.",
          },
          {
            id: "faq2",
            question: "How fast will I receive my subscription?",
            answer:
              "Activation is typically instant after payment. This local site does not process payments yet — copy is a placeholder for later CMS content.",
          },
          {
            id: "faq3",
            question: "Can I use it on more than one device?",
            answer:
              "Yes. You can install the service on multiple devices. Simultaneous streams depend on the plan — contact us if you need extra connections.",
          },
          {
            id: "faq4",
            question: "Do you offer a refund or trial?",
            answer:
              "Refund and trial wording will come from the live policy later. For now this is demo FAQ copy only.",
          },
          {
            id: "faq5",
            question: "Which apps should I use?",
            answer:
              "TiviMate, IPTV Smarters, GSE, VLC, Smart IPTV, and most MAG/Formuler apps work with a standard playlist. A setup guide will ship with real logins.",
          },
          {
            id: "faq6",
            question: "Is my payment secure?",
            answer:
              "Checkout will use trusted payment providers in production. This local foundation has no payment gateway connected.",
          },
        ],
      };
    case "cta":
      return {
        heading: "Ready to Start Your Streaming Journey?",
        description:
          "Join thousands of viewers already watching live sports, movies, and international TV — tonight.",
        buttonLabel: "Get Started Now",
        buttonHref: "/iptv-subscriptions-uk/",
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
    "faq",
    "cta",
  ];
  return types.map((type, index) => ({
    id: `sec-home-${type}`,
    type,
    label: SECTION_LABELS[type],
    order: index + 1,
    visible: true,
    data: createDefaultSectionData(type),
  }));
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
      cmsEnabled: false,
      sections: [],
    },
    {
      id: "page-contact",
      name: "Contact",
      slug: "/contact/",
      status: "published",
      cmsEnabled: false,
      sections: [],
    },
  ];
}

export function defaultSettings(): SiteSettings {
  return {
    siteName: "THE FLIX IPTV",
    tagline: "Your Entertainment. Your Way.",
    email: "support@theflixiptv.com",
    phone: "+1 (234) 567-8900",
    whatsapp: "1234567890",
    hours: "24/7 support (demo placeholder)",
    location: "Available worldwide · local demo",
    branding: {
      logo: null,
      logoAlt: "THE FLIX IPTV",
      favicon: null,
      defaultOgImage: null,
    },
  };
}

export function mergeSectionData(type: SectionType, data: unknown): CmsSection["data"] {
  const fallback = createDefaultSectionData(type);
  if (!data || typeof data !== "object" || Array.isArray(data)) return fallback;
  return { ...fallback, ...(data as Record<string, unknown>) } as CmsSection["data"];
}
