import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  SUBSCRIPTION_SLUG_MIGRATION_V1,
  runCompletedMigrationOnce,
} from "../lib/cms/migration-flags";
import {
  applySubscriptionRedirectMigration,
  isSubscriptionMigrationPostconditionMet,
} from "../lib/cms/subscription-url-migrate";
import { SUBSCRIPTION_SLUG, SUBSCRIPTION_SLUG_LEGACY } from "../lib/cms/page-paths";
import { defaultSettings } from "../lib/cms/defaults";
import type { RedirectRule, SiteSettings } from "../lib/cms/types";

function rule(partial: Partial<RedirectRule> & Pick<RedirectRule, "id" | "sourcePath" | "destinationPath">): RedirectRule {
  return {
    statusCode: 301,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

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

test("missing flag → subscription migration work runs and success writes flag", async () => {
  const store = memoryFlags();
  let runs = 0;
  const result = await runCompletedMigrationOnce({
    flagKey: SUBSCRIPTION_SLUG_MIGRATION_V1,
    hasCompleted: store.hasCompleted,
    markCompleted: store.markCompleted,
    run: async () => {
      runs += 1;
    },
  });
  assert.equal(result, "ran");
  assert.equal(runs, 1);
  assert.equal(store.flags.has(SUBSCRIPTION_SLUG_MIGRATION_V1), true);
});

test("flag exists → expensive subscription migration skipped", async () => {
  const store = memoryFlags();
  store.flags.add(SUBSCRIPTION_SLUG_MIGRATION_V1);
  let runs = 0;
  const result = await runCompletedMigrationOnce({
    flagKey: SUBSCRIPTION_SLUG_MIGRATION_V1,
    hasCompleted: store.hasCompleted,
    markCompleted: store.markCompleted,
    run: async () => {
      runs += 1;
    },
  });
  assert.equal(result, "skipped");
  assert.equal(runs, 0);
});

test("migration error → flag NOT written", async () => {
  const store = memoryFlags();
  await assert.rejects(
    () =>
      runCompletedMigrationOnce({
        flagKey: SUBSCRIPTION_SLUG_MIGRATION_V1,
        hasCompleted: store.hasCompleted,
        markCompleted: store.markCompleted,
        run: async () => {
          throw new Error("migration failed");
        },
      }),
    /migration failed/,
  );
  assert.equal(store.flags.has(SUBSCRIPTION_SLUG_MIGRATION_V1), false);
});

test("verification failure path does not write flag", async () => {
  const store = memoryFlags();
  await assert.rejects(
    () =>
      runCompletedMigrationOnce({
        flagKey: SUBSCRIPTION_SLUG_MIGRATION_V1,
        hasCompleted: store.hasCompleted,
        markCompleted: store.markCompleted,
        run: async () => {
          throw new Error("subscription slug migration postconditions not met");
        },
      }),
    /postconditions not met/,
  );
  assert.equal(store.flags.has(SUBSCRIPTION_SLUG_MIGRATION_V1), false);
});

test("postconditions fail when legacy redirect missing or wrong", () => {
  const settings = defaultSettings();
  assert.equal(
    isSubscriptionMigrationPostconditionMet({
      pageSlug: SUBSCRIPTION_SLUG,
      legacyRedirect: null,
      settings,
    }),
    false,
  );
  assert.equal(
    isSubscriptionMigrationPostconditionMet({
      pageSlug: SUBSCRIPTION_SLUG,
      legacyRedirect: rule({
        id: "redir-slug-page-subscriptions",
        sourcePath: SUBSCRIPTION_SLUG_LEGACY,
        destinationPath: "/wrong/",
      }),
      settings,
    }),
    false,
  );
});

test("postconditions pass for already-correct production-like state", () => {
  const settings = defaultSettings();
  assert.equal(
    isSubscriptionMigrationPostconditionMet({
      pageSlug: SUBSCRIPTION_SLUG,
      legacyRedirect: rule({
        id: "redir-slug-page-subscriptions",
        sourcePath: SUBSCRIPTION_SLUG_LEGACY,
        destinationPath: SUBSCRIPTION_SLUG,
        statusCode: 301,
        active: true,
      }),
      settings,
    }),
    true,
  );
});

test("partially migrated redirects repair before completion", () => {
  const before = [
    rule({
      id: "redir-slug-page-subscriptions",
      sourcePath: SUBSCRIPTION_SLUG_LEGACY,
      destinationPath: "/elsewhere/",
      active: false,
      statusCode: 302,
    }),
  ];
  const migrated = applySubscriptionRedirectMigration(before);
  assert.equal(migrated.changed, true);
  const legacy = migrated.rules.find((item) => item.sourcePath === SUBSCRIPTION_SLUG_LEGACY);
  assert.equal(legacy?.destinationPath, SUBSCRIPTION_SLUG);
  assert.equal(legacy?.statusCode, 301);
  assert.equal(legacy?.active, true);
  assert.equal(
    isSubscriptionMigrationPostconditionMet({
      pageSlug: SUBSCRIPTION_SLUG,
      legacyRedirect: legacy ?? null,
      settings: defaultSettings(),
    }),
    true,
  );
});

test("wrong page slug fails postconditions", () => {
  assert.equal(
    isSubscriptionMigrationPostconditionMet({
      pageSlug: SUBSCRIPTION_SLUG_LEGACY,
      legacyRedirect: rule({
        id: "redir-slug-page-subscriptions",
        sourcePath: SUBSCRIPTION_SLUG_LEGACY,
        destinationPath: SUBSCRIPTION_SLUG,
      }),
      settings: defaultSettings(),
    }),
    false,
  );
});

test("settings still needing remap fail postconditions", () => {
  const settings = {
    ...defaultSettings(),
    headerCtaHref: SUBSCRIPTION_SLUG_LEGACY,
  } satisfies SiteSettings;
  assert.equal(
    isSubscriptionMigrationPostconditionMet({
      pageSlug: SUBSCRIPTION_SLUG,
      legacyRedirect: rule({
        id: "redir-slug-page-subscriptions",
        sourcePath: SUBSCRIPTION_SLUG_LEGACY,
        destinationPath: SUBSCRIPTION_SLUG,
      }),
      settings,
    }),
    false,
  );
});

test("unrelated settings links remain untouched by postcondition helper", () => {
  const settings = {
    ...defaultSettings(),
    headerCtaHref: "/contact/",
  } satisfies SiteSettings;
  assert.equal(
    isSubscriptionMigrationPostconditionMet({
      pageSlug: SUBSCRIPTION_SLUG,
      legacyRedirect: rule({
        id: "redir-slug-page-subscriptions",
        sourcePath: SUBSCRIPTION_SLUG_LEGACY,
        destinationPath: SUBSCRIPTION_SLUG,
      }),
      settings,
    }),
    true,
  );
  assert.equal(settings.headerCtaHref, "/contact/");
});

test("repeated initialization is idempotent after flag", async () => {
  const store = memoryFlags();
  let runs = 0;
  const run = async () => {
    runs += 1;
  };
  await runCompletedMigrationOnce({
    flagKey: SUBSCRIPTION_SLUG_MIGRATION_V1,
    hasCompleted: store.hasCompleted,
    markCompleted: store.markCompleted,
    run,
  });
  const second = await runCompletedMigrationOnce({
    flagKey: SUBSCRIPTION_SLUG_MIGRATION_V1,
    hasCompleted: store.hasCompleted,
    markCompleted: store.markCompleted,
    run,
  });
  assert.equal(second, "skipped");
  assert.equal(runs, 1);
});

test("subscription gate uses exact lookup SQL and keeps ensureReady order", () => {
  const source = readFileSync(path.join(process.cwd(), "lib/cms/mysql-migrate.ts"), "utf8");
  assert.match(source, /SUBSCRIPTION_SLUG_MIGRATION_V1/);
  assert.match(source, /WHERE source_path = \? LIMIT 1/);
  assert.match(source, /export async function migrateSubscriptionPageSlugIfNeeded/);
  const repo = readFileSync(path.join(process.cwd(), "lib/cms/mysql-repository.ts"), "utf8");
  const ready = repo.slice(repo.indexOf("private async ensureReady"), repo.indexOf("ready()"));
  const sub = ready.indexOf("await migrateSubscriptionPageSlugIfNeeded()");
  const seed = ready.indexOf("await seedExtendedIfEmpty()");
  assert.ok(sub >= 0 && seed > sub);
});
