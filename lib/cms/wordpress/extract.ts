import { cleanWordPressHtml, stripYoastTemplates } from "@/lib/cms/wordpress/clean";
import {
  WP_POSTMETA_COLUMNS,
  WP_POST_COLUMNS,
  WP_TERMS_COLUMNS,
  WP_TERM_RELATIONSHIPS_COLUMNS,
  WP_TERM_TAXONOMY_COLUMNS,
  detectTablePrefix,
  extractInserts,
  rowsToObjects,
  type SqlValue,
} from "@/lib/cms/wordpress/sql-dump";

const PAGE_ROUTE_HINTS: Array<{ slugs: string[]; route: string; label: string }> = [
  { slugs: ["welcome", "home", "index", "the-flix"], route: "/welcome/", label: "Home" },
  {
    slugs: ["iptv-subscriptions-uk", "iptv-subscription", "iptv-subscriptions", "subscriptions", "pricing"],
    route: "/iptv-subscriptions-uk/",
    label: "IPTV Subscription",
  },
  { slugs: ["contact", "contact-us", "contact-the-flix"], route: "/contact/", label: "Contact" },
  { slugs: ["blog", "news", "articles"], route: "/blog/", label: "Blog index" },
];

const YOAST_KEYS = {
  seoTitle: ["_yoast_wpseo_title", "_yoast_seo_title"],
  seoDescription: ["_yoast_wpseo_metadesc", "_yoast_seo_metadesc"],
  canonicalUrl: ["_yoast_wpseo_canonical", "_yoast_seo_canonical"],
  focusKeyword: ["_yoast_wpseo_focuskw", "_yoast_seo_focuskw"],
  ogTitle: ["_yoast_wpseo_opengraph-title", "_yoast_seo_opengraph-title"],
  ogDescription: ["_yoast_wpseo_opengraph-description", "_yoast_seo_opengraph-description"],
  ogImage: ["_yoast_wpseo_opengraph-image", "_yoast_seo_opengraph-image"],
};

export type WpCategory = {
  termId: string;
  name: string;
  slug: string;
};

export type WpMediaRef = {
  attachmentId: string;
  guid: string;
  attachedFile: string;
  title: string;
};

export type WpPostPlan = {
  wpId: string;
  stableId: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: "draft" | "published";
  publishedAt: string | null;
  categorySlugs: string[];
  featuredImage: WpMediaRef | null;
  seoTitle: string;
  seoDescription: string;
  focusKeyword: string;
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  warnings: string[];
};

export type WpPagePackage = {
  wpId: string;
  title: string;
  slug: string;
  suggestedRoute: string | null;
  suggestedLabel: string | null;
  excerpt: string;
  contentPreview: string;
  warnings: string[];
  yoast: {
    seoTitle: string;
    seoDescription: string;
    canonicalUrl: string;
    focusKeyword: string;
  };
};

export type WordpressImportPlan = {
  prefix: string;
  postsFound: number;
  published: number;
  drafts: number;
  categories: WpCategory[];
  mediaReferences: number;
  yoastValuesFound: number;
  posts: WpPostPlan[];
  pages: WpPagePackage[];
  conflicts: string[];
  skipped: string[];
};

function str(value: SqlValue | undefined) {
  if (value == null) return "";
  return String(value);
}

function metaMap(rows: Array<Record<string, SqlValue>>) {
  const map = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const postId = str(row.post_id);
    const key = str(row.meta_key);
    if (!postId || !key) continue;
    const current = map.get(postId) || {};
    current[key] = str(row.meta_value);
    map.set(postId, current);
  }
  return map;
}

function firstMeta(meta: Record<string, string> | undefined, keys: string[]) {
  if (!meta) return "";
  for (const key of keys) {
    if (meta[key]) return stripYoastTemplates(meta[key]);
  }
  return "";
}

function wpStatus(status: string): "draft" | "published" | "skip" {
  if (status === "publish") return "published";
  if (status === "draft" || status === "pending" || status === "future" || status === "private") return "draft";
  return "skip";
}

function mysqlDateToIso(value: string) {
  if (!value || value.startsWith("0000-00-00")) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function pageHint(slug: string) {
  return PAGE_ROUTE_HINTS.find((item) => item.slugs.includes(slug)) || null;
}

export function buildWordpressPlan(sql: string): WordpressImportPlan {
  const prefix = detectTablePrefix(sql);
  const wanted = new Set([
    `${prefix}posts`,
    `${prefix}postmeta`,
    `${prefix}terms`,
    `${prefix}term_taxonomy`,
    `${prefix}term_relationships`,
  ]);
  const tables = extractInserts(sql, wanted);
  const postsTable = tables.get(`${prefix}posts`);
  const metaTable = tables.get(`${prefix}postmeta`);
  const termsTable = tables.get(`${prefix}terms`);
  const taxTable = tables.get(`${prefix}term_taxonomy`);
  const relTable = tables.get(`${prefix}term_relationships`);

  const posts = postsTable ? rowsToObjects(postsTable, WP_POST_COLUMNS) : [];
  const metaRows = metaTable ? rowsToObjects(metaTable, WP_POSTMETA_COLUMNS) : [];
  const terms = termsTable ? rowsToObjects(termsTable, WP_TERMS_COLUMNS) : [];
  const taxonomies = taxTable ? rowsToObjects(taxTable, WP_TERM_TAXONOMY_COLUMNS) : [];
  const rels = relTable ? rowsToObjects(relTable, WP_TERM_RELATIONSHIPS_COLUMNS) : [];
  const meta = metaMap(metaRows);

  const termById = new Map(terms.map((row) => [str(row.term_id), row]));
  const taxById = new Map(taxonomies.map((row) => [str(row.term_taxonomy_id), row]));
  const categories: WpCategory[] = taxonomies
    .filter((row) => str(row.taxonomy) === "category")
    .map((row) => {
      const term = termById.get(str(row.term_id));
      return {
        termId: str(row.term_id),
        name: str(term?.name || "Category"),
        slug: str(term?.slug || "category"),
      };
    })
    .filter((item) => item.slug && item.slug !== "uncategorized");

  const catsByPost = new Map<string, string[]>();
  for (const rel of rels) {
    const tax = taxById.get(str(rel.term_taxonomy_id));
    if (!tax || str(tax.taxonomy) !== "category") continue;
    const term = termById.get(str(tax.term_id));
    if (!term) continue;
    const postId = str(rel.object_id);
    const list = catsByPost.get(postId) || [];
    list.push(str(term.slug));
    catsByPost.set(postId, list);
  }

  const attachments = new Map<string, WpMediaRef>();
  for (const row of posts) {
    if (str(row.post_type) !== "attachment") continue;
    const id = str(row.ID);
    const itemMeta = meta.get(id) || {};
    attachments.set(id, {
      attachmentId: id,
      guid: str(row.guid),
      attachedFile: itemMeta._wp_attached_file || "",
      title: str(row.post_title),
    });
  }

  const postPlans: WpPostPlan[] = [];
  const pages: WpPagePackage[] = [];
  let published = 0;
  let drafts = 0;
  let yoastValuesFound = 0;
  const skipped: string[] = [];

  for (const row of posts) {
    const type = str(row.post_type);
    const wpId = str(row.ID);
    const itemMeta = meta.get(wpId) || {};
    const status = wpStatus(str(row.post_status));
    if (type === "post") {
      if (status === "skip") {
        skipped.push(`post ${wpId} status=${row.post_status}`);
        continue;
      }
      const cleaned = cleanWordPressHtml(str(row.post_content));
      const seoTitle = firstMeta(itemMeta, YOAST_KEYS.seoTitle);
      const seoDescription = firstMeta(itemMeta, YOAST_KEYS.seoDescription);
      const focusKeyword = firstMeta(itemMeta, YOAST_KEYS.focusKeyword);
      const canonicalUrl = firstMeta(itemMeta, YOAST_KEYS.canonicalUrl);
      const ogTitle = firstMeta(itemMeta, YOAST_KEYS.ogTitle);
      const ogDescription = firstMeta(itemMeta, YOAST_KEYS.ogDescription);
      const ogImageUrl = firstMeta(itemMeta, YOAST_KEYS.ogImage);
      if (seoTitle || seoDescription || focusKeyword || canonicalUrl || ogTitle || ogDescription || ogImageUrl) {
        yoastValuesFound += 1;
      }
      if (status === "published") published += 1;
      else drafts += 1;
      const thumbId = itemMeta._thumbnail_id || "";
      postPlans.push({
        wpId,
        stableId: `wp-post-${wpId}`,
        title: str(row.post_title),
        slug: str(row.post_name),
        excerpt: str(row.post_excerpt),
        content: cleaned.html,
        status,
        publishedAt: mysqlDateToIso(str(row.post_date_gmt || row.post_date)),
        categorySlugs: catsByPost.get(wpId) || [],
        featuredImage: thumbId ? attachments.get(thumbId) || null : null,
        seoTitle,
        seoDescription,
        focusKeyword,
        canonicalUrl,
        ogTitle,
        ogDescription,
        ogImageUrl,
        warnings: [
          ...cleaned.warnings,
          !str(row.post_name) ? "Missing slug." : "",
          thumbId && !attachments.get(thumbId) ? `Featured image ${thumbId} was not found in dump.` : "",
        ].filter(Boolean),
      });
      continue;
    }
    if (type === "page") {
      if (status === "skip") continue;
      const cleaned = cleanWordPressHtml(str(row.post_content));
      const slug = str(row.post_name);
      const hint = pageHint(slug);
      const seoTitle = firstMeta(itemMeta, YOAST_KEYS.seoTitle);
      const seoDescription = firstMeta(itemMeta, YOAST_KEYS.seoDescription);
      pages.push({
        wpId,
        title: str(row.post_title),
        slug,
        suggestedRoute: hint?.route || null,
        suggestedLabel: hint?.label || null,
        excerpt: str(row.post_excerpt),
        contentPreview: cleaned.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400),
        warnings: [
          ...cleaned.warnings,
          "Page content is reported only. It will not overwrite page-builder sections.",
        ],
        yoast: {
          seoTitle,
          seoDescription,
          canonicalUrl: firstMeta(itemMeta, YOAST_KEYS.canonicalUrl),
          focusKeyword: firstMeta(itemMeta, YOAST_KEYS.focusKeyword),
        },
      });
    }
  }

  return {
    prefix,
    postsFound: postPlans.length,
    published,
    drafts,
    categories,
    mediaReferences: attachments.size,
    yoastValuesFound,
    posts: postPlans,
    pages,
    conflicts: [],
    skipped,
  };
}

export const WORDPRESS_SELF_TEST_SQL = `
INSERT INTO \`wp_posts\` (\`ID\`, \`post_author\`, \`post_date\`, \`post_date_gmt\`, \`post_content\`, \`post_title\`, \`post_excerpt\`, \`post_status\`, \`comment_status\`, \`ping_status\`, \`post_password\`, \`post_name\`, \`to_ping\`, \`pinged\`, \`post_modified\`, \`post_modified_gmt\`, \`post_content_filtered\`, \`post_parent\`, \`guid\`, \`menu_order\`, \`post_type\`, \`post_mime_type\`, \`comment_count\`) VALUES
(10,1,'2024-01-01 10:00:00','2024-01-01 10:00:00','<!-- wp:paragraph --><p>Hello <a href="https://theflixiptv.com/">Flix</a></p><!-- /wp:paragraph -->','Hello IPTV','A test excerpt','publish','open','open','','hello-iptv','','','2024-01-01 10:00:00','2024-01-01 10:00:00','',0,'https://old.example/hello-iptv/',0,'post','',0),
(11,1,'2024-01-02 10:00:00','2024-01-02 10:00:00','[elementor]broken','Welcome','','publish','open','open','','welcome','','','2024-01-02 10:00:00','2024-01-02 10:00:00','',0,'https://old.example/welcome/',0,'page','',0),
(12,1,'2024-01-01 10:00:00','2024-01-01 10:00:00','','Hero','','inherit','open','open','','hero-jpg','','','2024-01-01 10:00:00','2024-01-01 10:00:00','',0,'https://old.example/wp-content/uploads/2024/01/hero.jpg',0,'attachment','image/jpeg',0);
INSERT INTO \`wp_postmeta\` VALUES (1,10,'_yoast_wpseo_title','Hello SEO'),(2,10,'_yoast_wpseo_metadesc','Hello meta'),(3,10,'_thumbnail_id','12'),(4,12,'_wp_attached_file','2024/01/hero.jpg');
INSERT INTO \`wp_terms\` VALUES (3,'Setup','setup',0);
INSERT INTO \`wp_term_taxonomy\` VALUES (3,3,'category','',0,1);
INSERT INTO \`wp_term_relationships\` VALUES (10,3,0);
`;
