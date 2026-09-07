export const PRICE_CURRENCY_CODE = "GBP";
export const PRICE_CURRENCY_SYMBOL = "£";

export function formatGbpPrice(price: string) {
  const trimmed = price.trim();
  if (!trimmed) return "";
  if (/^£/.test(trimmed)) return trimmed;
  if (/^[\$€]/.test(trimmed)) return `${PRICE_CURRENCY_SYMBOL}${trimmed.slice(1).trim()}`;
  return `${PRICE_CURRENCY_SYMBOL}${trimmed}`;
}
