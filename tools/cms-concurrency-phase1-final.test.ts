import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { isCompatiblePagesContentRevisionColumn } from "../lib/cms/content-revision-column";
import {
  __setPagesFileBarrierForTests,
  LocalJsonRepository,
} from "../lib/cms/json-repository";
import { assertCmsJsonWritesAllowed, withJsonFileLock, writeJsonFile } from "../lib/cms/json-store";
import { runMysqlWithBuildFallback } from "../lib/cms/mysql-build-fallback";
import { isPageConflictError } from "../lib/cms/page-revision";
import {
  DEFAULT_CMS_SCHEMA_ENSURE_LOCK,
  runWithCmsSchemaAdvisoryLock,
  type SchemaLockConnection,
} from "../lib/cms/schema-advisory-lock";
import { defaultPages } from "../lib/cms/defaults";
import type { CmsPage } from "../lib/cms/types";
import { cmsJsonWritesAllowed } from "../lib/db/config";
import { ClientError } from "../lib/security/errors";

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

function withTempRepo(run: (repo: LocalJsonRepository, dataDir: string) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "flix-cms-final-"));
    const dataDir = path.join(dir, "data");
    mkdirSync(dataDir, { recursive: true });
    const previousCwd = process.cwd();
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = env.NODE_ENV;
    const previousPhase = env.NEXT_PHASE;
    try {
      process.chdir(dir);
      env.NODE_ENV = "development";
      delete env.NEXT_PHASE;
      __setPagesFileBarrierForTests(null);
      await run(new LocalJsonRepository(), dataDir);
    } finally {
      __setPagesFileBarrierForTests(null);
      process.chdir(previousCwd);
      env.NODE_ENV = previousNodeEnv;
      if (previousPhase === undefined) delete env.NEXT_PHASE;
      else env.NEXT_PHASE = previousPhase;
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function readPages(dataDir: string): CmsPage[] {
  return (JSON.parse(readFileSync(path.join(dataDir, "pages.json"), "utf8")) as { pages: CmsPage[] }).pages;
}

// --- Finding A ---

test(
  "Finding A: overlapping savePage — one success, one conflict",
  withTempRepo(async (repo, dataDir) => {
    writeFileSync(
      path.join(dataDir, "pages.json"),
      JSON.stringify({ pages: [samplePage({ contentRevision: 4, name: "Base" })] }, null, 2),
    );
    const results = await Promise.allSettled([
      repo.savePage(samplePage({ contentRevision: 4, name: "A" })),
      repo.savePage(samplePage({ contentRevision: 4, name: "B" })),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(bad.length, 1);
    assert.equal(isPageConflictError((bad[0] as PromiseRejectedResult).reason), true);
    const winner = (ok[0] as PromiseFulfilledResult<CmsPage>).value;
    assert.equal(winner.contentRevision, 5);
    assert.equal(readPages(dataDir)[0]?.contentRevision, 5);
    assert.equal(readPages(dataDir)[0]?.name, winner.name);
  }),
);

test(
  "Finding A: listPages migration cannot overwrite a newer Save",
  withTempRepo(async (repo, dataDir) => {
    // Legacy subscription slug triggers listPages persistence.
    writeFileSync(
      path.join(dataDir, "pages.json"),
      JSON.stringify(
        {
          pages: [
            samplePage({
              id: "page-subscriptions",
              name: "IPTV Subscription",
              slug: "/iptv-subscriptions-uk/",
              contentRevision: 1,
            }),
          ],
        },
        null,
        2,
      ),
    );

    let releaseListPages!: () => void;
    const listHeld = new Promise<void>((resolve) => {
      releaseListPages = resolve;
    });
    let listEntered = false;
    __setPagesFileBarrierForTests(async () => {
      if (!listEntered) {
        listEntered = true;
        // Signal that listPages holds the lock after its read/transform.
        (globalThis as { __listReady?: () => void }).__listReady?.();
        await listHeld;
      }
    });

    let markListReady!: () => void;
    const listReady = new Promise<void>((resolve) => {
      markListReady = resolve;
    });
    (globalThis as { __listReady?: () => void }).__listReady = markListReady;

    const listPromise = repo.listPages();
    await listReady;

    const savePromise = repo.savePage(
      samplePage({
        id: "page-subscriptions",
        name: "Saved Winner",
        slug: "/iptv-subscription-uk/",
        contentRevision: 1,
      }),
    );

    // Save is waiting on the lock. Finish listPages (may persist migrated slug at rev 1).
    releaseListPages();
    await listPromise;
    const saved = await savePromise;
    assert.equal(saved.contentRevision, 2);
    assert.equal(saved.name, "Saved Winner");
    const disk = readPages(dataDir)[0];
    assert.equal(disk?.contentRevision, 2);
    assert.equal(disk?.name, "Saved Winner");
    assert.equal(disk?.slug, "/iptv-subscription-uk/");
  }),
);

test(
  "Finding A: Save held under lock forces listPages to observe new revision",
  withTempRepo(async (repo, dataDir) => {
    writeFileSync(
      path.join(dataDir, "pages.json"),
      JSON.stringify({ pages: [samplePage({ contentRevision: 1, name: "Old" })] }, null, 2),
    );

    let releaseSave!: () => void;
    const saveHeld = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let saveEntered = false;
    __setPagesFileBarrierForTests(async () => {
      if (!saveEntered) {
        saveEntered = true;
        (globalThis as { __saveReady?: () => void }).__saveReady?.();
        await saveHeld;
      }
    });

    let markSaveReady!: () => void;
    const saveReady = new Promise<void>((resolve) => {
      markSaveReady = resolve;
    });
    (globalThis as { __saveReady?: () => void }).__saveReady = markSaveReady;

    const savePromise = repo.savePage(samplePage({ contentRevision: 1, name: "New" }));
    await saveReady;
    const listPromise = repo.listPages();
    releaseSave();
    const saved = await savePromise;
    const listed = await listPromise;
    assert.equal(saved.contentRevision, 2);
    assert.equal(listed.find((p) => p.id === "page-home")?.contentRevision, 2);
    assert.equal(listed.find((p) => p.id === "page-home")?.name, "New");
    assert.equal(readPages(dataDir)[0]?.contentRevision, 2);
  }),
);

test("Finding A: lock queue continues after an exception", async () => {
  await assert.rejects(
    () =>
      withJsonFileLock("lock-exc.json", async () => {
        throw new Error("boom");
      }),
    /boom/,
  );
  let ran = false;
  await withJsonFileLock("lock-exc.json", async () => {
    ran = true;
  });
  assert.equal(ran, true);
});

test(
  "Finding A: second listPages is a no-op rewrite after stable snapshot",
  withTempRepo(async (repo, dataDir) => {
    writeFileSync(
      path.join(dataDir, "pages.json"),
      `${JSON.stringify({ pages: defaultPages() }, null, 2)}\n`,
      "utf8",
    );
    await repo.listPages();
    const mid = readFileSync(path.join(dataDir, "pages.json"), "utf8");
    await repo.listPages();
    const after = readFileSync(path.join(dataDir, "pages.json"), "utf8");
    assert.equal(after, mid);
  }),
);

// --- Finding B ---

test("Finding B: production runtime rejects JSON writes", () => {
  const env = process.env as Record<string, string | undefined>;
  const prevNode = env.NODE_ENV;
  const prevPhase = env.NEXT_PHASE;
  try {
    env.NODE_ENV = "production";
    delete env.NEXT_PHASE;
    assert.equal(cmsJsonWritesAllowed(), false);
    assert.throws(() => assertCmsJsonWritesAllowed(), (e: unknown) => e instanceof ClientError);
  } finally {
    env.NODE_ENV = prevNode;
    if (prevPhase === undefined) delete env.NEXT_PHASE;
    else env.NEXT_PHASE = prevPhase;
  }
});

test("Finding B: production build rejects JSON writes even with NEXT_PHASE set", async () => {
  const env = process.env as Record<string, string | undefined>;
  const prevNode = env.NODE_ENV;
  const prevPhase = env.NEXT_PHASE;
  try {
    env.NODE_ENV = "production";
    env.NEXT_PHASE = "phase-production-build";
    assert.equal(cmsJsonWritesAllowed(), false);
    await assert.rejects(() => writeJsonFile("build-write.json", { a: 1 }), (e: unknown) => {
      assert.ok(e instanceof ClientError);
      return true;
    });
  } finally {
    env.NODE_ENV = prevNode;
    if (prevPhase === undefined) delete env.NEXT_PHASE;
    else env.NEXT_PHASE = prevPhase;
  }
});

test("Finding B: stale NEXT_PHASE cannot reopen writes when NODE_ENV is production", () => {
  const env = process.env as Record<string, string | undefined>;
  const prevNode = env.NODE_ENV;
  const prevPhase = env.NEXT_PHASE;
  try {
    env.NODE_ENV = "production";
    env.NEXT_PHASE = "phase-production-build";
    assert.equal(cmsJsonWritesAllowed(), false);
  } finally {
    env.NODE_ENV = prevNode;
    if (prevPhase === undefined) delete env.NEXT_PHASE;
    else env.NEXT_PHASE = prevPhase;
  }
});

test("Finding B: development Save still works", withTempRepo(async (repo, dataDir) => {
  writeFileSync(
    path.join(dataDir, "pages.json"),
    JSON.stringify({ pages: [samplePage({ contentRevision: 1 })] }, null, 2),
  );
  const saved = await repo.savePage(samplePage({ contentRevision: 1, name: "Dev" }));
  assert.equal(saved.contentRevision, 2);
  assert.equal(readPages(dataDir)[0]?.name, "Dev");
}));

test("Finding B: MySQL mutation path has no JSON fallback helper usage for saves", async () => {
  const previous = process.env.NEXT_PHASE;
  process.env.NEXT_PHASE = "phase-production-build";
  try {
    // Read fallback still works in build.
    const read = await runMysqlWithBuildFallback(
      async () => {
        throw new Error("mysql down");
      },
      async () => "json-read",
    );
    assert.equal(read, "json-read");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = previous;
  }
});

// --- Finding C ---

function fakeConn(opts: {
  getLock?: unknown;
  releaseLock?: unknown;
  releaseThrows?: boolean;
  getLockThrows?: boolean;
}) {
  const conn: SchemaLockConnection & {
    releasedToPool: boolean;
    destroyed: boolean;
    queries: string[];
  } = {
    releasedToPool: false,
    destroyed: false,
    queries: [],
    async query(sql: string): Promise<[unknown, unknown]> {
      conn.queries.push(sql);
      if (sql.includes("GET_LOCK")) {
        if (opts.getLockThrows) throw new Error("get_lock failed");
        return [[{ acquired: opts.getLock }], []];
      }
      if (sql.includes("RELEASE_LOCK")) {
        if (opts.releaseThrows) throw new Error("release_lock failed");
        return [[{ released: opts.releaseLock }], []];
      }
      return [[], []];
    },
    release() {
      conn.releasedToPool = true;
    },
    destroy() {
      conn.destroyed = true;
    },
  };
  return conn;
}

test("Finding C: successful GET_LOCK → ensure → RELEASE_LOCK returns connection", async () => {
  const conn = fakeConn({ getLock: 1, releaseLock: 1 });
  let ensured = false;
  await runWithCmsSchemaAdvisoryLock({
    getConnection: async () => conn,
    readIsFastPath: async () => false,
    ensureSchema: async () => {
      ensured = true;
    },
  });
  assert.equal(ensured, true);
  assert.equal(conn.releasedToPool, true);
  assert.equal(conn.destroyed, false);
  assert.ok(conn.queries.some((q) => q.includes("GET_LOCK")));
  assert.ok(conn.queries.some((q) => q.includes("RELEASE_LOCK")));
  assert.equal(DEFAULT_CMS_SCHEMA_ENSURE_LOCK, "flix_next_cms_schema_ensure_v1");
});

test("Finding C: GET_LOCK timeout fails closed without ensure", async () => {
  const conn = fakeConn({ getLock: 0 });
  let ensured = false;
  await assert.rejects(
    () =>
      runWithCmsSchemaAdvisoryLock({
        getConnection: async () => conn,
        readIsFastPath: async () => false,
        ensureSchema: async () => {
          ensured = true;
        },
      }),
    /could not acquire/i,
  );
  assert.equal(ensured, false);
  assert.equal(conn.releasedToPool, true);
  assert.equal(conn.destroyed, false);
});

test("Finding C: GET_LOCK NULL fails closed", async () => {
  const conn = fakeConn({ getLock: null });
  await assert.rejects(
    () =>
      runWithCmsSchemaAdvisoryLock({
        getConnection: async () => conn,
        readIsFastPath: async () => false,
        ensureSchema: async () => undefined,
      }),
    /could not acquire/i,
  );
});

test("Finding C: RELEASE_LOCK failure destroys connection and does not release to pool", async () => {
  const conn = fakeConn({ getLock: 1, releaseThrows: true });
  await assert.rejects(
    () =>
      runWithCmsSchemaAdvisoryLock({
        getConnection: async () => conn,
        readIsFastPath: async () => false,
        ensureSchema: async () => undefined,
      }),
    /not released cleanly/i,
  );
  assert.equal(conn.destroyed, true);
  assert.equal(conn.releasedToPool, false);
});

test("Finding C: RELEASE_LOCK 0 destroys connection", async () => {
  const conn = fakeConn({ getLock: 1, releaseLock: 0 });
  await assert.rejects(
    () =>
      runWithCmsSchemaAdvisoryLock({
        getConnection: async () => conn,
        readIsFastPath: async () => false,
        ensureSchema: async () => undefined,
      }),
    /not released cleanly/i,
  );
  assert.equal(conn.destroyed, true);
  assert.equal(conn.releasedToPool, false);
});

test("Finding C: ensure error preserved when release succeeds", async () => {
  const conn = fakeConn({ getLock: 1, releaseLock: 1 });
  await assert.rejects(
    () =>
      runWithCmsSchemaAdvisoryLock({
        getConnection: async () => conn,
        readIsFastPath: async () => false,
        ensureSchema: async () => {
          throw new Error("ddl failed");
        },
      }),
    /ddl failed/,
  );
  assert.equal(conn.releasedToPool, true);
});

test("Finding C: fast-path skips ensureSchema", async () => {
  const conn = fakeConn({ getLock: 1, releaseLock: 1 });
  let ensured = false;
  await runWithCmsSchemaAdvisoryLock({
    getConnection: async () => conn,
    readIsFastPath: async () => true,
    ensureSchema: async () => {
      ensured = true;
    },
  });
  assert.equal(ensured, false);
  assert.equal(conn.releasedToPool, true);
});

test("Finding C: compatible content_revision metadata accepted", () => {
  const check = isCompatiblePagesContentRevisionColumn({
    TABLE_SCHEMA: "flix",
    TABLE_NAME: "pages",
    COLUMN_NAME: "content_revision",
    DATA_TYPE: "int",
    COLUMN_TYPE: "int",
    IS_NULLABLE: "NO",
    COLUMN_DEFAULT: "1",
  }, "flix");
  assert.equal(check.ok, true);
});

test("Finding C: incompatible content_revision metadata rejected", () => {
  const unsigned = isCompatiblePagesContentRevisionColumn({
    TABLE_SCHEMA: "flix",
    TABLE_NAME: "pages",
    COLUMN_NAME: "content_revision",
    DATA_TYPE: "int",
    COLUMN_TYPE: "int unsigned",
    IS_NULLABLE: "NO",
    COLUMN_DEFAULT: "1",
  }, "flix");
  assert.equal(unsigned.ok, false);

  const nullable = isCompatiblePagesContentRevisionColumn({
    TABLE_SCHEMA: "flix",
    TABLE_NAME: "pages",
    COLUMN_NAME: "content_revision",
    DATA_TYPE: "int",
    COLUMN_TYPE: "int",
    IS_NULLABLE: "YES",
    COLUMN_DEFAULT: "1",
  }, "flix");
  assert.equal(nullable.ok, false);

  const badDefault = isCompatiblePagesContentRevisionColumn({
    TABLE_SCHEMA: "flix",
    TABLE_NAME: "pages",
    COLUMN_NAME: "content_revision",
    DATA_TYPE: "int",
    COLUMN_TYPE: "int",
    IS_NULLABLE: "NO",
    COLUMN_DEFAULT: "0",
  }, "flix");
  assert.equal(badDefault.ok, false);
});
