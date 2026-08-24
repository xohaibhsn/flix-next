import type { CmsPage, CmsSection, HowItWorksData } from "@/lib/cms/types";
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
    "View our current streaming packages below. Names and prices are managed centrally so they stay current.",
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
