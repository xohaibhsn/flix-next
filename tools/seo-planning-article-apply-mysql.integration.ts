/**
 * A2-6 — REAL disposable MySQL acceptance for inactive durable Apply.
 *
 * Requires: node tools/run-seo-planning-article-apply-mysql-integration.cjs
 * Filename avoids `*.test.ts` so auth/unit suites never auto-run mutations.
 *
 * Classification legend (per test title prefix):
 *   REAL_MYSQL_TRANSACTION | REAL_MYSQL_CONSTRAINT | REAL_MYSQL_CONCURRENT | STATIC_ONLY
 *
 * Uses injected DurableMysqlTxnFacade over a real mysql2 pool — never opens
 * production getDbPool credentials, never registers schema with ensureCmsSchema.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { SeoResearchOpportunity } from "../lib/cms/ai-seo/research-schemas";
import { normalizeGeneratedArticle } from "../lib/cms/ai-seo/blog-article-openai";
import {
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipeline,
} from "../lib/cms/seo-decision-pipeline";
import {
  A2_APPLY_APPROVAL_TABLE,
  A2_APPLY_AUDIT_TABLE,
  A2_APPLY_DURABLE_DDL_STATEMENTS,
  A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE,
  A2_APPLY_PREVIEW_TABLE,
} from "../lib/cms/seo-planning/article-apply-durable-schema";
import {
  createInactiveMysqlCmsApplyDeps,
  type DurableMysqlExecutor,
  type DurableMysqlRow,
  type DurableMysqlTxnFacade,
} from "../lib/cms/seo-planning/article-apply-durable-mysql";
import { SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED } from "../lib/cms/seo-planning/article-apply-production-gate";
import { applyPrivateArticleViaCmsAdapter } from "../lib/cms/seo-planning/article-cms-apply-adapter";
import { assessArticleEvidencePackForApply } from "../lib/cms/seo-planning/article-evidence-pack-adapter";
import {
  evaluateNewBlogArticleEligibility,
  SEO_AI_ARTICLE_GENERATION_SPEC,
  type PrivateArticlePreview,
} from "../lib/cms/seo-planning/article-generation";
import {
  fingerprintPrivateApplyContent,
  type TrustedPrivateApplyActor,
} from "../lib/cms/seo-planning/article-private-apply-local";
import type { SeoPlanningDraft } from "../lib/cms/types";
import { CMS_SCHEMA_STATEMENTS } from "../lib/db/schema";

const require = createRequire(import.meta.url);
const mysql = require("mysql2/promise") as typeof import("mysql2/promise");

const APPROVED_HOST = "127.0.0.1";
const APPROVED_PORT = "3310";
const APPROVED_DB = "flix_a2_apply_acceptance_disposable";
const PRODUCTION_DB = "u992747032_flixnext";

type SqlParam = string | number | boolean | null | Date;

function assertOptIn() {
  if (String(process.env.A2_APPLY_MYSQL_INTEGRATION || "") !== "1") {
    throw new Error("REAL_MYSQL_VALIDATION_BLOCKED: A2_APPLY_MYSQL_INTEGRATION opt-in missing");
  }
  assert.equal(process.env.A2_APPLY_MYSQL_HOST, APPROVED_HOST);
  assert.equal(process.env.A2_APPLY_MYSQL_PORT, APPROVED_PORT);
  assert.equal(process.env.A2_APPLY_MYSQL_DATABASE, APPROVED_DB);
  assert.equal(process.env.A2_APPLY_MYSQL_USER, "root");
  assert.equal(process.env.DB_HOST || "", "");
  assert.equal(process.env.DB_NAME || "", "");
  assert.notEqual(APPROVED_DB, PRODUCTION_DB);
}

function createPool(): Pool {
  assertOptIn();
  return mysql.createPool({
    host: APPROVED_HOST,
    port: Number(APPROVED_PORT),
    user: "root",
    password: "",
    database: APPROVED_DB,
    waitForConnections: true,
    connectionLimit: 4,
    maxIdle: 4,
    idleTimeout: 30_000,
    enableKeepAlive: true,
    charset: "utf8mb4",
    timezone: "Z",
    connectTimeout: 5000,
  });
}

function createRealFacade(pool: Pool): DurableMysqlTxnFacade & {
  openTxns: number;
  peakOpenTxns: number;
} {
  let openTxns = 0;
  let peakOpenTxns = 0;
  return {
    get openTxns() {
      return openTxns;
    },
    get peakOpenTxns() {
      return peakOpenTxns;
    },
    async queryOutsideTxn(sql, params) {
      const [rows] = await pool.query(sql, params as SqlParam[]);
      return rows as DurableMysqlRow[];
    },
    async runInTransaction(work) {
      const conn: PoolConnection = await pool.getConnection();
      openTxns += 1;
      peakOpenTxns = Math.max(peakOpenTxns, openTxns);
      await conn.beginTransaction();
      try {
        const exec: DurableMysqlExecutor = {
          async query(sql, params) {
            const [rows] = await conn.query(sql, params as SqlParam[]);
            return rows as DurableMysqlRow[];
          },
          async execute(sql, params) {
            const [result] = await conn.execute(sql, params as SqlParam[]);
            const header = result as ResultSetHeader;
            return { affectedRows: Number(header.affectedRows || 0) };
          },
        };
        const out = await work(exec);
        await conn.commit();
        return out;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        openTxns -= 1;
        conn.release();
      }
    },
  };
}

async function q(pool: Pool, sql: string, params: SqlParam[] = []) {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows;
}

async function exec(pool: Pool, sql: string, params: SqlParam[] = []) {
  await pool.execute(sql, params);
}

async function assertIsolationIdentity(pool: Pool) {
  assertOptIn();
  const rows = await q(
    pool,
    `SELECT DATABASE() AS db, @@port AS port, @@bind_address AS bind_addr, @@version AS ver, @@datadir AS datadir`,
  );
  assert.equal(String(rows[0].db), APPROVED_DB);
  assert.equal(String(rows[0].port), APPROVED_PORT);
  assert.equal(String(rows[0].bind_addr), APPROVED_HOST);
  assert.match(String(rows[0].ver), /^8\.0\.46/);
  assert.match(String(rows[0].datadir).toLowerCase(), /\.flix-mysql-disposable/);
  const prod = await q(
    pool,
    `SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
    [PRODUCTION_DB],
  );
  assert.equal(prod.length, 0);
  return String(rows[0].ver);
}

async function wipeTestOwnedTables(pool: Pool) {
  await assertIsolationIdentity(pool);
  await exec(pool, "SET FOREIGN_KEY_CHECKS=0");
  const tables = await q(
    pool,
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  );
  for (const row of tables) {
    await exec(pool, `DROP TABLE IF EXISTS \`${String(row.name)}\``);
  }
  await exec(pool, "SET FOREIGN_KEY_CHECKS=1");
}

function parentDdl(): string[] {
  return CMS_SCHEMA_STATEMENTS.filter((statement) =>
    /CREATE TABLE IF NOT EXISTS (admin_users|blog_posts|seo_planning_drafts)\b/i.test(statement),
  );
}

async function applyIsolatedSchema(pool: Pool) {
  for (const statement of parentDdl()) {
    await exec(pool, statement);
  }
  for (const statement of A2_APPLY_DURABLE_DDL_STATEMENTS) {
    await exec(pool, statement);
  }
}

function toMysqlDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 19).replace("T", " ");
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function trustedDraftingReady() {
  const ctx = createSeoDecisionPipelineContextFromData({
    posts: [],
    planningDrafts: [],
    runId: "a2-6-mysql-acceptance",
  });
  const opp: SeoResearchOpportunity = {
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    searchIntent: "INFORMATIONAL",
    whyNow: "UK Firestick setup queries are rising while competitor guides stay generic.",
    webEvidence: "Competitor posts list apps without UK device steps or Flix-specific setup notes.",
    existingCoverage: "NONE",
    matchedTitle: null,
    matchedPublicUrl: null,
    recommendation: "NEW_BLOG",
    restorePath: "",
    suggestedAngle: "Practical UK Firestick setup angle.",
    nextStep: "Review in Planning.",
    confidence: "HIGH",
    gscEvidenceRefs: ["Q1"],
    gscEvidence: [
      {
        id: "Q1",
        kind: "query",
        query: "firestick iptv setup uk",
        pageUrl: undefined,
        normalizedPath: null,
        classification: undefined,
        clicks: 12,
        impressions: 200,
        ctr: 0.06,
        position: 18,
        clicksDirection: "UP",
        impressionsDirection: "UP",
        ctrDirection: "FLAT",
        positionDirection: "UP",
      },
    ],
    historicalSignal: false,
  };
  const pipeline = evaluateSeoOpportunityPipeline(ctx, opp);
  const trusted = assessArticleEvidencePackForApply({
    opportunityIndex: 0,
    pipeline,
    sources: [
      {
        title: "Amazon Fire TV setup help",
        url: "https://www.amazon.co.uk/gp/help/customer/display.html",
        domain: "amazon.co.uk",
      },
    ],
    groundedEvidence: [
      {
        id: "ge_amazon",
        kind: "source_verified",
        description: "Amazon Fire TV help pages document device setup steps used in the angle.",
        sourceUrl: "https://www.amazon.co.uk/gp/help/customer/display.html",
      },
      {
        id: "ge_flix_fact",
        kind: "site_fact",
        description: "The Flix IPTV publishes UK-focused Firestick setup guidance on-site.",
      },
    ],
    gscEvidence: opp.gscEvidence,
    originalContribution: {
      statement:
        "Compare Firestick setup steps against The Flix IPTV UK onboarding checklist and supported app list.",
      backing: "grounded_evidence",
      evidenceIds: ["ge_flix_fact", "ge_amazon"],
    },
  });
  assert.equal(trusted.applyEvidenceGate, "PASS_DRAFTING_REVIEW_ONLY");
  return trusted;
}

function trustedEvidenceHold() {
  const ctx = createSeoDecisionPipelineContextFromData({
    posts: [],
    planningDrafts: [],
    runId: "a2-6-mysql-hold",
  });
  const opp: SeoResearchOpportunity = {
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    searchIntent: "INFORMATIONAL",
    whyNow: "UK Firestick setup queries are rising while competitor guides stay generic.",
    webEvidence: "Competitor posts list apps without UK device steps.",
    existingCoverage: "NONE",
    matchedTitle: null,
    matchedPublicUrl: null,
    recommendation: "REFRESH_EXISTING",
    restorePath: "",
    suggestedAngle: "Practical UK Firestick setup angle.",
    nextStep: "Review in Planning.",
    confidence: "HIGH",
    gscEvidenceRefs: ["Q1"],
    gscEvidence: [
      {
        id: "Q1",
        kind: "query",
        query: "firestick iptv setup uk",
        pageUrl: undefined,
        normalizedPath: null,
        classification: undefined,
        clicks: 12,
        impressions: 200,
        ctr: 0.06,
        position: 18,
        clicksDirection: "UP",
        impressionsDirection: "UP",
        ctrDirection: "FLAT",
        positionDirection: "UP",
      },
    ],
    historicalSignal: false,
  };
  const pipeline = evaluateSeoOpportunityPipeline(ctx, opp);
  const trusted = assessArticleEvidencePackForApply({
    opportunityIndex: 0,
    pipeline,
    sources: [
      {
        title: "Amazon Fire TV setup help",
        url: "https://www.amazon.co.uk/gp/help/customer/display.html",
        domain: "amazon.co.uk",
      },
    ],
    groundedEvidence: [
      {
        id: "ge_amazon",
        kind: "source_verified",
        description: "Amazon Fire TV help pages document device setup steps used in the angle.",
        sourceUrl: "https://www.amazon.co.uk/gp/help/customer/display.html",
      },
    ],
    gscEvidence: opp.gscEvidence,
    originalContribution: {
      statement: "Refresh existing coverage with Firestick steps.",
      backing: "grounded_evidence",
      evidenceIds: ["ge_amazon"],
    },
  });
  assert.equal(trusted.applyEvidenceGate, "BLOCK");
  return trusted;
}

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_a2_mysql",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:a2-mysql-acceptance",
    topic: "UK IPTV buffering checklist",
    workingTitle: "Fix UK IPTV buffering without guesswork",
    proposedSlug: "uk-iptv-buffering-checklist-a2",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "TROUBLESHOOTING",
    linkedPostId: null,
    createdBy: "admin_trusted_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T01:00:00.000Z",
    payload: {
      opportunity: {
        topic: "Frozen topic",
        whyNow: "Readers report evening buffering.",
        webEvidence: "A support page describes a local network check.",
        existingCoverage: "PARTIAL",
        confidence: "HIGH",
        matchedTitle: "Existing guide",
        gscEvidence: [],
      },
      workspace: {
        contentAngle: "Practical home-network checks",
        nextStep: "Draft troubleshooting article",
        humanNotes: "Keep claims modest.",
      },
      sources: [{ title: "Ofcom", domain: "ofcom.org.uk", url: "https://www.ofcom.org.uk/" }],
      gsc: { included: true },
      editorialEvidenceV1: {
        version: "v1",
        originalContribution: "UK evening congestion checklist.",
        readerBenefit: "Isolate home Wi-Fi issues faster.",
        missingEvidenceNotes: "Need first-party verification later.",
        entries: [],
      },
    },
    ...overrides,
  };
}

function sampleArticle() {
  return {
    title: "Fix UK IPTV buffering without guesswork",
    excerpt: "A practical UK checklist to isolate home-network buffering causes.",
    html: "<h2>Start with the local network</h2><p>Check whether other devices on the same Wi-Fi also struggle during peak evening hours before changing service settings.</p>",
  };
}

function previewFor(planning: SeoPlanningDraft): PrivateArticlePreview {
  const eligible = evaluateNewBlogArticleEligibility(planning, { status: "skipped" });
  assert.equal(eligible.ok, true);
  if (!eligible.ok) throw new Error("ineligible fixture");
  const article = sampleArticle();
  return {
    spec: SEO_AI_ARTICLE_GENERATION_SPEC,
    planningDraftId: planning.id,
    planningUpdatedAt: planning.updatedAt,
    recommendation: "NEW_BLOG",
    writingFingerprint: eligible.fingerprint,
    model: "gpt-blog-article-test",
    article,
    evidenceTrust: {
      firstPartySiteFacts: "none_attested",
      editorialEvidence: "editorial_unverified",
      externalReferences: "unverified",
      aiProse: "ai_generated_untrusted",
      evidencePackComplete: false,
      publicationReady: false,
    },
    requiresHumanFactualReview: true,
    publicationReady: false,
    privatePreview: true,
  };
}

function actor(): TrustedPrivateApplyActor {
  return { adminId: "admin_trusted_1", hasSeoPermission: true, hasBlogPermission: true };
}

function contentHash(article: { title: string; excerpt: string; html: string }) {
  const normalized = normalizeGeneratedArticle(article);
  assert.ok(normalized);
  return fingerprintPrivateApplyContent(normalized!);
}

async function seedAdmin(pool: Pool) {
  await exec(
    pool,
    `INSERT INTO admin_users (
      id, username, display_name, password_hash, role, permissions, is_active, session_version
    ) VALUES (?, ?, ?, ?, 'custom', ?, 1, 1)`,
    [
      "admin_trusted_1",
      "a2_mysql_admin",
      "A2 MySQL Admin",
      "not-a-real-hash",
      JSON.stringify({ seo: true, blog: true }),
    ],
  );
}

async function seedPlanning(pool: Pool, planning: SeoPlanningDraft) {
  await exec(
    pool,
    `INSERT INTO seo_planning_drafts (
      id, recommendation, workflow_status, fingerprint, topic, working_title,
      proposed_slug, target_post_id, matched_public_url, restore_path, search_intent,
      linked_post_id, created_by, payload, archived_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, NULL, '', '', ?,
      ?, ?, ?, NULL, ?, ?
    )`,
    [
      planning.id,
      planning.recommendation,
      planning.workflowStatus,
      planning.fingerprint,
      planning.topic,
      planning.workingTitle,
      planning.proposedSlug,
      planning.searchIntent,
      planning.linkedPostId,
      planning.createdBy,
      JSON.stringify(planning.payload),
      toMysqlDateTime(planning.createdAt),
      toMysqlDateTime(planning.updatedAt),
    ],
  );
}

async function seedPreviewApproval(
  pool: Pool,
  planning: SeoPlanningDraft,
  preview: PrivateArticlePreview,
  overrides: { expiresAt?: string | null; previewSessionId?: string; receiptId?: string } = {},
) {
  const hash = contentHash(preview.article);
  const previewSessionId = overrides.previewSessionId || "preview_a2_mysql_1";
  const receiptId = overrides.receiptId || "approval_a2_mysql_1";
  await exec(
    pool,
    `INSERT INTO ${A2_APPLY_PREVIEW_TABLE} (
      preview_session_id, planning_draft_id, planning_updated_at, writing_fingerprint,
      content_fingerprint, generation_id, model, title, excerpt, html,
      created_at, expires_at, invalidated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      previewSessionId,
      planning.id,
      toMysqlDateTime(planning.updatedAt),
      preview.writingFingerprint,
      hash,
      "generation_a2_mysql_1",
      preview.model,
      preview.article.title,
      preview.article.excerpt,
      preview.article.html,
      toMysqlDateTime(planning.createdAt),
      overrides.expiresAt === undefined ? null : overrides.expiresAt,
    ],
  );
  await exec(
    pool,
    `INSERT INTO ${A2_APPLY_APPROVAL_TABLE} (
      receipt_id, preview_session_id, planning_draft_id, planning_updated_at,
      writing_fingerprint, content_fingerprint, approved_by_admin_id,
      factual_review_confirmed, approved_at, expires_at, revoked
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0)`,
    [
      receiptId,
      previewSessionId,
      planning.id,
      toMysqlDateTime(planning.updatedAt),
      preview.writingFingerprint,
      hash,
      "admin_trusted_1",
      toMysqlDateTime(planning.createdAt),
      overrides.expiresAt === undefined ? null : overrides.expiresAt,
    ],
  );
  return { hash, previewSessionId, receiptId };
}

let pool: Pool;
let mysqlVersion = "";

test("STATIC_ONLY: production Apply gate remains OFF; durable DDL unregistered", () => {
  assert.equal(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED, false);
  assert.equal(A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE, false);
  assert.equal(A2_APPLY_DURABLE_DDL_STATEMENTS.length, 3);
});

test("REAL_MYSQL_TRANSACTION: 0 isolation identity + disposable schema bootstrap", async () => {
  pool = createPool();
  mysqlVersion = await assertIsolationIdentity(pool);
  assert.match(mysqlVersion, /^8\.0\.46/);
  await wipeTestOwnedTables(pool);
  await applyIsolatedSchema(pool);

  const tables = await q(
    pool,
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
  );
  const names = tables.map((t) => String(t.name));
  assert.ok(names.includes("admin_users"));
  assert.ok(names.includes("blog_posts"));
  assert.ok(names.includes("seo_planning_drafts"));
  assert.ok(names.includes(A2_APPLY_PREVIEW_TABLE));
  assert.ok(names.includes(A2_APPLY_APPROVAL_TABLE));
  assert.ok(names.includes(A2_APPLY_AUDIT_TABLE));

  const auditPk = await q(
    pool,
    `SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
    [A2_APPLY_AUDIT_TABLE],
  );
  assert.equal(String(auditPk[0]?.name), "apply_operation_key");
});

test("REAL_MYSQL_TRANSACTION: A successful private CREATE commits and reads back draft-only", async () => {
  await wipeTestOwnedTables(pool);
  await applyIsolatedSchema(pool);
  await seedAdmin(pool);

  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  await seedPlanning(pool, planning);
  const seed = await seedPreviewApproval(pool, planning, preview);
  const trusted = trustedDraftingReady();
  const facade = createRealFacade(pool);
  const deps = createInactiveMysqlCmsApplyDeps({
    facade,
    physicalSchemaPresent: true,
    trustedEvidencePack: trusted,
    buildOperationKey: ({ planningDraftId, previewSessionId, contentFingerprint }) =>
      `op:${planningDraftId}:${previewSessionId}:${contentFingerprint}`,
  });

  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: seed.previewSessionId,
    approvalReceiptId: seed.receiptId,
    actor: actor(),
    previewStore: deps.previewStore,
    approvalStore: deps.approvalStore,
    transaction: deps.transaction,
    trustedEvidencePack: trusted,
    createIdFn: () => "post_a2_mysql_created",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.outcome, "created");
  assert.equal(result.status, "draft");
  assert.equal(result.publishedAt, null);
  assert.equal(result.publicationReady, false);
  assert.equal(result.realCmsWrite, false);

  const posts = await q(pool, `SELECT id, status, published_at, content FROM blog_posts WHERE id = ?`, [
    "post_a2_mysql_created",
  ]);
  assert.equal(posts.length, 1);
  assert.equal(String(posts[0].status), "draft");
  assert.equal(posts[0].published_at, null);
  assert.match(String(posts[0].content), /local network/i);

  const linked = await q(pool, `SELECT linked_post_id FROM seo_planning_drafts WHERE id = ?`, [
    planning.id,
  ]);
  assert.equal(String(linked[0].linked_post_id), "post_a2_mysql_created");

  const audits = await q(
    pool,
    `SELECT apply_operation_key, outcome, publication_ready FROM ${A2_APPLY_AUDIT_TABLE}`,
  );
  assert.equal(audits.length, 1);
  assert.equal(String(audits[0].outcome), "created");
  assert.equal(Number(audits[0].publication_ready), 0);
  assert.equal(facade.openTxns, 0);
  assert.ok(facade.peakOpenTxns >= 1);
});

test("REAL_MYSQL_CONSTRAINT: idempotent retry on linked matching draft is noop; audit PK rejects dup key", async () => {
  await wipeTestOwnedTables(pool);
  await applyIsolatedSchema(pool);
  await seedAdmin(pool);

  // Already-applied state (same pattern as offline durable IDEMPOTENT): linked shell
  // with matching content. Create-then-retry without refreshing provenance is correctly
  // rejected as stale_planning because linkPlanning bumps Planning.updated_at.
  const article = sampleArticle();
  const planning = draft({ linkedPostId: "post_a2_mysql_idem" });
  const preview = previewFor(planning);
  await seedPlanning(pool, planning);
  await exec(
    pool,
    `INSERT INTO blog_posts (
      id, title, slug, excerpt, content, category_id, featured_image, status, featured,
      published_at, seo_title, seo_description, focus_keyword, canonical_url,
      robots_index, robots_follow, og_title, og_description, og_image, sitemap_include
    ) VALUES (?, ?, ?, ?, ?, NULL, 'null', 'draft', 0, NULL, '', '', '', '', 1, 1, '', '', 'null', 1)`,
    [
      "post_a2_mysql_idem",
      article.title,
      planning.proposedSlug,
      article.excerpt,
      article.html,
    ],
  );
  const seed = await seedPreviewApproval(pool, planning, preview);
  const trusted = trustedDraftingReady();
  const facade = createRealFacade(pool);
  const deps = createInactiveMysqlCmsApplyDeps({
    facade,
    physicalSchemaPresent: true,
    trustedEvidencePack: trusted,
  });

  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: seed.previewSessionId,
    approvalReceiptId: seed.receiptId,
    actor: actor(),
    previewStore: deps.previewStore,
    approvalStore: deps.approvalStore,
    transaction: deps.transaction,
    trustedEvidencePack: trusted,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.outcome, "noop");
  assert.equal(result.simulatedCmsWrite, false);

  const posts = await q(pool, `SELECT id, content FROM blog_posts`);
  assert.equal(posts.length, 1);
  assert.equal(String(posts[0].id), "post_a2_mysql_idem");
  assert.equal(String(posts[0].content), article.html);

  const audits = await q(
    pool,
    `SELECT apply_operation_key, outcome FROM ${A2_APPLY_AUDIT_TABLE}`,
  );
  assert.equal(audits.length, 1);
  assert.equal(String(audits[0].outcome), "noop");

  // Real MySQL PRIMARY KEY on apply_operation_key.
  await assert.rejects(
    () =>
      exec(
        pool,
        `INSERT INTO ${A2_APPLY_AUDIT_TABLE} (
          apply_operation_key, planning_draft_id, post_id, preview_session_id,
          approval_receipt_id, generation_id, admin_id, writing_fingerprint,
          content_fingerprint, outcome, result_code, detail, publication_ready, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'noop', NULL, 'dup', 0, UTC_TIMESTAMP())`,
        [
          String(audits[0].apply_operation_key),
          planning.id,
          "post_a2_mysql_idem",
          seed.previewSessionId,
          seed.receiptId,
          "generation_a2_mysql_1",
          "admin_trusted_1",
          preview.writingFingerprint,
          seed.hash,
        ],
      ),
    /Duplicate|ER_DUP_ENTRY/i,
  );
});

test("REAL_MYSQL_CONCURRENT: two simultaneous Creates yield one Blog draft", async () => {
  await wipeTestOwnedTables(pool);
  await applyIsolatedSchema(pool);
  await seedAdmin(pool);

  const planning = draft({ linkedPostId: null, proposedSlug: "uk-iptv-buffering-concurrent-a2" });
  const preview = previewFor(planning);
  await seedPlanning(pool, planning);
  const seed = await seedPreviewApproval(pool, planning, preview);
  const trusted = trustedDraftingReady();
  const facade = createRealFacade(pool);
  const deps = createInactiveMysqlCmsApplyDeps({
    facade,
    physicalSchemaPresent: true,
    trustedEvidencePack: trusted,
  });
  let n = 0;
  const [a, b] = await Promise.all([
    applyPrivateArticleViaCmsAdapter({
      clientPreview: preview,
      previewSessionId: seed.previewSessionId,
      approvalReceiptId: seed.receiptId,
      actor: actor(),
      previewStore: deps.previewStore,
      approvalStore: deps.approvalStore,
      transaction: deps.transaction,
      trustedEvidencePack: trusted,
      createIdFn: () => `post_race_${++n}`,
    }),
    applyPrivateArticleViaCmsAdapter({
      clientPreview: preview,
      previewSessionId: seed.previewSessionId,
      approvalReceiptId: seed.receiptId,
      actor: actor(),
      previewStore: deps.previewStore,
      approvalStore: deps.approvalStore,
      transaction: deps.transaction,
      trustedEvidencePack: trusted,
      createIdFn: () => `post_race_${++n}`,
    }),
  ]);
  const created = [a, b].filter((r) => r.ok && r.outcome === "created");
  assert.equal(created.length, 1);
  const posts = await q(pool, `SELECT id FROM blog_posts`);
  assert.equal(posts.length, 1);
  assert.ok(facade.peakOpenTxns <= 4);
  assert.equal(facade.openTxns, 0);
});

test("REAL_MYSQL_TRANSACTION: rollback after Blog insert leaves zero durable Apply state", async () => {
  await wipeTestOwnedTables(pool);
  await applyIsolatedSchema(pool);
  await seedAdmin(pool);

  const planning = draft({ linkedPostId: null, proposedSlug: "uk-iptv-buffering-rollback-a2" });
  const preview = previewFor(planning);
  await seedPlanning(pool, planning);
  const seed = await seedPreviewApproval(pool, planning, preview);
  const trusted = trustedDraftingReady();

  const base = createRealFacade(pool);
  const flaky: DurableMysqlTxnFacade = {
    queryOutsideTxn: (sql, params) => base.queryOutsideTxn(sql, params),
    async runInTransaction(work) {
      return base.runInTransaction(async (exec) => {
        const wrapped: DurableMysqlExecutor = {
          query: (sql, params) => exec.query(sql, params),
          async execute(sql, params) {
            const result = await exec.execute(sql, params);
            if (String(sql).startsWith("INSERT INTO blog_posts")) {
              throw new Error("Injected blog failure after uncommitted insert");
            }
            return result;
          },
        };
        return work(wrapped);
      });
    },
  };

  const deps = createInactiveMysqlCmsApplyDeps({
    facade: flaky,
    physicalSchemaPresent: true,
    trustedEvidencePack: trusted,
  });
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: seed.previewSessionId,
    approvalReceiptId: seed.receiptId,
    actor: actor(),
    previewStore: deps.previewStore,
    approvalStore: deps.approvalStore,
    transaction: deps.transaction,
    trustedEvidencePack: trusted,
    createIdFn: () => "post_should_rollback",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.committed, false);
    assert.equal(result.code, "transaction_failed");
  }
  assert.equal((await q(pool, `SELECT id FROM blog_posts`)).length, 0);
  assert.equal((await q(pool, `SELECT apply_operation_key FROM ${A2_APPLY_AUDIT_TABLE}`)).length, 0);
  const linked = await q(pool, `SELECT linked_post_id FROM seo_planning_drafts WHERE id = ?`, [
    planning.id,
  ]);
  assert.equal(linked[0].linked_post_id, null);
});

test("REAL_MYSQL_TRANSACTION: evidence negatives create zero Blog/audit rows", async () => {
  await wipeTestOwnedTables(pool);
  await applyIsolatedSchema(pool);
  await seedAdmin(pool);

  const planning = draft({ linkedPostId: null, proposedSlug: "uk-iptv-buffering-evidence-a2" });
  const preview = previewFor(planning);
  await seedPlanning(pool, planning);
  const seed = await seedPreviewApproval(pool, planning, preview);
  const facade = createRealFacade(pool);

  const cases: Array<{
    label: string;
    trustedEvidencePack?: unknown;
    evidencePackStatus?: unknown;
    expect: string;
  }> = [
    { label: "omitted", expect: "evidence_pack_unavailable" },
    { label: "ABSENT", evidencePackStatus: "ABSENT", expect: "evidence_pack_unavailable" },
    {
      label: "forged READY string",
      evidencePackStatus: "READY_FOR_DRAFTING_REVIEW",
      expect: "untrusted_evidence_pack_claim",
    },
    {
      label: "plain-object seal",
      trustedEvidencePack: {
        spec: "a2-article-evidence-pack-adapter-v1",
        draftingReviewStatus: "READY_FOR_DRAFTING_REVIEW",
        applyEvidenceGate: "PASS_DRAFTING_REVIEW_ONLY",
        authorizeApply: false,
        authorizePublish: false,
        publicationReady: false,
        evidencePackComplete: false,
      },
      expect: "untrusted_evidence_pack_claim",
    },
    { label: "H3B HOLD", trustedEvidencePack: trustedEvidenceHold(), expect: "evidence_pack_hold" },
    {
      label: "malformed pack",
      trustedEvidencePack: assessArticleEvidencePackForApply({} as never),
      expect: "evidence_pack_hold",
    },
  ];

  for (const c of cases) {
    const deps = createInactiveMysqlCmsApplyDeps({
      facade,
      physicalSchemaPresent: true,
      trustedEvidencePack: c.trustedEvidencePack,
      evidencePackStatus: c.evidencePackStatus as never,
    });
    const result = await applyPrivateArticleViaCmsAdapter({
      clientPreview: preview,
      previewSessionId: seed.previewSessionId,
      approvalReceiptId: seed.receiptId,
      actor: actor(),
      previewStore: deps.previewStore,
      approvalStore: deps.approvalStore,
      transaction: deps.transaction,
      trustedEvidencePack: c.trustedEvidencePack,
      evidencePackStatus: c.evidencePackStatus as never,
      createIdFn: () => `post_evidence_${c.label.replace(/\s+/g, "_")}`,
    });
    assert.equal(result.ok, false, c.label);
    if (!result.ok) assert.equal(result.code, c.expect, c.label);
  }

  assert.equal((await q(pool, `SELECT id FROM blog_posts`)).length, 0);
  assert.equal((await q(pool, `SELECT apply_operation_key FROM ${A2_APPLY_AUDIT_TABLE}`)).length, 0);
});

test("REAL_MYSQL_TRANSACTION: stale Planning / expired approval / write-freeze reject without writes", async () => {
  await wipeTestOwnedTables(pool);
  await applyIsolatedSchema(pool);
  await seedAdmin(pool);

  const planning = draft({ linkedPostId: null, proposedSlug: "uk-iptv-buffering-stale-a2" });
  const preview = previewFor(planning);
  await seedPlanning(pool, {
    ...planning,
    updatedAt: "2026-10-09T00:00:00.000Z",
  });
  // Provenance still bound to original preview.updatedAt → stale_planning inside txn.
  const seed = await seedPreviewApproval(pool, planning, preview);
  const trusted = trustedDraftingReady();
  const facade = createRealFacade(pool);
  const deps = createInactiveMysqlCmsApplyDeps({
    facade,
    physicalSchemaPresent: true,
    trustedEvidencePack: trusted,
  });

  const stale = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: seed.previewSessionId,
    approvalReceiptId: seed.receiptId,
    actor: actor(),
    previewStore: deps.previewStore,
    approvalStore: deps.approvalStore,
    transaction: deps.transaction,
    trustedEvidencePack: trusted,
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "stale_planning");

  await wipeTestOwnedTables(pool);
  await applyIsolatedSchema(pool);
  await seedAdmin(pool);
  const planning2 = draft({
    id: "seoplan_a2_mysql_exp",
    linkedPostId: null,
    proposedSlug: "uk-iptv-buffering-expired-a2",
    fingerprint: "NEW_BLOG:a2-mysql-expired",
  });
  const preview2 = previewFor(planning2);
  await seedPlanning(pool, planning2);
  const seed2 = await seedPreviewApproval(pool, planning2, preview2, {
    expiresAt: "2020-01-01 00:00:00",
  });
  const deps2 = createInactiveMysqlCmsApplyDeps({
    facade,
    physicalSchemaPresent: true,
    trustedEvidencePack: trusted,
  });
  const expired = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview2,
    previewSessionId: seed2.previewSessionId,
    approvalReceiptId: seed2.receiptId,
    actor: actor(),
    previewStore: deps2.previewStore,
    approvalStore: deps2.approvalStore,
    transaction: deps2.transaction,
    trustedEvidencePack: trusted,
    now: "2026-10-21T12:00:00.000Z",
  });
  assert.equal(expired.ok, false);
  if (!expired.ok) {
    assert.ok(
      expired.code === "approval_revoked" || expired.code === "preview_provenance_expired",
      expired.code,
    );
  }

  const frozen = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview2,
    previewSessionId: seed2.previewSessionId,
    approvalReceiptId: seed2.receiptId,
    actor: actor(),
    previewStore: deps2.previewStore,
    approvalStore: deps2.approvalStore,
    transaction: deps2.transaction,
    trustedEvidencePack: trusted,
    writeFreezeEnv: { CMS_WRITE_FREEZE: "1" },
  });
  assert.equal(frozen.ok, false);
  if (!frozen.ok) assert.equal(frozen.code, "cms_write_freeze");

  assert.equal((await q(pool, `SELECT id FROM blog_posts`)).length, 0);
  assert.equal((await q(pool, `SELECT apply_operation_key FROM ${A2_APPLY_AUDIT_TABLE}`)).length, 0);
});

test("REAL_MYSQL_TRANSACTION: cleanup drops only test-owned tables in disposable A2 DB", async () => {
  await wipeTestOwnedTables(pool);
  const tables = await q(
    pool,
    `SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  );
  assert.equal(tables.length, 0);
  await pool.end();
});
