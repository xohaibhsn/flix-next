export const WHATSAPP_SALES_MESSAGE =
  "Hi, I am interested in The Flix streaming service. Please help me choose a suitable plan and send me the payment details.";

export const WHATSAPP_VISIT_MESSAGE = "Hi, I am visiting The Flix website and would like some help.";

function formatPlanPrice(price: string) {
  const trimmed = price.trim();
  if (!trimmed) return "";
  if (/^[£$€]/.test(trimmed)) return trimmed;
  return `$${trimmed}`;
}

function formatPlanPeriod(duration: string) {
  return duration.replace(/^\s*\/\s*/, "").trim() || "billed period";
}

export function planWhatsAppMessage(
  plan: { name: string; price: string; duration: string },
  pageUrl?: string,
) {
  const price = formatPlanPrice(plan.price);
  const period = formatPlanPeriod(plan.duration);
  const detail = price ? `${price} / ${period}` : period;
  let text = `Hi, I would like to subscribe to the ${plan.name} (${detail}). Please send me the payment details on WhatsApp.`;
  if (pageUrl) text += `\nWebsite: ${pageUrl}`;
  return text;
}

const BROWSE_LABEL = /view plans|see plans|compare plans|browse plans|view streaming|see packages/i;
const SALES_LABEL =
  /get started|start now|contact us|subscribe|buy now|order now|choose plan|get this plan|talk to support|chat on whatsapp|message us on whatsapp/i;

export function isBrowseCtaLabel(label: string) {
  return BROWSE_LABEL.test(label.trim());
}

export function isSalesCtaLabel(label: string) {
  return SALES_LABEL.test(label.trim());
}

export function resolveSalesHref(label: string, storedHref: string, salesUrl: string) {
  if (salesUrl && isSalesCtaLabel(label)) return salesUrl;
  return storedHref;
}

export function resolveBrowseHref(label: string, storedHref: string) {
  if (isBrowseCtaLabel(label)) return "#pricing";
  return storedHref;
}
