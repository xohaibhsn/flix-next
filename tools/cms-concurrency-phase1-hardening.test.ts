import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalJsonRepository } from "../lib/cms/json-repository";
import { assertCmsJsonWritesAllowed, withJsonFileLock } from "../lib/cms/json-store";
import { runMysqlWithBuildFallback } from "../lib/cms/mysql-build-fallback";
import { isPageConflictError, MYSQL_SIGNED_INT_MAX } from "../lib/cms/page-revision";
import type { CmsPage } from "../lib/cms/types";
import { ClientError } from "../lib/security/errors";

const root = path.resolve(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function samplePage(overrides: Partial<CmsPage> = {}): CmsPage {
  return {
    id: "page-home",
    name: "Home",
    slug: "/",
    status: "published",
    cmsEnabled: true,
    contentRevision: 1,
    sections: [],
    ...overrides,
  };
}

// --- Finding A: subscription slug mutation + revision ---

test("Finding A: subscription slug row migration locks, bumps revision, preserves eligibility", () => {
  const src = read("lib/cms/mysql-migrate.ts");
  const block = src.slice(
    src.indexOf("async function migrateSubscriptionPageSlugRow"),
    src.indexOf("async function runSubscriptionSlugMigrationBody"),
  );
  assert.match(block, /SELECT id, slug, content_revision FROM pages WHERE id = \? FOR UPDATE/);
  assert.match(block, /SET slug = \?, content_revision = \?/);
  assert.match(block, /SUBSCRIPTION_SLUG_LEGACY/);
  assert.match(block, /\/iptv-subscriptions-uk/);
  assert.match(block, /nextContentRevision/);
  assert.match(block, /return "noop"/);
  assert.doesNotMatch(block, /Number\.MAX_SAFE_INTEGER/);
  assert.match(src, /await migrateSubscriptionPageSlugRow\(\)/);
  assert.doesNotMatch(
    src.slice(src.indexOf("async function runSubscriptionSlugMigrationBody")),
    /UPDATE pages SET slug = \? WHERE id = \? AND \(slug = \? OR slug = \?\)/,
  );
});

test("Finding A: migration remains one-shot behind SUBSCRIPTION_SLUG_MIGRATION_V1", () => {
  const src = read("lib/cms/mysql-migrate.ts");
  const block = src.slice(src.indexOf("export async function migrateSubscriptionPageSlugIfNeeded"));
  assert.match(block, /SUBSCRIPTION_SLUG_MIGRATION_V1/);
  assert.match(block, /runCompletedMigrationOnce/);
  assert.match(block, /verifySubscriptionSlugMigrationComplete/);
});

// --- Finding B: JSON production fail-closed + same-process serialization ---

test("Finding B: production runtime JSON writes fail closed", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const previousPhase = env.NEXT_PHASE;
  try {
    env.NODE_ENV = "production";
    delete env.NEXT_PHASE;
    assert.throws(() => assertCmsJsonWritesAllowed(), (error: unknown) => {
      assert.ok(error instanceof ClientError);
      assert.match(error.message, /unavailable/i);
      return true;
    });
  } finally {
    env.NODE_ENV = previousNodeEnv;
    if (previousPhase === undefined) delete env.NEXT_PHASE;
    else env.NEXT_PHASE = previousPhase;
  }
});

test("Finding B: MysqlWithBuildFallback mutations never use JSON fallback", () => {
  const src = read("lib/cms/mysql-repository.ts");
  const block = src.slice(src.indexOf("export class MysqlWithBuildFallback"));
  assert.match(block, /runMutation/);
  assert.match(block, /savePage\(page: CmsPage\) \{\s*return this\.runMutation/);
  assert.match(block, /saveSettings\(settings: SiteSettings\) \{\s*return this\.runMutation/);
  assert.doesNotMatch(block, /savePage\(page: CmsPage\) \{\s*return this\.runRead/);
  assert.match(block, /listPages\(\) \{\s*return this\.runRead/);
});

test("Finding B: build-phase MySQL read fallback still available; mutation helper fails closed", async () => {
  const previous = process.env.NEXT_PHASE;
  process.env.NEXT_PHASE = "phase-production-build";
  try {
    const readResult = await runMysqlWithBuildFallback(
      async () => {
        throw new Error("mysql down");
      },
      async () => "from-json",
    );
    assert.equal(readResult, "from-json");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = previous;
  }
});

test("Finding B: overlapping same-process JSON saves — one success, one conflict", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "flix-cms-json-race-"));
  const dataDir = path.join(dir, "data");
  mkdirSync(dataDir, { recursive: true });
  const previousCwd = process.cwd();
  const previousDataDir = process.env.CMS_DATA_DIR;
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  try {
    process.chdir(dir);
    process.env.CMS_DATA_DIR = dataDir;
    env.NODE_ENV = "development";
    writeFileSync(
      path.join(dataDir, "pages.json"),
      JSON.stringify({ pages: [samplePage({ contentRevision: 5 })] }, null, 2),
      "utf8",
    );
    const repo = new LocalJsonRepository();
    const a = samplePage({ contentRevision: 5, name: "A" });
    const b = samplePage({ contentRevision: 5, name: "B" });
    const results = await Promise.allSettled([repo.savePage(a), repo.savePage(b)]);
    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(isPageConflictError((rejected[0] as PromiseRejectedResult).reason), true);
    const winner = (fulfilled[0] as PromiseFulfilledResult<CmsPage>).value;
    assert.equal(winner.contentRevision, 6);
    const disk = JSON.parse(readFileSync(path.join(dataDir, "pages.json"), "utf8")) as {
      pages: CmsPage[];
    };
    assert.equal(disk.pages[0]?.contentRevision, 6);
    assert.equal(disk.pages[0]?.name, winner.name);
  } finally {
    process.chdir(previousCwd);
    env.NODE_ENV = previousNodeEnv;
    if (previousDataDir === undefined) delete process.env.CMS_DATA_DIR;
    else process.env.CMS_DATA_DIR = previousDataDir;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Finding B: same-process file lock serializes work", async () => {
  const order: number[] = [];
  await Promise.all([
    withJsonFileLock("lock-demo.json", async () => {
      order.push(1);
      await new Promise((r) => setTimeout(r, 30));
      order.push(2);
    }),
    withJsonFileLock("lock-demo.json", async () => {
      order.push(3);
    }),
  ]);
  assert.deepEqual(order, [1, 2, 3]);
});

// --- Finding C: schema ensure serialization ---

test("Finding C: schema ensure uses advisory lock helper and content_revision verification", () => {
  const src = read("lib/cms/mysql-migrate.ts");
  assert.match(src, /runWithCmsSchemaAdvisoryLock/);
  assert.match(src, /ensureCmsSchemaSerialized/);
  assert.match(src, /assertPagesContentRevisionColumnCompatible/);
  assert.match(src, /isCompatiblePagesContentRevisionColumn/);
  assert.match(src, /ER_DUP_FIELDNAME/);
  const lockSrc = read("lib/cms/schema-advisory-lock.ts");
  assert.match(lockSrc, /GET_LOCK\(\?, \?\)/);
  assert.match(lockSrc, /RELEASE_LOCK\(\?\)/);
  assert.match(lockSrc, /destroyConnection/);
  assert.match(lockSrc, /conn\.destroy\(\)/);
});

test("Finding C: Ledger schema tokens remain present at version 6", () => {
  const schema = read("lib/db/schema.ts");
  assert.match(schema, /CURRENT_CMS_SCHEMA_VERSION\s*=\s*6/);
  assert.match(schema, /seo_research_runs/);
  assert.match(schema, /seo_opportunity_decisions/);
  assert.match(schema, /content_revision INT NOT NULL DEFAULT 1/);
});

test("Finding C: INT bound still enforced for revision overflow", () => {
  assert.equal(MYSQL_SIGNED_INT_MAX, 2147483647);
  const migrate = read("lib/cms/mysql-migrate.ts");
  assert.match(migrate, /nextContentRevision\(currentRevision\)/);
});
