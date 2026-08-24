import { sanitizeHtml } from "@/lib/cms/html";

const GUTENBERG_COMMENT = /<!--\s*\/?wp:[\s\S]*?-->/g;
const SHORTCODE = /\[[a-zA-Z][\w-]*(?:\s[^\]]*)?\]/g;
const ELEMENTOR_HINT = /elementor|data-elementor/i;
const PAGE_BUILDER_HINT = /\[\/?(?:et_|wpb_|vc_|fusion_|avia_)/i;

export function cleanWordPressHtml(html: string): { html: string; warnings: string[] } {
  const warnings: string[] = [];
  let out = String(html || "");

  if (ELEMENTOR_HINT.test(out)) {
    warnings.push("Contains Elementor markup; cleaned HTML may be incomplete.");
  }
  if (PAGE_BUILDER_HINT.test(out)) {
    warnings.push("Contains page-builder shortcodes.");
  }
  if (/<script/i.test(out)) {
    warnings.push("Removed script tags.");
  }

  out = out.replace(GUTENBERG_COMMENT, "");
  out = out.replace(SHORTCODE, "");
  out = out.replace(/style\s*=\s*("[^"]*"|'[^']*')/gi, "");

  const sanitized = sanitizeHtml(out);
  const text = sanitized.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) warnings.push("No visible text remained after cleanup.");
  return { html: sanitized, warnings };
}

export function stripYoastTemplates(value: string | null | undefined) {
  if (!value) return "";
  const stripped = String(value)
    .replace(/%%[^%]+%%/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped;
}
