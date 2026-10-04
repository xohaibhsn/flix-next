/** Tiny className joiner for Sidhu UI primitives (no external dependency). */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
