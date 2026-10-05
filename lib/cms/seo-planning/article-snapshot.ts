/**
 * Bounded plain-text snapshot of a stored blog article.
 * Uses the existing xss parser so script/style/svg bodies are removed
 * before text is kept. No network. No CMS writes.
 */

import xss from "xss";

export const ARTICLE_SNAPSHOT_CAPS = {
  title: 180,
  excerpt: 400,
  publicPath: 300,
  categoryName: 80,
  focusKeyword: 80,
  body: 6000,
  headingsInBody: 20,
  leftoverHeadings: 12,
  leftoverHeadingLabel: 80,
} as const;

export type ArticleSnapshot = {
  title: string;
  excerpt: string;
  publicPath: string;
  categoryName: string;
  focusKeyword: string;
  featuredImage: "present" | "absent";
  body: string;
  headingCount: number;
  leftoverHeadings: string[];
};

export type ArticleSnapshotInput = {
  title: string;
  excerpt: string;
  publicPath: string;
  categoryName: string;
  focusKeyword: string;
  featuredImagePresent: boolean;
  html: string;
};

const STRUCTURAL_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "br",
  "div",
  "blockquote",
  "strong",
  "em",
  "b",
  "i",
  "span",
  "a",
] as const;

const DROP_BODY_TAGS = ["script", "style", "iframe", "svg", "object", "embed", "noscript"];

function clip(value: string, max: number) {
  return String(value || "").replace(/\0/g, "").trim().slice(0, max);
}

function decodeText(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&#(\d+);/g, (match, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function headingRank(tag: string) {
  if (tag === "h1" || tag === "h2") return "## ";
  if (tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") return "### ";
  return "";
}

function structuredPlainText(html: string) {
  const whiteList = Object.fromEntries(STRUCTURAL_TAGS.map((tag) => [tag, [] as string[]]));
  const marked = xss(html || "", {
    whiteList,
    stripIgnoreTag: true,
    stripIgnoreTagBody: DROP_BODY_TAGS,
    css: false,
    escapeHtml: decodeText,
    onTag(tag, _html, info) {
      if (!info.isWhite) return;
      const rank = headingRank(tag);
      if (!info.isClosing) {
        if (rank) return `\n${rank}`;
        if (tag === "li") return "\n- ";
        if (tag === "br" || tag === "p" || tag === "div" || tag === "blockquote") return "\n";
        return "";
      }
      if (rank || tag === "p" || tag === "div" || tag === "li" || tag === "blockquote") return "\n";
      return "";
    },
  });
  return marked
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isHeadingLine(line: string) {
  return line.startsWith("## ") || line.startsWith("### ");
}

function headingLabel(line: string) {
  return line.replace(/^#+\s+/, "").trim();
}

export function buildArticleSnapshot(input: ArticleSnapshotInput): ArticleSnapshot {
  const lines = structuredPlainText(input.html);
  let body = "";
  let headingCount = 0;
  const leftoverHeadings: string[] = [];
  let overflow = false;

  for (const line of lines) {
    const heading = isHeadingLine(line);
    if (overflow) {
      if (heading && leftoverHeadings.length < ARTICLE_SNAPSHOT_CAPS.leftoverHeadings) {
        leftoverHeadings.push(clip(headingLabel(line), ARTICLE_SNAPSHOT_CAPS.leftoverHeadingLabel));
      }
      continue;
    }
    if (heading && headingCount >= ARTICLE_SNAPSHOT_CAPS.headingsInBody) {
      overflow = true;
      leftoverHeadings.push(clip(headingLabel(line), ARTICLE_SNAPSHOT_CAPS.leftoverHeadingLabel));
      continue;
    }
    const next = body ? `${body}\n${line}` : line;
    if (next.length > ARTICLE_SNAPSHOT_CAPS.body) {
      overflow = true;
      if (heading) {
        leftoverHeadings.push(clip(headingLabel(line), ARTICLE_SNAPSHOT_CAPS.leftoverHeadingLabel));
      } else {
        const room = ARTICLE_SNAPSHOT_CAPS.body - (body ? body.length + 1 : 0);
        if (room > 0) {
          const partial = line.slice(0, room).trimEnd();
          body = body ? `${body}\n${partial}` : partial;
        }
      }
      continue;
    }
    body = next;
    if (heading) headingCount += 1;
  }

  return {
    title: clip(input.title, ARTICLE_SNAPSHOT_CAPS.title),
    excerpt: clip(input.excerpt, ARTICLE_SNAPSHOT_CAPS.excerpt),
    publicPath: clip(input.publicPath, ARTICLE_SNAPSHOT_CAPS.publicPath),
    categoryName: clip(input.categoryName, ARTICLE_SNAPSHOT_CAPS.categoryName),
    focusKeyword: clip(input.focusKeyword, ARTICLE_SNAPSHOT_CAPS.focusKeyword),
    featuredImage: input.featuredImagePresent ? "present" : "absent",
    body,
    headingCount,
    leftoverHeadings,
  };
}
