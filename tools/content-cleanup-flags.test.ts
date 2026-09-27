import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CMS_CONTENT_CLEANUP_V1,
  CONTENT_CLEANUP_FLAG_KEYS,
  TEST_TAGLINE_CLEANUP_V1,
  runCompletedMigrationOnce,
} from "../lib/cms/migration-flags";
import { MANAGED_REDIRECT_SEED_KEY } from "../lib/cms/managed-redirects";
import { applySeoLongformToPage, SEO_LONGFORM_HOME_ID } from "../lib/cms/seo-longform";
import { rewriteDemoCopy } from "../lib/cms/public-copy-cleanup";
import { KNOWN_TEST_TAGLINE, PROFESSIONAL_TAGLINE, withKnownTestTaglineReplaced } from "../lib/cms/settings-cleanup";
import type { CmsPage, CmsSection, RedirectRule } from "../lib/cms/types";

const SITE_SETTINGS_KEY = "site";

function memoryFlags() {
  const flags = new Set<string>();
  return {
    flags,
    hasCompleted: async (key: string) => flags.has(key),
    markCompleted: async (key: string) => {
      flags.add(key);
    },
  };
}

test("no flag → cleanup runs and success writes the flag", async () => {
  const store = memoryFlags();
  let runs = 0;
  const result = await runCompletedMigrationOnce({
    flagKey: CMS_CONTENT_CLEANUP_V1,
    hasCompleted: store.hasCompleted,
    markCompleted: store.markCompleted,
    run: async () => {
      runs += 1;
    },
  });
  assert.equal(result, "ran");
  assert.equal(runs, 1);
  assert.equal(store.flags.has(CMS_CONTENT_CLEANUP_V1), true);
});

test("flag exists → cleanup skipped", async () => {
  const store = memoryFlags();
  store.flags.add(TEST_TAGLINE_CLEANUP_V1);
  let runs = 0;
  const result = await runCompletedMigrationOnce({
    flagKey: TEST_TAGLINE_CLEANUP_V1,
    hasCompleted: store.hasCompleted,
    markCompleted: store.markCompleted,
    run: async () => {
      runs += 1;
    },
  });
  assert.equal(result, "skipped");
  assert.equal(runs, 0);
});

test("cleanup failure → flag NOT written", async () => {
  const store = memoryFlags();
  await assert.rejects(
    () =>
      runCompletedMigrationOnce({
        flagKey: CMS_CONTENT_CLEANUP_V1,
        hasCompleted: store.hasCompleted,
        markCompleted: store.markCompleted,
        run: async () => {
          throw new Error("cleanup blew up");
        },
      }),
    /cleanup blew up/,
  );
  assert.equal(store.flags.has(CMS_CONTENT_CLEANUP_V1), false);
});

test("deferred cleanup does not write the flag", async () => {
  const store = memoryFlags();
  const result = await runCompletedMigrationOnce({
    flagKey: TEST_TAGLINE_CLEANUP_V1,
    hasCompleted: store.hasCompleted,
    markCompleted: store.markCompleted,
    run: async () => "deferred",
  });
  assert.equal(result, "deferred");
  assert.equal(store.flags.has(TEST_TAGLINE_CLEANUP_V1), false);
});

test("repeated init is idempotent after success", async () => {
  const store = memoryFlags();
  let runs = 0;
  const run = async () => {
    runs += 1;
  };
  await runCompletedMigrationOnce({
    flagKey: CMS_CONTENT_CLEANUP_V1,
    hasCompleted: store.hasCompleted,
    markCompleted: store.markCompleted,
    run,
  });
  const second = await runCompletedMigrationOnce({
    flagKey: CMS_CONTENT_CLEANUP_V1,
    hasCompleted: store.hasCompleted,
    markCompleted: store.markCompleted,
    run,
  });
  assert.equal(second, "skipped");
  assert.equal(runs, 1);
});

test("concurrent markCompleted is idempotent", async () => {
  const store = memoryFlags();
  let runs = 0;
  const work = () =>
    runCompletedMigrationOnce({
      flagKey: CMS_CONTENT_CLEANUP_V1,
      hasCompleted: store.hasCompleted,
      markCompleted: store.markCompleted,
      run: async () => {
        runs += 1;
      },
    });
  const results = await Promise.all([work(), work(), work()]);
  assert.equal(store.flags.has(CMS_CONTENT_CLEANUP_V1), true);
  assert.ok(runs >= 1);
  assert.ok(results.every((item) => item === "ran" || item === "skipped"));
  const again = await work();
  assert.equal(again, "skipped");
});

test("custom rich content is not replaced by SEO longform", () => {
  const customHtml = `<p>${"Custom UK streaming guidance written by the editor. ".repeat(20)}</p>`;
  const custom: CmsSection = {
    id: SEO_LONGFORM_HOME_ID,
    type: "rich-content",
    label: "Custom longform",
    order: 1,
    visible: true,
    data: {
      eyebrow: "",
      heading: "Editor custom heading",
      html: customHtml,
      buttonLabel: "",
      buttonHref: "",
      width: "narrow",
      scrollable: false,
      scrollHeight: "standard",
      ctaSource: "custom",
    },
  };
  const page: CmsPage = {
    id: "page-home",
    name: "Welcome",
    slug: "/",
    status: "published",
    cmsEnabled: true,
    sections: [custom],
  };
  const result = applySeoLongformToPage(page);
  assert.equal(result.changed, false);
  assert.equal((result.page.sections[0]?.data as { html: string }).html, customHtml);
});

test("demo rewrite leaves unrelated custom FAQ/plan/blog strings alone", () => {
  const custom = "Message us on WhatsApp for Firestick setup help in the UK.";
  assert.equal(rewriteDemoCopy(custom), custom);
});

test("known test tagline replacement is exact-match only", () => {
  const custom = withKnownTestTaglineReplaced({
    siteName: "Flix IPTV",
    tagline: "Premium UK Streaming Experience",
  } as never);
  assert.equal(custom.changed, false);

  const leaked = withKnownTestTaglineReplaced({
    siteName: "Flix IPTV",
    tagline: KNOWN_TEST_TAGLINE,
  } as never);
  assert.equal(leaked.changed, true);
  assert.equal(leaked.settings.tagline, PROFESSIONAL_TAGLINE);
});

test("empty-DB style bootstrap still runs cleanup when flags are absent", async () => {
  const store = memoryFlags();
  let seeded = false;
  const result = await runCompletedMigrationOnce({
    flagKey: CMS_CONTENT_CLEANUP_V1,
    hasCompleted: store.hasCompleted,
    markCompleted: store.markCompleted,
    run: async () => {
      seeded = true;
    },
  });
  assert.equal(result, "ran");
  assert.equal(seeded, true);
});

test("content cleanup flags do not collide with site settings or managed redirect keys", () => {
  assert.equal(SITE_SETTINGS_KEY, "site");
  assert.ok(!CONTENT_CLEANUP_FLAG_KEYS.includes(SITE_SETTINGS_KEY as never));
  assert.ok(!CONTENT_CLEANUP_FLAG_KEYS.includes(MANAGED_REDIRECT_SEED_KEY as never));
  assert.deepEqual([...CONTENT_CLEANUP_FLAG_KEYS], [CMS_CONTENT_CLEANUP_V1, TEST_TAGLINE_CLEANUP_V1]);
});

test("Junaid-style redirect records are outside content cleanup flags", () => {
  const junaid: RedirectRule = {
    id: "redir-junaid-example",
    sourcePath: "/old-landing/",
    destinationPath: "/welcome/",
    statusCode: 301,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(CONTENT_CLEANUP_FLAG_KEYS.includes(junaid.id as never), false);
  assert.equal(junaid.sourcePath, "/old-landing/");
  assert.equal(junaid.destinationPath, "/welcome/");
  assert.equal(junaid.statusCode, 301);
});
