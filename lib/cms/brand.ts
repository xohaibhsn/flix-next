export const BRAND_NAME = "Flix IPTV";

const BRAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bTHE FLIX IPTV\b/g, BRAND_NAME],
  [/\bThe Flix IPTV\b/g, BRAND_NAME],
  [/\bthe Flix IPTV\b/g, BRAND_NAME],
  [/\bTHE FLIX\b/g, BRAND_NAME],
  [/\bThe Flix\b/g, BRAND_NAME],
  [/\bthe Flix\b/g, BRAND_NAME],
];

export function rewriteBrandDisplay(value: string) {
  let next = value;
  for (const [from, to] of BRAND_REPLACEMENTS) {
    next = next.replace(from, to);
  }
  return next;
}
