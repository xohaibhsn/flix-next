import type { HowItWorksData } from "@/lib/cms/types";

export const ORDER_PROCESS_HOW_IT_WORKS: HowItWorksData = {
  eyebrow: "",
  heading: "How to get started",
  description:
    "Choose a plan, message us on WhatsApp, then receive payment details and setup from our team. Try the service with confidence. If it is not suitable, contact us on WhatsApp within the applicable 7-day guarantee period.",
  steps: [
    {
      id: "hiw1",
      number: "1",
      icon: "ShoppingCart",
      title: "Choose Your Plan",
      description: "Browse our available streaming packages and choose the option that suits you.",
    },
    {
      id: "hiw2",
      number: "2",
      icon: "MessageCircle",
      title: "Message Us on WhatsApp",
      description: "Click Get Started or Choose Plan and you will be connected directly with our team on WhatsApp.",
    },
    {
      id: "hiw3",
      number: "3",
      icon: "Headphones",
      title: "Receive Payment Details",
      description: "Our team will send the available payment instructions to you manually through WhatsApp.",
    },
    {
      id: "hiw4",
      number: "4",
      icon: "Play",
      title: "Confirm Payment & Get Setup",
      description:
        "After your payment is confirmed, your account and setup instructions will be provided through WhatsApp.",
    },
  ],
};

export function isLegacyHowItWorks(data: HowItWorksData) {
  if (data.steps.some((step) => /receive payment details/i.test(step.title))) return false;
  if (/3 simple steps/i.test(data.heading)) return true;
  const titles = data.steps.map((step) => step.title.toLowerCase());
  return (
    titles.includes("choose a plan") ||
    titles.includes("get your details") ||
    titles.includes("start watching")
  );
}
