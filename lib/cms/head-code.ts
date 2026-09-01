export const MAX_HEAD_CODE_CHARS = 50_000;

const ALLOWED_TAGS = new Set(["meta", "link", "script", "noscript"]);
const ALLOWED_ATTRS = new Set([
  "name",
  "content",
  "property",
  "charset",
  "http-equiv",
  "href",
  "rel",
  "src",
  "type",
  "async",
  "defer",
  "crossorigin",
  "integrity",
  "referrerpolicy",
  "id",
  "sizes",
  "media",
  "as",
  "lang",
  "nonce",
]);

export type HeadCodeNode =
  | { kind: "meta" | "link"; attrs: Record<string, string> }
  | { kind: "script"; attrs: Record<string, string>; content: string }
  | { kind: "noscript"; content: string };

export function sanitizeCustomHeadCode(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").slice(0, MAX_HEAD_CODE_CHARS);
}

export function headCodePolicyError(value: string) {
  if (value.length > MAX_HEAD_CODE_CHARS) return "Head code is too large.";
  if (/<\?(?:php|=)/i.test(value) || /<%/.test(value)) {
    return "Server-side template or PHP code is not allowed.";
  }
  if (/<\/(?:html|head|body)\b/i.test(value)) {
    return "That markup cannot be placed in the document head.";
  }
  return null;
}

function parseAttrs(raw: string) {
  const attrs: Record<string, string> = {};
  const re = /([:a-zA-Z_:][-a-zA-Z0-9:._]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const name = match[1].toLowerCase();
    if (name.startsWith("on")) continue;
    if (!ALLOWED_ATTRS.has(name)) continue;
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function safeUrl(value: string) {
  const href = value.trim();
  if (!href) return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  return /^(https?:)?\/\//i.test(href);
}

export function parseHeadCode(html: string): HeadCodeNode[] {
  const input = sanitizeCustomHeadCode(html).trim();
  if (!input || headCodePolicyError(input)) return [];

  const nodes: HeadCodeNode[] = [];
  const tagRe =
    /<(script|noscript)(\s[^>]*)?>[\s\S]*?<\/\1\s*>|<(meta|link)(\s[^>]*)?\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(input))) {
    const full = match[0];
    const pairTag = match[1]?.toLowerCase();
    const voidTag = match[3]?.toLowerCase();
    const tag = pairTag || voidTag;
    if (!tag || !ALLOWED_TAGS.has(tag)) continue;

    if (tag === "script" || tag === "noscript") {
      const open = full.match(new RegExp(`^<${tag}(\\s[^>]*)?>`, "i"));
      const attrs = parseAttrs(open?.[1] || "");
      const inner = full.replace(new RegExp(`^<${tag}\\b[^>]*>`, "i"), "").replace(new RegExp(`</${tag}\\s*>$`, "i"), "");
      if (tag === "script") {
        if (attrs.src && !safeUrl(attrs.src)) continue;
        nodes.push({ kind: "script", attrs, content: inner });
      } else {
        nodes.push({
          kind: "noscript",
          content: inner.replace(/<script\b[\s\S]*?<\/script>/gi, ""),
        });
      }
      continue;
    }

    const attrs = parseAttrs(match[4] || "");
    if (tag === "meta") {
      const equiv = (attrs["http-equiv"] || "").toLowerCase();
      if (attrs.charset || equiv === "refresh" || equiv === "set-cookie") continue;
      nodes.push({ kind: "meta", attrs });
      continue;
    }
    if (tag === "link") {
      if (attrs.href && !safeUrl(attrs.href)) continue;
      nodes.push({ kind: "link", attrs });
    }
  }
  return nodes;
}
