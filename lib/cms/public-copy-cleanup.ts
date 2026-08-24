import type { BlogPost, CmsPage, CmsSection, FaqItem, HowItWorksData, PricingPlan } from "@/lib/cms/types";
import { isLegacyHowItWorks, ORDER_PROCESS_HOW_IT_WORKS } from "@/lib/cms/order-process";

const EXACT_REPLACEMENTS: Array<[string, string]> = [
  [
    "After payment, login details arrive by email. Real checkout is not connected yet.",
    "After you choose a plan, message us on WhatsApp for setup and account details.",
  ],
  [
    "Pay once and start watching in minutes. Login details arrive by email — no waiting around.",
    "Pay once and start watching in minutes. Message us on WhatsApp for setup and account details.",
  ],
  [
    "Real people on WhatsApp and email around the clock — setup help, channel requests, and more.",
    "Real people on WhatsApp when you need help with setup, devices, or your plan.",
  ],
  [
    "Temporary local demo prices only. One package, full access — checkout is not connected yet.",
    "Choose the streaming package that best suits your needs.",
  ],
  [
    "WhatsApp and email help for playlist setup, device questions, and plan changes.",
    "WhatsApp help for setup, device questions, and plan changes.",
  ],
  [
    "Structured informational content you can replace from Sidhu.",
    "A few practical notes before you message us on WhatsApp.",
  ],
  [
    "Login details, a short setup guide, and access for the billed period.",
    "Account information and setup help through WhatsApp, for the billed period you choose.",
  ],
  [
    "There is no checkout or reseller portal on this build. Plan buttons go to Contact.",
    "Choose a package above, then message us on WhatsApp to get started.",
  ],
  [
    "Use Contact for this local preview. Payment is not live yet.",
    "Choose a streaming package above, then message us on WhatsApp to get set up.",
  ],
  [
    "Activation is typically instant after payment. This local site does not process payments yet — copy is a placeholder for later CMS content.",
    "Activation follows payment. Message us on WhatsApp if you need help getting started.",
  ],
  [
    "This local site does not process payments yet — copy is a placeholder for later CMS content.",
    "Message us on WhatsApp if you need help getting started.",
  ],
  [
    "Refund and trial wording will come from the live policy later. For now this is demo FAQ copy only.",
    "We offer a 7-Day Money Back Guarantee. If the service is not suitable, contact us on WhatsApp within the applicable 7-day period.",
  ],
  [
    "TiviMate, IPTV Smarters, GSE, VLC, Smart IPTV, and most MAG/Formuler apps work with a standard playlist. A setup guide will ship with real logins.",
    "Compatible streaming apps depend on your device. Message us on WhatsApp and we will recommend a player that fits your Firestick, Smart TV, or phone.",
  ],
  [
    "Checkout will use trusted payment providers in production. This local foundation has no payment gateway connected.",
    "If you have a billing question, message us on WhatsApp.",
  ],
  [
    "Support aims to reply around the clock on WhatsApp and email.",
    "Support aims to reply around the clock on WhatsApp.",
  ],
  [
    "Setup help is one of the most common requests. We send steps with each new login.",
    "Yes. Message us on WhatsApp and we will talk you through Firestick setup.",
  ],
  [
    "Choose your plan, get your login details, and start streaming in minutes.",
    "Choose your plan, then message us on WhatsApp for setup and start watching.",
  ],
  [
    "Yes. You can install the service on multiple devices. Simultaneous streams depend on the plan — contact us if you need extra connections.",
    "You can use the service on compatible devices in the house. If two rooms need to watch at once, ask on WhatsApp before you start so you pick a package that fits.",
  ],
  [
    "BEST IPTV SERVICE IN THE UK",
    "UK streaming for British households",
  ],
  [
    "Join thousands of viewers already watching live sports, movies, and international TV — tonight.",
    "Choose a streaming package, then message us on WhatsApp for setup on Firestick, Smart TV, or the device you already own.",
  ],
  [
    "Stable HD and 4K streams with anti-freeze servers so big games and premieres stay smooth.",
    "Watchable HD and 4K on the devices you already own, for everyday British evenings.",
  ],
  [
    "Premium capacity and 99.9% uptime so your evening watch isn’t a buffering session.",
    "A UK-focused streaming service with a 7-Day Money Back Guarantee if it is not the right fit.",
  ],
  [
    "A stable internet connection (10 Mbps+ recommended for HD, 25 Mbps for 4K) and any compatible device: Smart TV, Firestick, Android, iPhone, MAG box, or a computer.",
    "A stable internet connection and a compatible device: Firestick, Smart TV, Android TV, phone, tablet or laptop.",
  ],
  [
    "From choosing a plan to first stream in under 5 minutes. No technician, no complicated setup.",
    "Choose a plan, message us on WhatsApp, and start watching on the device you already own.",
  ],
  [
    "Pick the package that fits you — 1, 3, or 12 months. No hidden fees in this demo copy.",
    "Pick the streaming package that fits your household. Names and prices are listed on the subscription page.",
  ],
  [
    "Open any compatible player, add your details, and enjoy live TV, movies & sports.",
    "Open the apps on your Firestick, Smart TV, phone or laptop and start watching.",
  ],
  [
    "This local site does not process payments yet - copy is a placeholder for later CMS content.",
    "Message us on WhatsApp if you need help getting started.",
  ],
  [
    "Ready to Start Your Streaming Journey?",
    "Ready to start watching?",
  ],
  [
    "The same visual language as Home, with copy you can edit per page.",
    "Enjoy reliable streaming, flexible plans, easy setup, and WhatsApp support.",
  ],
  [
    "Plans, setup, and FAQs are managed from Sidhu.",
    "Message us on WhatsApp when you are ready to get set up.",
  ],
  [
    "Packages, devices, and FAQs on this page are editable in Sidhu.",
    "Packages, devices, and FAQs on this page can be reviewed before you message us on WhatsApp.",
  ],
  [
    "WhatsApp, email, and a contact form. Phone, email, and chat links come from Site Settings.",
    "For subscriptions, payment details, setup and support, contact us directly on WhatsApp.",
  ],
  [
    "Reach us using the details managed in Site Settings.",
    "For subscriptions, payment details, setup and support, message our team directly on WhatsApp.",
  ],
  [
    "Tell us what you need help with. We store messages in Sidhu until email sending is connected.",
    "For general questions you can use this form. For subscriptions, payment details and setup, WhatsApp is the fastest way to reach us.",
  ],
  [
    "Prefer WhatsApp or Telegram?",
    "Chat with us on WhatsApp",
  ],
  [
    "Most setup questions are faster in chat.",
    "For subscriptions, payment details, setup and support, message our team directly on WhatsApp.",
  ],
  [
    "Choose a plan, then message us on WhatsApp for setup. Packages, devices, and FAQs on this page can be reviewed before you get in touch.",
    "Choose a plan, then tap Choose Plan to message us on WhatsApp. Our team will send payment details manually, then set you up after payment is confirmed.",
  ],
  [
    "Choose a plan, then message us on WhatsApp for setup. Packages, devices, and FAQs on this page can be reviewed before you message us on WhatsApp.",
    "Choose a plan, then tap Choose Plan to message us on WhatsApp. Our team will send payment details manually, then set you up after payment is confirmed.",
  ],
  [
    "View streaming packages",
    "Get Started",
  ],
  [
    "Enjoy reliable IPTV streaming across the UK with 20,000+ live TV channels and 80,000+ movies & series in HD, FHD, 4K and 8K. Instant setup on Smart TVs, phones, Firestick, and more.",
    "UK streaming on the devices you already use — Firestick, Fire TV, Smart TV, Android TV and mobile. Message us on WhatsApp to get set up.",
  ],
  [
    "Stream 20,000+ live TV channels and 80,000+ movies & series in stunning 4K. Instant setup on Smart TVs, phones, Firestick, and more.",
    "UK streaming on the devices you already use — Firestick, Fire TV, Smart TV, Android TV and mobile. Message us on WhatsApp to get set up.",
  ],
  [
    "20,000+ live TV channels and 80,000+ movies & series",
    "a wide range of live TV and an extensive entertainment selection",
  ],
  [
    "in HD, FHD, 4K and 8K",
    "in HD, FHD and 4K where compatible",
  ],
  [
    "View our current streaming packages below. Names and prices are managed centrally so they stay current.",
    "Choose the streaming package that best suits your needs.",
  ],
  [
    "Prices and package names are managed centrally, so this article does not quote figures that might go out of date.",
    "View current packages and prices there.",
  ],
  [
    "This page does not freeze prices in the article because packages are managed in one place and can change.",
    "This page does not freeze prices in the article because packages can change.",
  ],
  [
    "20,000+ Live Channels (demo)",
    "Wide range of live TV",
  ],
  [
    "80,000+ Movies & Series (demo)",
    "Extensive entertainment selection",
  ],
  [
    "20,000+ Live TV Channels",
    "Wide range of live TV",
  ],
  [
    "20,000+ Live Channels",
    "Wide range of live TV",
  ],
  [
    "80,000+ Movies & Series",
    "Extensive entertainment selection",
  ],
  [
    "Anti-Freeze Technology",
    "Reliable streaming experience",
  ],
  [
    "4K / FHD / HD Quality",
    "HD / FHD / 4K where compatible",
  ],
  [
    "All Devices Supported",
    "Firestick, Fire TV, Smart TV and Android TV",
  ],
  [
    "Instant Activation",
    "Fast setup through WhatsApp",
  ],
  [
    "24/7 Customer Support",
    "Customer support via WhatsApp",
  ],
  [
    "99.9% Uptime",
    "WhatsApp Support",
  ],
  [
    "Instant Setup",
    "Fast Setup",
  ],
  [
    "Happy Customers",
    "Money Back Guarantee",
  ],
  [
    "20K+",
    "Live TV",
  ],
  [
    "80K+",
    "On demand",
  ],
  [
    "10K+",
    "7-day",
  ],
  [
    "99.9%",
    "WhatsApp",
  ],
  [
    "Uptime",
    "Setup & support",
  ],
  [
    "Encrypted checkout and private connections. We don't share your data or flood you with ads.",
    "Account details stay private. Payment instructions are sent on WhatsApp, not published on the website.",
  ],
  [
    "Encrypted checkout and private connections. We don’t share your data or flood you with ads.",
    "Account details stay private. Payment instructions are sent on WhatsApp, not published on the website.",
  ],
  [
    "A massive on-demand library with the latest releases, classics, and binge-worthy series in HD & 4K.",
    "Films and series on demand, including recent titles and classics, in HD and 4K where compatible.",
  ],
  [
    "Best IPTV Service Providers in UK",
    "UK Streaming Service for Firestick & Smart TV",
  ],
  [
    "Best IPTV UK | Premium IPTV Subscription",
    "UK Streaming Subscriptions for Firestick & Smart TV",
  ],
  [
    "Stream your favourite live TV, sports, movies & series in HD and 4K with the UK's best IPTV service provider. Get reliable streaming with The Flix IPTV today.",
    "UK streaming for Firestick, Fire TV, Smart TV and Android TV. Choose a plan, then message us on WhatsApp to get set up.",
  ],
  [
    "Stream your favourite live TV, sports, movies & series in HD and 4K with the UK’s best IPTV service provider. Get reliable streaming with The Flix IPTV today.",
    "UK streaming for Firestick, Fire TV, Smart TV and Android TV. Choose a plan, then message us on WhatsApp to get set up.",
  ],
  [
    "Get a premium IPTV subscription in the UK with HD & 4K channels, reliable streaming, 24/7 support and a free trial. Join The Flix IPTV and start watching today.",
    "Streaming packages for UK homes on Firestick, Fire TV, Smart TV and Android TV. Payment details and setup are sent on WhatsApp.",
  ],
  [
    "Contact THE FLIX IPTV support by WhatsApp, email, or form.",
    "Contact THE FLIX IPTV on WhatsApp for plans, payment details, and setup.",
  ],
  [
    "A local demo guide covering the usual Firestick apps, playlist steps, and what to check if the stream will not load.",
    "How to install a player on Firestick, add your details, and what to check if a stream will not load.",
  ],
  [
    "This is demo blog content for the local Next.js foundation. The real TipTap/MySQL CMS is not connected yet.",
    "Most Firestick viewers install a player, add a playlist or Xtream details, then pin the app to the home row.",
  ],
  [
    "This article is placeholder copy so the /blog/ and /blog/[slug]/ routes can be reviewed locally.",
    "Ask on WhatsApp if you need a player recommendation for your Smart TV.",
  ],
  [
    "Here is a plain-language demo explainer.",
    "Here is a plain-language explainer.",
  ],
  [
    "Final production copy will be written in the CMS later.",
    "If the picture stutters, drop to FHD before assuming the service is down.",
  ],
  [
    "Pick a 1, 3, or 12 month demo plan on the subscription page. Prices here are temporary local values.",
    "Pick a plan on the subscription page.",
  ],
  [
    "When payments are connected, details will arrive by email. For now, use the Contact page to rehearse the journey.",
    "Message us on WhatsApp for setup and account details. Sales and setup are handled there, not by email.",
  ],
  [
    "Yes — include your email in the form so we can match your request.",
    "Yes. Message us on WhatsApp with your details so we can match your request.",
  ],
  [
    "Yes — include your email in the form. The form is UI-only on this local site and does not send messages yet.",
    "Yes. Message us on WhatsApp with your details so we can match your request.",
  ],
  [
    "24/7 support (demo placeholder)",
    "Support available on WhatsApp",
  ],
  [
    "Available worldwide · local demo",
    "Available worldwide",
  ],
  [
    "Stream live TV, movies, and series in HD, FHD, and 4K. Local demo site for The Flix — contact values are placeholders.",
    "UK streaming for Firestick, Fire TV, Smart TV and Android TV. Message us on WhatsApp to get set up.",
  ],
  [
    "Hours come from Site Settings so they stay consistent across the site.",
    "Message us on WhatsApp during support hours for setup, payment details and account help.",
  ],
  [
    "What this page is not",
    "Ready to start",
  ],
];

export function rewriteDemoCopy(value: string) {
  let next = value;
  for (const [from, to] of EXACT_REPLACEMENTS) {
    if (next.includes(from)) next = next.split(from).join(to);
  }
  return next;
}

function rewriteUnknown(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const next = rewriteDemoCopy(value);
    return { value: next, changed: next !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = rewriteUnknown(item);
      if (result.changed) changed = true;
      return result.value;
    });
    return { value: next, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const result = rewriteUnknown(item);
      if (result.changed) changed = true;
      next[key] = result.value;
    }
    return { value: next, changed };
  }
  return { value, changed: false };
}

function retargetHowItWorksIcons(section: CmsSection): CmsSection {
  if (section.type !== "how-it-works") return section;
  const data = section.data as HowItWorksData;
  const steps = data.steps.map((step) => {
    if (step.icon === "Mail" && /whatsapp/i.test(step.description)) {
      return { ...step, icon: "MessageCircle" };
    }
    return step;
  });
  const changed = steps.some((step, index) => step.icon !== data.steps[index]?.icon);
  if (!changed) return section;
  return { ...section, data: { ...data, steps } };
}

function applyOrderProcessHowItWorks(section: CmsSection): CmsSection {
  if (section.type !== "how-it-works") return section;
  const data = section.data as HowItWorksData;
  if (!isLegacyHowItWorks(data)) return section;
  return {
    ...section,
    data: {
      ...ORDER_PROCESS_HOW_IT_WORKS,
      steps: ORDER_PROCESS_HOW_IT_WORKS.steps.map((step) => ({ ...step })),
    },
  };
}

export function applyPublicCopyCleanupToPage(page: CmsPage): { page: CmsPage; changed: boolean } {
  let changed = false;
  const sections = page.sections.map((section) => {
    const rewritten = rewriteUnknown(section);
    const nextSection = (rewritten.changed ? rewritten.value : section) as CmsSection;
    const withIcons = retargetHowItWorksIcons(nextSection);
    const withOrder = applyOrderProcessHowItWorks(withIcons);
    if (rewritten.changed || withIcons !== nextSection || withOrder !== withIcons) changed = true;
    return withOrder;
  });
  return { page: changed ? { ...page, sections } : page, changed };
}

export function applyPublicCopyCleanupToPages(pages: CmsPage[]) {
  let changed = false;
  const next = pages.map((page) => {
    const result = applyPublicCopyCleanupToPage(page);
    if (result.changed) changed = true;
    return result.page;
  });
  return { pages: next, changed };
}

export function applyPublicCopyCleanupToPlan(plan: PricingPlan): { plan: PricingPlan; changed: boolean } {
  const features = plan.features.map((feature) => rewriteDemoCopy(feature));
  const changed = features.some((feature, index) => feature !== plan.features[index]);
  if (!changed) return { plan, changed: false };
  return { plan: { ...plan, features }, changed: true };
}

export function applyPublicCopyCleanupToFaq(item: FaqItem): { item: FaqItem; changed: boolean } {
  const question = rewriteDemoCopy(item.question);
  const answer = rewriteDemoCopy(item.answer);
  const changed = question !== item.question || answer !== item.answer;
  if (!changed) return { item, changed: false };
  return { item: { ...item, question, answer }, changed: true };
}

export function applyPublicCopyCleanupToPost(post: BlogPost): { post: BlogPost; changed: boolean } {
  const excerpt = rewriteDemoCopy(post.excerpt);
  const content = rewriteDemoCopy(post.content);
  const seoTitle = rewriteDemoCopy(post.seoTitle);
  const seoDescription = rewriteDemoCopy(post.seoDescription);
  const ogTitle = rewriteDemoCopy(post.ogTitle);
  const ogDescription = rewriteDemoCopy(post.ogDescription);
  const changed =
    excerpt !== post.excerpt ||
    content !== post.content ||
    seoTitle !== post.seoTitle ||
    seoDescription !== post.seoDescription ||
    ogTitle !== post.ogTitle ||
    ogDescription !== post.ogDescription;
  if (!changed) return { post, changed: false };
  return {
    post: { ...post, excerpt, content, seoTitle, seoDescription, ogTitle, ogDescription },
    changed: true,
  };
}
