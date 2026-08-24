export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function isPlaceholderPhone(value: string) {
  const digits = digitsOnly(value);
  return !digits || digits === "1234567890" || digits === "0000000000";
}

export function whatsappUrl(number: string, message = "") {
  const digits = digitsOnly(number);
  if (!digits || isPlaceholderPhone(digits)) return "";
  const base = `https://wa.me/${digits}`;
  const text = message.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function telUrl(phone: string) {
  const digits = digitsOnly(phone);
  return digits ? `tel:+${digits}` : "";
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function sanitizeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return isHttpUrl(withProtocol) ? withProtocol : "";
}

export function normalizePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("//")) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return `${url.pathname}${url.search}` || "/";
    } catch {
      return "";
    }
  }
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return path.replace(/\/{2,}/g, "/");
}