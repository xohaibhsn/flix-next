import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalJsonRepository } from "../lib/cms/json-repository";
import { JsonCatalogRepository } from "../lib/cms/json-catalog";
import { dataFile, readJsonFile, writeJsonFile } from "../lib/cms/json-store";
import { runMysqlWithBuildFallback } from "../lib/cms/mysql-build-fallback";
import { defaultSettings } from "../lib/cms/defaults";
import { KNOWN_TEST_TAGLINE } from "../lib/cms/settings-cleanup";
import { MANAGED_REDIRECTS } from "../lib/cms/managed-redirects";
import type { CmsPage, FaqItem, PricingPlan, BlogPost } from "../lib/cms/types";

const BUILD_PHASE = "phase-production-build";

async function withTempCwd<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "flix-build-purity-"));
  const previous = process.cwd();
  process.chdir(root);
  try {
    await mkdir(path.join(root, "data"), { recursive: true });
    return await fn(root);
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
}

async function withPhase<T>(phase: string | undefined, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.NEXT_PHASE;
  if (phase === undefined) delete process.env.NEXT_PHASE;
  else process.env.NEXT_PHASE = phase;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = previous;
  }
}

function fileHash(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function dirtyPage(): CmsPage {
  return {
    id: "page-home",
    name: "Home",
    slug: "/",
    status: "published",
    cmsEnabled: true,
    sections: [
      {
        id: "sec-home-why",
        type: "why-choose",
        label: "Why",
        order: 1,
        visible: true,
        data: {
          eyebrow: "",
          heading: "Why",
          description: "",
          cards: [
            {
              id: "wc5",
              icon: "ShieldCheck",
              title: "Reliable Network",
              description: "A UK-focused streaming service with a 7-Day Money Back Guarantee if it is not the right fit.",
            },
          ],
        },
      },
    ],
  };
}

test("build-phase listPages returns cleaned content without mutating fixture bytes", async () => {
  await withTempCwd(async () => {
    const pagesPath = dataFile("pages.json");
    await writeFile(pagesPath, `${JSON.stringify({ pages: [dirtyPage()] }, null, 2)}\n`, "utf8");
    const beforeHash = fileHash(pagesPath);
    const beforeMtime = (await stat(pagesPath)).mtimeMs;

    const repo = new LocalJsonRepository();
    const pages = await withPhase(BUILD_PHASE, () => repo.listPages());

    assert.ok(pages.length >= 1);
    const why = pages
      .find((page) => page.id === "page-home")
      ?.sections.find((section) => section.id === "sec-home-why");
    const card = (why?.data as { cards: Array<{ description: string }> }).cards[0];
    assert.match(card.description, /eligible 1 Year plans and above/i);
    assert.equal(fileHash(pagesPath), beforeHash);
    assert.equal((await stat(pagesPath)).mtimeMs, beforeMtime);
  });
});

test("build-phase getSettings returns cleaned settings without writing", async () => {
  await withTempCwd(async () => {
    const settingsPath = dataFile("site-settings.json");
    const dirty = { ...defaultSettings(), tagline: KNOWN_TEST_TAGLINE };
    await writeFile(settingsPath, `${JSON.stringify(dirty, null, 2)}\n`, "utf8");
    const beforeHash = fileHash(settingsPath);

    const repo = new LocalJsonRepository();
    const settings = await withPhase(BUILD_PHASE, () => repo.getSettings());
    assert.notEqual(settings.tagline, KNOWN_TEST_TAGLINE);
    assert.equal(fileHash(settingsPath), beforeHash);
  });
});

test("build-phase catalog cleanup does not persist plans/faqs/posts", async () => {
  await withTempCwd(async () => {
    const dirtyFeature = "A 7-Day Money Back Guarantee if it is not the right fit";
    const plans: PricingPlan[] = [
      {
        id: "plan-1",
        name: "1 Month",
        slug: "1-month",
        price: "£14.99",
        duration: "1 Month",
        badge: "",
        popular: false,
        features: [dirtyFeature],
        buttonLabel: "Choose",
        buttonHref: "/contact/",
        sortOrder: 1,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const faqs: FaqItem[] = [
      {
        id: "faq-1",
        question: "Refund?",
        answer: "We offer a 7-Day Money Back Guarantee. If the service is not suitable, contact us on WhatsApp within the applicable 7-day period.",
        category: "General",
        sortOrder: 1,
        visible: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const posts: BlogPost[] = [
      {
        id: "post-1",
        title: "Guide",
        slug: "guide",
        excerpt: dirtyFeature,
        content: `<p>${dirtyFeature}</p>`,
        categoryId: null,
        featuredImage: null,
        status: "published",
        featured: false,
        publishedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
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
      },
    ];

    await writeFile(dataFile("pricing-plans.json"), `${JSON.stringify(plans, null, 2)}\n`);
    await writeFile(dataFile("faqs.json"), `${JSON.stringify(faqs, null, 2)}\n`);
    await writeFile(dataFile("blog-posts.json"), `${JSON.stringify(posts, null, 2)}\n`);
    const hashes = {
      plans: fileHash(dataFile("pricing-plans.json")),
      faqs: fileHash(dataFile("faqs.json")),
      posts: fileHash(dataFile("blog-posts.json")),
    };

    const catalog = new JsonCatalogRepository();
    const [nextPlans, nextFaqs, nextPosts] = await withPhase(BUILD_PHASE, async () =>
      Promise.all([catalog.listPlans(), catalog.listFaqs(), catalog.listPosts()]),
    );

    assert.notEqual(nextPlans[0]?.features[0], dirtyFeature);
    assert.match(nextFaqs[0]?.answer || "", /eligible 1 Year plans and above/i);
    assert.notEqual(nextPosts[0]?.excerpt, dirtyFeature);
    assert.equal(fileHash(dataFile("pricing-plans.json")), hashes.plans);
    assert.equal(fileHash(dataFile("faqs.json")), hashes.faqs);
    assert.equal(fileHash(dataFile("blog-posts.json")), hashes.posts);
  });
});

test("build-phase managed redirect seeding returns in memory without writing seed files", async () => {
  await withTempCwd(async () => {
    await writeFile(dataFile("redirects.json"), "[]\n");
    const catalog = new JsonCatalogRepository();
    const rules = await withPhase(BUILD_PHASE, () => catalog.listRedirects());
    assert.ok(rules.length >= MANAGED_REDIRECTS.length);
    assert.ok(rules.some((rule) => rule.sourcePath === "/"));
    assert.equal(await readFile(dataFile("redirects.json"), "utf8"), "[]\n");
    await assert.rejects(() => readFile(dataFile("redirect-seeds.json"), "utf8"));
  });
});

test("build-phase readJsonFile ENOENT returns fallback and does not create file", async () => {
  await withTempCwd(async () => {
    const missing = "missing-build-only.json";
    const value = await withPhase(BUILD_PHASE, () => readJsonFile(missing, { ok: true }));
    assert.deepEqual(value, { ok: true });
    await assert.rejects(() => readFile(dataFile(missing), "utf8"));
  });
});

test("non-build mode still persists listPages cleanup", async () => {
  await withTempCwd(async () => {
    const pagesPath = dataFile("pages.json");
    await writeFile(pagesPath, `${JSON.stringify({ pages: [dirtyPage()] }, null, 2)}\n`, "utf8");
    const beforeHash = fileHash(pagesPath);
    const repo = new LocalJsonRepository();
    await withPhase(undefined, () => repo.listPages());
    assert.notEqual(fileHash(pagesPath), beforeHash);
    const written = JSON.parse(await readFile(pagesPath, "utf8")) as { pages: CmsPage[] };
    const card = (
      written.pages
        .find((page) => page.id === "page-home")
        ?.sections.find((section) => section.id === "sec-home-why")?.data as {
        cards: Array<{ description: string }>;
      }
    ).cards[0];
    assert.match(card.description, /eligible 1 Year plans and above/i);
  });
});

test("non-build ENOENT still creates fallback file", async () => {
  await withTempCwd(async () => {
    const missing = "created-outside-build.json";
    const value = await withPhase(undefined, () => readJsonFile(missing, { hello: "world" }));
    assert.deepEqual(value, { hello: "world" });
    const raw = await readFile(dataFile(missing), "utf8");
    assert.deepEqual(JSON.parse(raw), { hello: "world" });
  });
});

test("explicit savePage and saveSettings still persist during build phase", async () => {
  await withTempCwd(async () => {
    const repo = new LocalJsonRepository();
    await withPhase(BUILD_PHASE, async () => {
      const savedPage = await repo.savePage(dirtyPage());
      assert.equal(savedPage.id, "page-home");
      const pagesDisk = JSON.parse(await readFile(dataFile("pages.json"), "utf8")) as { pages: CmsPage[] };
      assert.ok(pagesDisk.pages.some((page) => page.id === "page-home"));

      const settings = { ...defaultSettings(), tagline: "Explicit save tagline" };
      const savedSettings = await repo.saveSettings(settings);
      assert.equal(savedSettings.tagline, "Explicit save tagline");
      const settingsDisk = JSON.parse(await readFile(dataFile("site-settings.json"), "utf8")) as {
        tagline: string;
      };
      assert.equal(settingsDisk.tagline, "Explicit save tagline");
    });
  });
});

test("Mysql build fallback helper returns JSON when MySQL throws during production build", async () => {
  await withPhase(BUILD_PHASE, async () => {
    let warned = false;
    const result = await runMysqlWithBuildFallback(
      async () => {
        throw new Error("mysql down");
      },
      async () => "from-json",
      () => {
        warned = true;
      },
    );
    assert.equal(result, "from-json");
    assert.equal(warned, true);
  });

  await withPhase(undefined, async () => {
    await assert.rejects(
      () =>
        runMysqlWithBuildFallback(
          async () => {
            throw new Error("mysql down");
          },
          async () => "from-json",
        ),
      /mysql down/,
    );
  });
});

test("build-phase does not create any unexpected files under data/", async () => {
  await withTempCwd(async (root) => {
    await writeFile(dataFile("pages.json"), `${JSON.stringify({ pages: [dirtyPage()] }, null, 2)}\n`);
    const repo = new LocalJsonRepository();
    const catalog = new JsonCatalogRepository();
    await withPhase(BUILD_PHASE, async () => {
      await repo.listPages();
      await repo.getSettings();
      await catalog.listPlans();
      await catalog.listFaqs();
      await catalog.listPosts();
      await catalog.listRedirects();
      await writeJsonFile("explicit.json", { ok: true });
    });
    const names = await readdir(path.join(root, "data"));
    assert.deepEqual(names.sort(), ["explicit.json", "pages.json"].sort());
  });
});
