import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  buildPublicTargetIndex,
  classifyInternalLink,
  extractHtmlAnchors,
  filterFindings,
  normalizeInternalHref,
  resolveInternalRedirectPath,
  scanInternalLinks,
} from "../lib/cms/internal-links";
import { defaultSettings } from "../lib/cms/defaults";
import type { BlogCategory, BlogPost, CmsPage, RedirectRule } from "../lib/cms/types";

function samplePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-firestick",
    title: "How to Watch IPTV on Firestick",
    slug: "how-to-watch-iptv-on-firestick",
    excerpt: "Excerpt",
    content: "<p>Body</p>",
    categoryId: null,
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: "2024-06-15T10:00:00.000Z",
    createdAt: "2024-06-14T09:00:00.000Z",
    updatedAt: "2024-07-01T12:30:00.000Z",
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
    ...overrides,
  };
}

function sampleCategory(overrides: Partial<BlogCategory> = {}): BlogCategory {
  return {
    id: "cat-guides",
    name: "Guides",
    slug: "guides",
    description: "Guides",
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: null,
    robotsFollow: null,
    sitemapInclude: null,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    ...overrides,
  };
}

function samplePage(overrides: Partial<CmsPage> = {}): CmsPage {
  return {
    id: "page-refund",
    name: "Refund Policy",
    slug: "/refund-policy/",
    status: "published",
    cmsEnabled: true,
    sections: [],
    ...overrides,
  };
}

function targetsFrom(opts?: {
  posts?: BlogPost[];
  categories?: BlogCategory[];
  pages?: CmsPage[];
  settings?: ReturnType<typeof defaultSettings>;
}) {
  const settings = opts?.settings ?? defaultSettings();
  return buildPublicTargetIndex(
    opts?.pages ?? [samplePage()],
    opts?.posts ?? [samplePost()],
    opts?.categories ?? [sampleCategory()],
    settings,
  );
}

test("valid public targets resolve as VALID", () => {
  const redirects: RedirectRule[] = [];
  const pages = [
    samplePage({ id: "page-subscriptions", slug: "/iptv-subscription-uk/", name: "Subscriptions" }),
    samplePage(),
    samplePage({ id: "page-home", slug: "/", name: "Home" }),
    samplePage({ id: "page-contact", slug: "/contact/", name: "Contact" }),
  ];
  const map = targetsFrom({ pages });
  for (const href of [
    "/welcome/",
    "/iptv-subscription-uk/",
    "/blogs/",
    "/blogs/how-to-watch-iptv-on-firestick/",
    "/category/guides/",
    "/contact/",
    "/refund-policy/",
  ]) {
    const result = classifyInternalLink({
      storedHref: href,
      sourcePath: "/blogs/other/",
      targets: map,
      redirects,
    });
    assert.deepEqual(result.issues, ["VALID"], href);
    assert.equal(result.finalPath, href);
  }
});

test("broken target is BROKEN", () => {
  const result = classifyInternalLink({
    storedHref: "/definitely-not-a-real-page/",
    sourcePath: "/welcome/",
    targets: targetsFrom(),
    redirects: [],
  });
  assert.ok(result.issues.includes("BROKEN"));
});

test("CMS redirect source is REDIRECTED", () => {
  const redirects: RedirectRule[] = [
    {
      id: "r1",
      sourcePath: "/old-about/",
      destinationPath: "/about-us/",
      statusCode: 301,
      active: true,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const pages = [samplePage({ id: "page-about", slug: "/about-us/", name: "About" })];
  const result = classifyInternalLink({
    storedHref: "/old-about/",
    sourcePath: "/welcome/",
    targets: targetsFrom({ pages }),
    redirects,
  });
  assert.ok(result.issues.includes("REDIRECTED"));
  assert.equal(result.finalPath, "/about-us/");
});

test("legacy blog paths are LEGACY_BLOG and REDIRECTED", () => {
  const targets = targetsFrom();
  for (const href of ["/blog/", "/blog/how-to-watch-iptv-on-firestick/"]) {
    const result = classifyInternalLink({
      storedHref: href,
      sourcePath: "/welcome/",
      targets,
      redirects: [],
    });
    assert.ok(result.issues.includes("LEGACY_BLOG"), href);
    assert.ok(result.issues.includes("REDIRECTED"), href);
  }
  assert.equal(
    resolveInternalRedirectPath("/blog/how-to-watch-iptv-on-firestick/", []).finalPath,
    "/blogs/how-to-watch-iptv-on-firestick/",
  );
});

test("legacy subscription aliases are LEGACY_SUBSCRIPTION and REDIRECTED", () => {
  const pages = [samplePage({ id: "page-subscriptions", slug: "/iptv-subscription-uk/", name: "Subscriptions" })];
  const targets = targetsFrom({ pages });
  const result = classifyInternalLink({
    storedHref: "/iptv-subscriptions-uk/",
    sourcePath: "/welcome/",
    targets,
    redirects: [],
  });
  assert.ok(result.issues.includes("LEGACY_SUBSCRIPTION"));
  assert.ok(result.issues.includes("REDIRECTED"));
  assert.equal(result.finalPath, "/iptv-subscription-uk/");
});

test("HTTP same-site link is HTTP", () => {
  const result = classifyInternalLink({
    storedHref: "http://theflixiptv.com/contact/",
    sourcePath: "/welcome/",
    targets: targetsFrom({
      pages: [samplePage({ id: "page-contact", slug: "/contact/", name: "Contact" })],
    }),
    redirects: [],
  });
  assert.ok(result.issues.includes("HTTP"));
  assert.equal(result.finalPath, "/contact/");
});

test("WWW same-site link is WWW", () => {
  const result = classifyInternalLink({
    storedHref: "https://www.theflixiptv.com/contact/",
    sourcePath: "/welcome/",
    targets: targetsFrom({
      pages: [samplePage({ id: "page-contact", slug: "/contact/", name: "Contact" })],
    }),
    redirects: [],
  });
  assert.ok(result.issues.includes("WWW"));
  assert.equal(result.finalPath, "/contact/");
});

test("self-link on content canonical is SELF_LINK; fragment is not", () => {
  const targets = targetsFrom();
  const self = classifyInternalLink({
    storedHref: "/blogs/how-to-watch-iptv-on-firestick/",
    sourcePath: "/blogs/how-to-watch-iptv-on-firestick/",
    targets,
    redirects: [],
    checkSelfLink: true,
  });
  assert.ok(self.issues.includes("SELF_LINK"));

  const frag = classifyInternalLink({
    storedHref: "#faq",
    sourcePath: "/blogs/how-to-watch-iptv-on-firestick/",
    targets,
    redirects: [],
    checkSelfLink: true,
  });
  assert.deepEqual(frag.issues, ["VALID"]);
});

test("query string and fragment are ignored for target existence", () => {
  const norm = normalizeInternalHref("/blogs/how-to-watch-iptv-on-firestick/?utm_source=x#comments");
  assert.equal(norm.path, "/blogs/how-to-watch-iptv-on-firestick/");
  const result = classifyInternalLink({
    storedHref: "/blogs/how-to-watch-iptv-on-firestick/?utm_source=x",
    sourcePath: "/welcome/",
    targets: targetsFrom(),
    redirects: [],
  });
  assert.deepEqual(result.issues, ["VALID"]);
  assert.equal(result.normalized.stored.includes("utm_source"), true);
});

test("noindex target is reported without mutating content", () => {
  const post = samplePost({ robotsIndex: false });
  const result = classifyInternalLink({
    storedHref: "/blogs/how-to-watch-iptv-on-firestick/",
    sourcePath: "/welcome/",
    targets: targetsFrom({ posts: [post] }),
    redirects: [],
  });
  assert.ok(result.issues.includes("NOINDEX_TARGET"));
  assert.ok(!result.issues.includes("BROKEN"));
});

test("external URLs are EXTERNAL and excluded from problem filters by default", () => {
  const result = classifyInternalLink({
    storedHref: "https://example.com/somewhere/",
    sourcePath: "/welcome/",
    targets: targetsFrom(),
    redirects: [],
  });
  assert.deepEqual(result.issues, ["EXTERNAL"]);

  const scan = scanInternalLinks({
    settings: defaultSettings(),
    pages: [
      samplePage({
        sections: [
          {
            id: "sec-1",
            type: "rich-content",
            label: "Body",
            visible: true,
            order: 1,
            data: {
              html: '<p><a href="https://example.com/x">Ext</a><a href="/definitely-not-a-real-page/">Bad</a></p>',
              buttonHref: "",
              buttonLabel: "",
              eyebrow: "",
              heading: "",
              width: "normal",
              scrollable: false,
              scrollHeight: "standard",
              ctaSource: "custom",
            },
          },
        ],
      }),
    ],
    posts: [],
    categories: [],
    redirects: [],
    codeLinks: [],
  });
  const problems = filterFindings(scan.findings, "problems");
  assert.ok(problems.every((f) => !f.issues.includes("EXTERNAL") || f.issues.includes("BROKEN")));
  assert.ok(problems.some((f) => f.issues.includes("BROKEN")));
  assert.equal(scan.summary.EXTERNAL >= 1, true);
});

test("draft posts and inactive categories are not valid final targets", () => {
  const draft = samplePost({ status: "draft", slug: "draft-only" });
  const inactive = sampleCategory({ active: false, slug: "inactive-cat" });
  const targets = targetsFrom({ posts: [draft, samplePost()], categories: [inactive, sampleCategory()] });
  assert.equal(targets.has("/blogs/draft-only/"), false);
  assert.equal(targets.has("/category/inactive-cat/"), false);

  const brokenDraft = classifyInternalLink({
    storedHref: "/blogs/draft-only/",
    sourcePath: "/welcome/",
    targets,
    redirects: [],
  });
  assert.ok(brokenDraft.issues.includes("BROKEN"));
});

test("HTML extraction preserves stored href and anchor text", () => {
  const anchors = extractHtmlAnchors(
    '<p><a href="/blog/how-to-watch-iptv-on-firestick/">Firestick guide</a></p>',
  );
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].href, "/blog/how-to-watch-iptv-on-firestick/");
  assert.equal(anchors[0].text, "Firestick guide");
});

test("scan maps edit-source links for pages, posts, and settings", () => {
  const settings = defaultSettings();
  settings.headerNav = [{ id: "n1", label: "Old blog", href: "/blog/", visible: true }];
  const post = samplePost({
    content: '<p><a href="/contact/">Contact</a></p>',
  });
  const page = samplePage({
    id: "page-about",
    slug: "/about-us/",
    name: "About",
    sections: [
      {
        id: "s1",
        type: "rich-text",
        label: "Body",
        visible: true,
        order: 1,
        data: { heading: "", html: '<a href="/welcome/">Home</a>' },
      },
    ],
  });

  const scan = scanInternalLinks({
    settings,
    pages: [page],
    posts: [post],
    categories: [sampleCategory()],
    redirects: [],
    codeLinks: [],
  });

  const nav = scan.findings.find((f) => f.storedHref === "/blog/");
  assert.ok(nav);
  assert.equal(nav?.editHref, "/sidhu/settings/");
  assert.ok(nav?.issues.includes("LEGACY_BLOG"));

  const postLink = scan.findings.find((f) => f.sourceKind === "post" && f.storedHref === "/contact/");
  assert.equal(postLink?.editHref, `/sidhu/blog/${post.id}/`);

  const pageLink = scan.findings.find((f) => f.sourceKind === "page" && f.storedHref === "/welcome/");
  assert.ok(pageLink?.editHref);
});

test("Sidhu internal-links route and SEO nav wiring exist; no auto-fix", () => {
  const root = process.cwd();
  const page = readFileSync(path.join(root, "app/sidhu/(protected)/seo/internal-links/page.tsx"), "utf8");
  const form = readFileSync(path.join(root, "components/sidhu/SeoForm.tsx"), "utf8");
  const report = readFileSync(path.join(root, "components/sidhu/InternalLinksReport.tsx"), "utf8");
  assert.match(page, /scanInternalLinks/);
  assert.match(form, /\/sidhu\/seo\/internal-links\//);
  assert.doesNotMatch(report, /Fix automatically|auto-fix|autofix/i);
  assert.match(report, /Edit source/);
});

test("root path redirects to welcome in diagnostic resolution", () => {
  const resolved = resolveInternalRedirectPath("/", []);
  assert.equal(resolved.redirected, true);
  assert.equal(resolved.finalPath, "/welcome/");
});
