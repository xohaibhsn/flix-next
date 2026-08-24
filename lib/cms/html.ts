import xss, { whiteList } from "xss";
import type { IFilterXSSOptions } from "xss";

const DANGEROUS_SCHEME = /^(javascript|data|vbscript|file):/i;
const REL_TOKEN = /^[a-z][a-z0-9:_-]*$/i;

function readAttr(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : "";
}

export function normalizeAnchorRel(rel: string, target: string, explicitNofollow: boolean) {
  const tokens = new Set(
    String(rel || "")
      .split(/\s+/)
      .map((token) => token.trim().toLowerCase())
      .filter((token) => REL_TOKEN.test(token)),
  );
  tokens.delete("nofollow");
  if (explicitNofollow) tokens.add("nofollow");
  if (target === "_blank") {
    tokens.add("noopener");
    tokens.add("noreferrer");
  }
  return [...tokens].join(" ");
}

function rewriteAnchorOpenTag(attrs: string) {
  const href = readAttr(attrs, "href").trim();
  if (!href) return `<a${attrs}>`;
  const title = readAttr(attrs, "title");
  const target = readAttr(attrs, "target") === "_blank" ? "_blank" : "";
  const explicitNofollow = readAttr(attrs, "data-nofollow") === "true";
  const rel = normalizeAnchorRel(readAttr(attrs, "rel"), target, explicitNofollow);
  const next = [
    "a",
    href ? `href="${href}"` : "",
    title ? `title="${title}"` : "",
    target ? `target="${target}"` : "",
    rel ? `rel="${rel}"` : "",
    explicitNofollow ? `data-nofollow="true"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<${next}>`;
}

function normalizeAnchors(html: string) {
  return html.replace(/<a\b([^>]*)>/gi, (_full, attrs: string) => rewriteAnchorOpenTag(attrs));
}

export function wrapCmsTables(html: string) {
  return html.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => `<div class="cms-table-scroll">${table}</div>`);
}

const options: IFilterXSSOptions = {
  whiteList: {
    ...whiteList,
    p: ["class"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    span: ["class"],
    a: ["href", "title", "target", "rel", "data-nofollow"],
    img: ["src", "alt", "title", "width", "height"],
    table: [],
    caption: [],
    thead: [],
    tbody: [],
    tfoot: [],
    tr: [],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
    colgroup: [],
    col: ["span"],
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
    if ((tag === "th" || tag === "td") && (name === "colspan" || name === "rowspan")) {
      const span = Number.parseInt(String(value || ""), 10);
      if (!Number.isFinite(span) || span < 1 || span > 50) return "";
    }
    if (tag === "col" && name === "span") {
      const span = Number.parseInt(String(value || ""), 10);
      if (!Number.isFinite(span) || span < 1 || span > 50) return "";
    }
    return undefined;
  },
};

export function sanitizeHtml(html: string) {
  return normalizeAnchors(xss(html || "", options).trim());
}

export function renderCmsHtml(html: string) {
  return wrapCmsTables(sanitizeHtml(html));
}
