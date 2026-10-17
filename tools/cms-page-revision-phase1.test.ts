import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { LocalJsonRepository } from "../lib/cms/json-repository";
import {
  defaultContentRevision,
  isPageConflictError,
  MYSQL_SIGNED_INT_MAX,
  nextContentRevision,
  PAGE_CONFLICT_CODE,
  PAGE_CONFLICT_MESSAGE,
  parseExpectedContentRevision,
  PageConflictError,
} from "../lib/cms/page-revision";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import { sanitizePage } from "../lib/cms/validation";
import type { CmsPage } from "../lib/cms/types";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    sections: [
      {
        id: "sec-1",
        type: "rich-text",
        label: "Intro",
        order: 1,
        visible: true,
        data: { heading: "", html: "<p>Hello</p>" },
      },
    ],
    ...overrides,
  };
}

test("schema version is 6 with content_revision column", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 6);
  const schema = read("lib/db/schema.ts");
  assert.match(schema, /content_revision INT NOT NULL DEFAULT 1/);
  const sqlMirror = read("db/cms-schema.sql");
  assert.match(sqlMirror, /content_revision INT NOT NULL DEFAULT 1/);
  const migrate = read("lib/cms/mysql-migrate.ts");
  assert.match(migrate, /table:\s*"pages"/);
  assert.match(migrate, /column:\s*"content_revision"/);
  assert.match(migrate, /content_revision INT NOT NULL DEFAULT 1/);
});

test("parseExpectedContentRevision rejects missing and invalid mutation tokens", () => {
  assert.equal(parseExpectedContentRevision(undefined), null);
  assert.equal(parseExpectedContentRevision(null), null);
  assert.equal(parseExpectedContentRevision("1"), null);
  assert.equal(parseExpectedContentRevision(0), null);
  assert.equal(parseExpectedContentRevision(-1), null);
  assert.equal(parseExpectedContentRevision(1.5), null);
  assert.equal(parseExpectedContentRevision(NaN), null);
  assert.equal(parseExpectedContentRevision(1), 1);
  assert.equal(parseExpectedContentRevision(42), 42);
  assert.equal(parseExpectedContentRevision(MYSQL_SIGNED_INT_MAX), MYSQL_SIGNED_INT_MAX);
  assert.equal(parseExpectedContentRevision(MYSQL_SIGNED_INT_MAX + 1), null);
  assert.equal(parseExpectedContentRevision(Number.MAX_SAFE_INTEGER), null);
});

test("sanitizePage defaults missing revision for seed/read without inventing Save CAS equality", () => {
  const sanitized = sanitizePage({
    id: "page-home",
    name: "Home",
    slug: "/",
    status: "published",
    cmsEnabled: true,
    sections: [],
  } as unknown as CmsPage);
  assert.equal(sanitized.contentRevision, 1);
  assert.equal(defaultContentRevision(undefined), 1);
  assert.equal(sanitizePage(samplePage({ contentRevision: 7 })).contentRevision, 7);
});

test("nextContentRevision increments and refuses overflow at MySQL INT max", () => {
  assert.equal(nextContentRevision(1), 2);
  assert.equal(nextContentRevision(MYSQL_SIGNED_INT_MAX - 1), MYSQL_SIGNED_INT_MAX);
  assert.throws(() => nextContentRevision(MYSQL_SIGNED_INT_MAX), /overflow/i);
  assert.equal(MYSQL_SIGNED_INT_MAX, 2147483647);
});

test("PageConflictError carries stable code and message", () => {
  const error = new PageConflictError();
  assert.equal(error.code, PAGE_CONFLICT_CODE);
  assert.equal(error.message, PAGE_CONFLICT_MESSAGE);
  assert.equal(isPageConflictError(error), true);
  assert.equal(isPageConflictError(new Error("nope")), false);
});

test("MySQL savePage uses FOR UPDATE CAS before section rewrite", () => {
  const src = read("lib/cms/mysql-repository.ts");
  const block = src.slice(src.indexOf("async savePage"), src.indexOf("async getSettings"));
  assert.match(block, /FOR UPDATE/);
  assert.match(block, /content_revision = \?/);
  assert.match(block, /WHERE id = \? AND content_revision = \?/);
  assert.match(block, /PageConflictError/);
  assert.match(block, /DELETE FROM page_sections WHERE page_id/);
  assert.ok(block.indexOf("FOR UPDATE") < block.indexOf("DELETE FROM page_sections"));
  assert.doesNotMatch(block, /ON DUPLICATE KEY UPDATE/);
});

test("savePageAction returns PAGE_CONFLICT without cache revalidation", () => {
  const src = read("lib/cms/actions.ts");
  const block = src.slice(
    src.indexOf("export async function savePageAction"),
    src.indexOf("export async function saveSettingsAction"),
  );
  assert.match(block, /PAGE_CONFLICT/);
  assert.match(block, /isPageConflictError/);
  const conflictArm = block.slice(block.indexOf("isPageConflictError"));
  assert.doesNotMatch(conflictArm, /revalidatePublicPagesData|revalidateSidhuCms/);
  assert.match(block, /revalidatePublicPagesData\(\)/);
  assert.match(block, /revalidateSidhuCms\(\)/);
});

test("HomeBuilder preserves local state on failed save", () => {
  const src = read("components/sidhu/HomeBuilder.tsx");
  assert.match(src, /keep local page state|unsaved edits remain/i);
  assert.match(src, /setMessage\(\{ tone: "error"/);
  // Success path updates page/saved; error path must not call setPage(result
  const saveFn = src.slice(src.indexOf("async function save"), src.indexOf("return (\n    <div"));
  const errorBranch = saveFn.slice(saveFn.indexOf("return;") + "return;".length);
  assert.doesNotMatch(errorBranch, /setPage\(result/);
  assert.doesNotMatch(errorBranch, /setSaved\(result/);
});

test("persistPageSectionDiff locks pages, rejects stale snapshots, bumps within MySQL INT", () => {
  const src = read("lib/cms/mysql-migrate.ts");
  const block = src.slice(
    src.indexOf("async function persistPageSectionDiff"),
    src.indexOf("async function cleanupDemoFaqCopy"),
  );
  assert.match(block, /SELECT id FROM pages WHERE id = \? FOR UPDATE/);
  assert.match(block, /sectionsFingerprint\(liveSections\) !== sectionsFingerprint\(before\)/);
  assert.match(block, /Page sections changed during maintenance write/);
  assert.match(block, /content_revision = content_revision \+ 1/);
  assert.match(block, /MYSQL_SIGNED_INT_MAX/);
  assert.match(block, /if \(!willMutate\) return/);
  assert.doesNotMatch(block, /Number\.MAX_SAFE_INTEGER/);
});

test("subscription slug remap recomputes hrefs under page lock", () => {
  const src = read("lib/cms/mysql-migrate.ts");
  const block = src.slice(
    src.indexOf("async function runSubscriptionSlugMigrationBody"),
    src.indexOf("async function verifySubscriptionSlugMigrationComplete"),
  );
  assert.match(block, /SELECT id FROM pages WHERE id = \? FOR UPDATE/);
  assert.match(block, /remapStructuredHrefs\(data\)/);
  assert.match(block, /MYSQL_SIGNED_INT_MAX/);
  assert.doesNotMatch(block, /Number\.MAX_SAFE_INTEGER/);
});

test("JSON savePage rejects stale revision and missing page", async () => {
  const dir = mkdtempSync(join(tmpdir(), "flix-cms-rev-"));
  const dataDir = join(dir, "data");
  mkdirSync(dataDir, { recursive: true });
  const previousCwd = process.cwd();
  const previousDataDir = process.env.CMS_DATA_DIR;
  try {
    process.chdir(dir);
    process.env.CMS_DATA_DIR = dataDir;
    writeFileSync(
      join(dataDir, "pages.json"),
      JSON.stringify({ pages: [samplePage({ contentRevision: 3 })] }, null, 2),
      "utf8",
    );
    const repo = new LocalJsonRepository();
    const stale = samplePage({ contentRevision: 2, name: "Stale" });
    await assert.rejects(() => repo.savePage(stale), (error: unknown) => {
      assert.equal(isPageConflictError(error), true);
      return true;
    });
    const missingRev = { ...samplePage({ contentRevision: 3 }), contentRevision: undefined as unknown as number };
    await assert.rejects(() => repo.savePage(missingRev as CmsPage), (error: unknown) => {
      assert.equal(isPageConflictError(error), true);
      return true;
    });
    const ok = await repo.savePage(samplePage({ contentRevision: 3, name: "Updated" }));
    assert.equal(ok.contentRevision, 4);
    assert.equal(ok.name, "Updated");
    const again = await repo.getPageById("page-home");
    assert.equal(again?.contentRevision, 4);
    await assert.rejects(
      () =>
        repo.savePage(
          samplePage({ id: "page-missing", slug: "/cms-revision-missing-page/", contentRevision: 1 }),
        ),
      (error: unknown) => error instanceof Error && /not found/i.test(error.message),
    );
  } finally {
    process.chdir(previousCwd);
    if (previousDataDir === undefined) delete process.env.CMS_DATA_DIR;
    else process.env.CMS_DATA_DIR = previousDataDir;
    rmSync(dir, { recursive: true, force: true });
  }
});
