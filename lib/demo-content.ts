import type {
  BlogPost,
  FaqItem,
  HowItWorksStep,
  Plan,
  Reason,
  ServiceCard,
  TrustStat,
} from "@/types/content";

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

export const plans: Plan[] = [
  {
    id: "1-month",
    name: "1 Month Plan",
    price: "15.99",
    period: "/ month",
    features: PLAN_FEATURES,
  },
  {
    id: "12-months",
    name: "12 Months Plan",
    price: "69.99",
    period: "/ year",
    featured: true,
    note: "Just $5.83 / month (demo)",
    features: PLAN_FEATURES,
  },
  {
    id: "3-months",
    name: "3 Months Plan",
    price: "35.99",
    period: "/ 3 months",
    features: PLAN_FEATURES,
  },
];

export const highlightStats = [
  { label: "20,000+ Live TV Channels" },
  { label: "80,000+ Movies & Series" },
  { label: "HD / FHD / 4K" },
  { label: "Multi-device" },
  { label: "24/7 Support" },
  { label: "99.9% Uptime" },
];

export const howItWorksSteps: HowItWorksStep[] = [
  {
    n: "1",
    title: "Choose a Plan",
    text: "Pick the package that fits you — 1, 3, or 12 months. No hidden fees in this demo copy.",
  },
  {
    n: "2",
    title: "Get Your Details",
    text: "After payment, login details arrive by email. Real checkout is not connected yet.",
  },
  {
    n: "3",
    title: "Start Watching",
    text: "Open any compatible player, add your details, and enjoy live TV, movies & sports.",
  },
];

export const services: ServiceCard[] = [
  {
    title: "Live TV",
    text: "News, sports, entertainment, and international channels from around the world — all in one guide.",
    href: "/iptv-subscriptions-uk/",
    tone: "red",
  },
  {
    title: "Movies & Series",
    text: "A massive on-demand library with the latest releases, classics, and binge-worthy series in HD & 4K.",
    href: "/iptv-subscriptions-uk/",
    tone: "purple",
  },
  {
    title: "Favorites",
    text: "Save the channels and shows you love. Pick up right where you left off on any device.",
    href: "/iptv-subscriptions-uk/",
    tone: "green",
  },
];

export const devices = [
  "Smart TV",
  "Android",
  "iOS",
  "Firestick",
  "PC / Mac",
  "MAG Box",
];

export const trustStats: TrustStat[] = [
  { value: "20K+", label: "Live Channels" },
  { value: "80K+", label: "Movies & Series" },
  { value: "10K+", label: "Happy Customers" },
  { value: "99.9%", label: "Uptime" },
];

export const reasons: Reason[] = [
  {
    title: "High Quality Streams",
    text: "Stable HD and 4K streams with anti-freeze servers so big games and premieres stay smooth.",
  },
  {
    title: "Instant Activation",
    text: "Pay once and start watching in minutes. Login details arrive by email — no waiting around.",
  },
  {
    title: "All Devices Welcome",
    text: "Smart TVs, Firestick, Android, iPhone, MAG, Windows, and Mac. One subscription, every screen.",
  },
  {
    title: "Secure & Private",
    text: "Encrypted checkout and private connections. We don’t share your data or flood you with ads.",
  },
  {
    title: "Reliable Network",
    text: "Premium capacity and 99.9% uptime so your evening watch isn’t a buffering session.",
  },
  {
    title: "24/7 Support",
    text: "Real people on WhatsApp and email around the clock — setup help, channel requests, and more.",
  },
];

export const faqs: FaqItem[] = [
  {
    question: "What do I need to get started?",
    answer:
      "A stable internet connection (10 Mbps+ recommended for HD, 25 Mbps for 4K) and any compatible device: Smart TV, Firestick, Android, iPhone, MAG box, or a computer.",
  },
  {
    question: "How fast will I receive my subscription?",
    answer:
      "Activation is typically instant after payment. This local site does not process payments yet — copy is a placeholder for later CMS content.",
  },
  {
    question: "Can I use it on more than one device?",
    answer:
      "Yes. You can install the service on multiple devices. Simultaneous streams depend on the plan — contact us if you need extra connections.",
  },
  {
    question: "Do you offer a refund or trial?",
    answer:
      "Refund and trial wording will come from the live policy later. For now this is demo FAQ copy only.",
  },
  {
    question: "Which apps should I use?",
    answer:
      "TiviMate, IPTV Smarters, GSE, VLC, Smart IPTV, and most MAG/Formuler apps work with a standard playlist. A setup guide will ship with real logins.",
  },
  {
    question: "Is my payment secure?",
    answer:
      "Checkout will use trusted payment providers in production. This local foundation has no payment gateway connected.",
  },
];

export const subscriptionPage = {
  eyebrow: "UK IPTV subscriptions",
  title: "IPTV Subscriptions",
  titleAccent: "Built for Everyday Watching",
  intro:
    "This page is the local stand-in for /iptv-subscriptions-uk/. Full WordPress SEO copy will be imported later. For now you get the same Flix layout, demo plans, and structured content blocks.",
  benefits: [
    {
      title: "Live sports & news",
      text: "Follow leagues, breaking news, and international channels without juggling multiple apps.",
    },
    {
      title: "On-demand library",
      text: "Movies and series in HD, FHD, and 4K so you can catch up whenever you want.",
    },
    {
      title: "Simple setup",
      text: "Most customers are watching within minutes on Firestick, Smart TV, or phone.",
    },
    {
      title: "Support when you need it",
      text: "WhatsApp and email help for playlist setup, device questions, and plan changes.",
    },
  ],
  infoBlocks: [
    {
      title: "Who this is for",
      text: "Households that want live TV, sports, and a large VOD library on the devices they already own. This paragraph is placeholder and will be replaced from CMS later.",
    },
    {
      title: "What you receive",
      text: "Login details, a short setup guide, and access for the billed period. Exact channel lists and app instructions will live in the database later.",
    },
    {
      title: "What this page is not",
      text: "There is no checkout, reseller portal, or live channel EPG on this local build. Buttons go to Contact so you can review the flow.",
    },
  ],
};

export const contactFaqs: FaqItem[] = [
  {
    question: "How quickly do you reply?",
    answer:
      "Demo copy: support aims to reply around the clock on WhatsApp and email. Real SLAs will come from operations later.",
  },
  {
    question: "Can I ask about an existing order?",
    answer:
      "Yes — include your email in the form. The form is UI-only on this local site and does not send messages yet.",
  },
  {
    question: "Do you help with Firestick setup?",
    answer:
      "Setup help is one of the most common requests. We will keep a dedicated guide in the blog and send steps with each new login.",
  },
];

export const blogPosts: BlogPost[] = [
  {
    slug: "how-to-watch-iptv-on-firestick",
    title: "How to Watch IPTV on Firestick",
    excerpt:
      "A local demo guide covering the usual Firestick apps, playlist steps, and what to check if the stream will not load.",
    category: "Setup",
    date: "2026-08-12",
    content: [
      "This is demo blog content for the local Next.js foundation. The real TipTap/MySQL CMS is not connected yet.",
      "Most Firestick viewers install a player, add a playlist or Xtream details, then pin the app to the home row.",
      "If a channel fails, check internet speed, try another server line, and confirm the subscription is still active.",
    ],
  },
  {
    slug: "best-iptv-apps-for-smart-tvs",
    title: "Best IPTV Apps for Smart TVs",
    excerpt:
      "A short overview of common Smart TV players and why a stable playlist matters more than the app brand.",
    category: "Devices",
    date: "2026-08-05",
    content: [
      "Smart TVs vary by brand. Some use built-in apps; others work better with a Firestick or Android box.",
      "Look for EPG support, catch-up if your plan includes it, and a simple favorites row.",
      "This article is placeholder copy so the /blog/ and /blog/[slug]/ routes can be reviewed locally.",
    ],
  },
  {
    slug: "hd-vs-4k-streaming-what-you-need",
    title: "HD vs 4K Streaming: What You Need",
    excerpt:
      "Bandwidth, TV capability, and source quality all matter. Here is a plain-language demo explainer.",
    category: "Quality",
    date: "2026-07-28",
    content: [
      "HD is enough for many living rooms. 4K needs a 4K panel and a stronger connection — typically 25 Mbps or more.",
      "If the picture stutters, drop to FHD before assuming the service is down.",
      "Final production copy will be written in the CMS later.",
    ],
  },
  {
    slug: "getting-started-with-the-flix",
    title: "Getting Started with The Flix",
    excerpt:
      "Choose a plan, receive details, and start watching. A walkthrough that mirrors the homepage How It Works section.",
    category: "Guides",
    date: "2026-07-20",
    content: [
      "Pick a 1, 3, or 12 month demo plan on the subscription page. Prices here are temporary local values.",
      "When payments are connected, details will arrive by email. For now, use the Contact page to rehearse the journey.",
      "Install on the device you use most, then add a second screen if your plan allows it.",
    ],
  },
];

export function getPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}
