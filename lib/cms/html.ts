import xss, { whiteList } from "xss";
import type { IFilterXSSOptions } from "xss";

const DANGEROUS_SCHEME = /^(javascript|data|vbscript|file):/i;

const options: IFilterXSSOptions = {
  whiteList: {
    ...whiteList,
    p: ["class"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    span: ["class"],
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style", "iframe", "object", "embed", "link"],
  css: false,
  onTagAttr(tag, name, value) {
    if (name === "href" || name === "src") {
      const trimmed = String(value || "").trim();
      if (!trimmed || DANGEROUS_SCHEME.test(trimmed) || trimmed.startsWith("//")) {
        return "";
      }
    }
    if (tag === "img" && name === "src") {
      const src = String(value || "").trim();
      if (!src.startsWith("https://")) return "";
    }
    if (tag === "a" && name === "href") {
      const href = String(value || "").trim();
      const ok =
        href.startsWith("/") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("https://") ||
        href.startsWith("http://localhost") ||
        href.startsWith("http://127.0.0.1");
      if (!ok) return "";
    }
    return undefined;
  },
};

export function sanitizeHtml(html: string) {
  return xss(html || "", options).trim();
}
