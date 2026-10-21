/**
 * Junaid Editorial Evidence Capture UI + safe persistence + readiness checklist.
 * Local only — no live MySQL, OpenAI, Gemini, GSC, or Hostinger.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { JsonCatalogRepository } from "../lib/cms/json-catalog";
import { createHash } from "node:crypto";
import {
  canonicalizeEditorialEvidenceForRevision,
  fingerprintEditorialEvidence,
  fingerprintEditorialEvidenceFromPayload,
  hasSeoPlanningEditorialEvidenceContent,
  isSeoPlanningEditorialEvidenceRevisionToken,
  mergeEditorialEvidenceIntoPayload,
  parseSeoPlanningEditorialEvidence,
  parseSeoPlanningEditorialEvidenceSaveInput,
  preserveLockedEditorialEvidenceInPayload,
  readSeoPlanningEditorialEvidence,
  sha256Utf8Hex,
  SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS,
  SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY,
  SEO_PLANNING_EDITORIAL_EVIDENCE_REVISION_PREFIX,
  SEO_PLANNING_EDITORIAL_TRUST,
} from "../lib/cms/seo-planning/editorial-evidence";
import { applySeoPlanningWorkspaceUpdate } from "../lib/cms/seo-planning/workspace";
import { applySeoPlanningSuggestionCommand } from "../lib/cms/seo-planning/suggestions";
import { buildWritingPromptCacheEntry } from "../lib/cms/seo-planning/writing-prompt-cache";
import { buildImagePromptCacheEntry } from "../lib/cms/seo-planning/image-prompt-cache";
import { buildSeoPlanningEditorialReadinessChecklist } from "../lib/cms/seo-planning/editorial-readiness";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import type { SeoPlanningDraft } from "../lib/cms/types";
import { isCmsWriteFreezeActive } from "../lib/cms/write-freeze";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(vars)) {
    previous.set(key, process.env[key]);
    const next = vars[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function baseDraft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_ee_1",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:ee-demo",
    topic: "Editorial evidence topic",
    workingTitle: "Editorial evidence title",
    proposedSlug: "editorial-evidence-topic",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "INFORMATIONAL",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T01:00:00.000Z",
    payload: {
      opportunity: {
        whyNow: "Readers need clarity.",
        webEvidence: "Snapshot evidence",
        suggestedAngle: "Practical UK angle",
        nextStep: "Draft outline",
        confidence: "MEDIUM",
        gscEvidence: [],
      },
      sources: [{ title: "Source", url: "https://example.com/a", domain: "example.com" }],
      gsc: { status: "AVAILABLE", statusLabel: "Available" },
      workspace: { humanNotes: "Keep private" },
      researchSnapshot: { frozen: true, mark: "original-research" },
    },
    ...overrides,
  };
}

function sampleEvidence(entryCount = 1) {
  const entries = Array.from({ length: entryCount }, (_, i) => ({
    id: `ee_${i + 1}`,
    evidenceType: "EXTERNAL_REFERENCE" as const,
    claim: `Claim ${i + 1}`,
    url: `https://example.com/evidence/${i + 1}`,
    location: `Section ${i + 1}`,
    notes: `Note ${i + 1}`,
    trust: "VERIFIED_SPOOF" as string,
  }));
  return {
    version: "v1",
    originalContribution: "Original UK contribution",
    readerBenefit: "Helps readers fix setup",
    missingEvidenceNotes: "",
    entries,
  };
}

test("parse: trust always EDITORIAL_UNVERIFIED; spoof ignored", () => {
  const parsed = parseSeoPlanningEditorialEvidence(sampleEvidence(1));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.entries[0]?.trust, SEO_PLANNING_EDITORIAL_TRUST);
  assert.equal(SEO_PLANNING_EDITORIAL_TRUST, "EDITORIAL_UNVERIFIED");
});

test("parse: rejects more than five entries", () => {
  const parsed = parseSeoPlanningEditorialEvidence(sampleEvidence(6));
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.match(parsed.error, /At most 5/);
});

test("parse: rejects unsafe and credential URLs", () => {
  const javascript = parseSeoPlanningEditorialEvidence({
    ...sampleEvidence(0),
    entries: [
      {
        id: "ee_1",
        evidenceType: "EXTERNAL_REFERENCE",
        claim: "Bad url",
        url: "javascript:alert(1)",
        location: "",
        notes: "",
      },
    ],
  });
  assert.equal(javascript.ok, false);

  const creds = parseSeoPlanningEditorialEvidence({
    ...sampleEvidence(0),
    entries: [
      {
        id: "ee_1",
        evidenceType: "EXTERNAL_REFERENCE",
        claim: "Cred url",
        url: "https://user:pass@example.com/x",
        location: "",
        notes: "",
      },
    ],
  });
  assert.equal(creds.ok, false);

  const missing = parseSeoPlanningEditorialEvidence({
    ...sampleEvidence(0),
    entries: [
      {
        id: "ee_1",
        evidenceType: "EXTERNAL_REFERENCE",
        claim: "No url",
        url: "",
        location: "",
        notes: "",
      },
    ],
  });
  assert.equal(missing.ok, false);
});

test("parse: rejects malformed entries", () => {
  const bad = parseSeoPlanningEditorialEvidence({
    originalContribution: "x",
    readerBenefit: "",
    missingEvidenceNotes: "",
    entries: ["not-an-object"],
  });
  assert.equal(bad.ok, false);

  const badType = parseSeoPlanningEditorialEvidence({
    originalContribution: "",
    readerBenefit: "",
    missingEvidenceNotes: "",
    entries: [{ evidenceType: "MADE_UP", claim: "x", url: "", location: "", notes: "" }],
  });
  assert.equal(badType.ok, false);
});

test("merge: preserves unrelated payload; clear removes key", () => {
  const parsed = parseSeoPlanningEditorialEvidence(sampleEvidence(1));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const base = {
    opportunity: { whyNow: "keep" },
    gsc: { status: "AVAILABLE" },
    workspace: { humanNotes: "notes" },
    writingPrompts: { openai: { chatgptPrompt: "sibling" } },
    researchSnapshot: { frozen: true },
  };
  const merged = mergeEditorialEvidenceIntoPayload(base, parsed.value);
  assert.equal(merged.opportunity, base.opportunity);
  assert.equal(merged.gsc, base.gsc);
  assert.equal(merged.workspace, base.workspace);
  assert.equal(merged.writingPrompts, base.writingPrompts);
  assert.equal(merged.researchSnapshot, base.researchSnapshot);
  assert.ok(merged[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY]);

  const cleared = mergeEditorialEvidenceIntoPayload(merged, null);
  assert.equal(cleared[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY], undefined);
  assert.equal(cleared.researchSnapshot, base.researchSnapshot);
});

test("revision: SHA-256 matches Node crypto; no FNV; stable; material change differs", () => {
  assert.equal(
    sha256Utf8Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    sha256Utf8Hex("abc"),
    createHash("sha256").update("abc", "utf8").digest("hex"),
  );

  const a = parseSeoPlanningEditorialEvidence(sampleEvidence(1));
  const b = parseSeoPlanningEditorialEvidence(sampleEvidence(1));
  assert.equal(a.ok && b.ok, true);
  if (!a.ok || !b.ok) return;

  const fa = fingerprintEditorialEvidence(a.value);
  const fb = fingerprintEditorialEvidence(b.value);
  assert.equal(fa, fb);
  assert.ok(fa.startsWith(SEO_PLANNING_EDITORIAL_EVIDENCE_REVISION_PREFIX));
  assert.equal(isSeoPlanningEditorialEvidenceRevisionToken(fa), true);
  assert.equal(
    fa,
    `${SEO_PLANNING_EDITORIAL_EVIDENCE_REVISION_PREFIX}${sha256Utf8Hex(
      canonicalizeEditorialEvidenceForRevision(a.value),
    )}`,
  );
  assert.equal(
    sha256Utf8Hex(canonicalizeEditorialEvidenceForRevision(a.value)),
    createHash("sha256")
      .update(canonicalizeEditorialEvidenceForRevision(a.value), "utf8")
      .digest("hex"),
  );

  // Object-key reordering of a raw client blob must not fork revision after parse.
  const reordered = parseSeoPlanningEditorialEvidence({
    entries: a.value.entries.map((e) => ({
      notes: e.notes,
      url: e.url,
      claim: e.claim,
      location: e.location,
      evidenceType: e.evidenceType,
      id: e.id,
      trust: "VERIFIED_SPOOF",
    })),
    missingEvidenceNotes: a.value.missingEvidenceNotes,
    readerBenefit: a.value.readerBenefit,
    originalContribution: a.value.originalContribution,
    version: "v1",
  });
  assert.equal(reordered.ok, true);
  if (!reordered.ok) return;
  assert.equal(fingerprintEditorialEvidence(reordered.value), fa);

  const edited = { ...a.value, originalContribution: "Changed contribution" };
  assert.notEqual(fingerprintEditorialEvidence(edited), fa);

  // Absent / empty / cleared all share the empty revision.
  const emptyA = fingerprintEditorialEvidenceFromPayload({});
  const emptyB = fingerprintEditorialEvidenceFromPayload({
    editorialEvidenceV1: {
      version: "v1",
      originalContribution: "",
      readerBenefit: "",
      missingEvidenceNotes: "",
      entries: [],
    },
  });
  assert.equal(emptyA, emptyB);
  assert.equal(isSeoPlanningEditorialEvidenceRevisionToken(emptyA), true);

  // No FNV residue in source.
  const src = read("lib/cms/seo-planning/editorial-evidence.ts");
  assert.doesNotMatch(src, /FNV|fnv|0xcbf29ce484222325/);
  assert.match(src, /sha256Utf8Hex|SHA-256/);
});

test("save input: clear + valid SHA-256 revision; reject arbitrary tokens", () => {
  const missingRev = parseSeoPlanningEditorialEvidenceSaveInput({
    id: "seoplan_ee_1",
    evidence: sampleEvidence(1),
  });
  assert.equal(missingRev.ok, false);

  const badToken = parseSeoPlanningEditorialEvidenceSaveInput({
    id: "seoplan_ee_1",
    expectedEvidenceRevision: "eev1_abc",
    clear: true,
  });
  assert.equal(badToken.ok, false);

  const fnvLegacy = parseSeoPlanningEditorialEvidenceSaveInput({
    id: "seoplan_ee_1",
    expectedEvidenceRevision: "eev1_deadbeefdeadbeef",
    clear: true,
  });
  assert.equal(fnvLegacy.ok, false);

  const emptyRev = fingerprintEditorialEvidenceFromPayload({});
  const clear = parseSeoPlanningEditorialEvidenceSaveInput({
    id: "seoplan_ee_1",
    expectedEvidenceRevision: emptyRev,
    clear: true,
  });
  assert.equal(clear.ok, true);
  if (!clear.ok) return;
  assert.equal(clear.value.evidence, null);

  const save = parseSeoPlanningEditorialEvidenceSaveInput({
    id: "seoplan_ee_1",
    expectedEvidenceRevision: emptyRev,
    evidence: sampleEvidence(2),
  });
  assert.equal(save.ok, true);
  if (!save.ok) return;
  assert.equal(save.value.evidence?.entries.length, 2);
  assert.equal(save.value.evidence?.entries[0]?.trust, SEO_PLANNING_EDITORIAL_TRUST);
});

test("JSON catalog: create/save/load/reload + clear + stale concurrent + archive + siblings", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ee-ui-"));
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    const cms = new JsonCatalogRepository();
    const draft = baseDraft();
    await cms.saveSeoPlanningDraft(draft);

    const emptyRev = fingerprintEditorialEvidenceFromPayload(draft.payload);
    const parsed = parseSeoPlanningEditorialEvidence(sampleEvidence(2));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const saved = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: emptyRev,
      evidence: parsed.value,
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;

    const reloaded = await cms.getSeoPlanningDraftById(draft.id);
    assert.ok(reloaded);
    const loaded = readSeoPlanningEditorialEvidence(reloaded!.payload);
    assert.equal(hasSeoPlanningEditorialEvidenceContent(loaded), true);
    assert.equal(loaded.entries.length, 2);
    assert.equal(loaded.entries[0]?.trust, SEO_PLANNING_EDITORIAL_TRUST);
    assert.equal((reloaded!.payload.researchSnapshot as { mark: string }).mark, "original-research");
    assert.equal((reloaded!.payload.workspace as { humanNotes: string }).humanNotes, "Keep private");
    assert.equal(reloaded!.recommendation, "NEW_BLOG");
    assert.equal(reloaded!.workflowStatus, "CONTENT_NEEDED");
    assert.equal(reloaded!.fingerprint, draft.fingerprint);
    assert.equal(reloaded!.linkedPostId, null);

    // Concurrent stale: second writer uses original empty revision.
    const stale = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: emptyRev,
      evidence: parsed.value,
    });
    assert.equal(stale.ok, false);
    if (stale.ok) return;
    assert.equal(stale.reason, "stale");

    // Edit with correct revision.
    const currentRev = fingerprintEditorialEvidenceFromPayload(reloaded!.payload);
    const editedParsed = parseSeoPlanningEditorialEvidence({
      ...sampleEvidence(1),
      originalContribution: "Updated contribution",
      missingEvidenceNotes: "Need primary source",
    });
    assert.equal(editedParsed.ok, true);
    if (!editedParsed.ok) return;
    const edited = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: currentRev,
      evidence: editedParsed.value,
    });
    assert.equal(edited.ok, true);
    if (!edited.ok) return;
    assert.equal(
      readSeoPlanningEditorialEvidence(edited.draft.payload).originalContribution,
      "Updated contribution",
    );

    // Explicit clear.
    const clearRev = fingerprintEditorialEvidenceFromPayload(edited.draft.payload);
    const cleared = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: clearRev,
      evidence: null,
    });
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal(
      cleared.draft.payload[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY],
      undefined,
    );
    assert.equal(
      hasSeoPlanningEditorialEvidenceContent(
        readSeoPlanningEditorialEvidence(cleared.draft.payload),
      ),
      false,
    );

    // Archive during save boundary.
    const archived = await cms.archiveSeoPlanningDraft(draft.id);
    assert.equal(archived.ok, true);
    const afterArchive = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: fingerprintEditorialEvidenceFromPayload(
        cleared.draft.payload,
      ),
      evidence: parsed.value,
    });
    assert.equal(afterArchive.ok, false);
    if (afterArchive.ok) return;
    assert.equal(afterArchive.reason, "archived");
  } finally {
    process.chdir(previousCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JSON catalog: immutable / not found reasons", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ee-ui-immut-"));
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    const cms = new JsonCatalogRepository();
    await cms.saveSeoPlanningDraft(
      baseDraft({ id: "seoplan_ee_ok", fingerprint: "NEW_BLOG:ee-ok" }),
    );
    const missing = await cms.mergeSeoPlanningEditorialEvidence({
      id: "missing",
      expectedEvidenceRevision: fingerprintEditorialEvidenceFromPayload({}),
      evidence: null,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.reason, "not_found");

    // Invalid revision format rejected without mutation.
    const badFmt = await cms.mergeSeoPlanningEditorialEvidence({
      id: "seoplan_ee_ok",
      expectedEvidenceRevision: "not-a-sha256-token",
      evidence: null,
    });
    assert.equal(badFmt.ok, false);
    if (!badFmt.ok) assert.equal(badFmt.reason, "rejected");

    // SKIP is not actionable — sanitize keeps the recommendation string.
    await cms.saveSeoPlanningDraft(
      baseDraft({
        id: "seoplan_ee_skip",
        recommendation: "SKIP",
        fingerprint: "SKIP:ee-skip",
      }),
    );
    const immutable = await cms.mergeSeoPlanningEditorialEvidence({
      id: "seoplan_ee_skip",
      expectedEvidenceRevision: fingerprintEditorialEvidenceFromPayload({}),
      evidence: null,
    });
    assert.equal(immutable.ok, false);
    if (!immutable.ok) assert.equal(immutable.reason, "immutable");
  } finally {
    process.chdir(previousCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readiness checklist: HOLD / wrong recommendation / missing brief / gates", () => {
  const holdRefresh = buildSeoPlanningEditorialReadinessChecklist({
    draft: baseDraft({ recommendation: "REFRESH_EXISTING", workflowStatus: "PLANNING" }),
    aiArticleGenerationEnabled: true,
    openaiBlogArticleConfigured: true,
  });
  assert.equal(holdRefresh.aiApply, "unavailable");
  assert.equal(holdRefresh.autonomousPublishing, "OFF");
  assert.equal(holdRefresh.scheduler, "OFF");
  const a1 = holdRefresh.items.find((i) => i.id === "a1_preview");
  assert.equal(a1?.status, "hold");
  assert.match(a1?.detail || "", /REFRESH|NEW_BLOG/i);

  const missingBrief = buildSeoPlanningEditorialReadinessChecklist({
    draft: baseDraft({ workflowStatus: "PLANNING", topic: "", workingTitle: "" }),
    aiArticleGenerationEnabled: true,
    openaiBlogArticleConfigured: true,
  });
  const brief = missingBrief.items.find((i) => i.id === "writing_brief");
  assert.equal(brief?.status, "hold");

  const genOff = buildSeoPlanningEditorialReadinessChecklist({
    draft: baseDraft(),
    aiArticleGenerationEnabled: false,
    openaiBlogArticleConfigured: true,
  });
  const a1Off = genOff.items.find((i) => i.id === "a1_preview");
  assert.equal(a1Off?.status, "hold");
  assert.match(a1Off?.detail || "", /feature gate is OFF/i);

  const evidenceParsed = parseSeoPlanningEditorialEvidence(sampleEvidence(1));
  assert.equal(evidenceParsed.ok, true);
  if (!evidenceParsed.ok) return;
  const withEvidence = buildSeoPlanningEditorialReadinessChecklist({
    draft: baseDraft({
      payload: {
        ...baseDraft().payload,
        editorialEvidenceV1: evidenceParsed.value,
      },
    }),
  });
  const trust = withEvidence.items.find((i) => i.id === "editorial_evidence_trust");
  assert.equal(trust?.detail, SEO_PLANNING_EDITORIAL_TRUST);
  const presence = withEvidence.items.find((i) => i.id === "editorial_evidence_presence");
  assert.equal(presence?.status, "ok");
  assert.ok(withEvidence.notes.some((n) => /A1 Preview readiness is not A2 Apply/i.test(n)));
});

test("ordinary save preserves locked-row editorial evidence against stale workspace payload", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ee-ui-preserve-"));
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    const cms = new JsonCatalogRepository();
    const draft = baseDraft({ id: "seoplan_ee_preserve", fingerprint: "NEW_BLOG:ee-preserve" });
    await cms.saveSeoPlanningDraft(draft);

    const parsed = parseSeoPlanningEditorialEvidence(sampleEvidence(1));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const merged = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: fingerprintEditorialEvidenceFromPayload(draft.payload),
      evidence: parsed.value,
    });
    assert.equal(merged.ok, true);
    if (!merged.ok) return;

    // Stale workspace snapshot (no editorialEvidenceV1) applied then saved — must not wipe.
    const staleStored = baseDraft({
      id: draft.id,
      fingerprint: draft.fingerprint,
      payload: { ...draft.payload },
    });
    const applied = applySeoPlanningWorkspaceUpdate(staleStored, {
      id: draft.id,
      topic: "Updated topic after evidence",
      workingTitle: draft.workingTitle,
      searchIntent: "INFORMATIONAL",
      humanNotes: "workspace notes",
      workflowStatus: "CONTENT_NEEDED",
    });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;
    assert.equal(
      applied.draft.payload[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY],
      undefined,
    );

    const saved = await cms.saveSeoPlanningDraft(applied.draft);
    assert.ok(saved.payload[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY]);
    assert.equal(
      readSeoPlanningEditorialEvidence(saved.payload).entries[0]?.trust,
      SEO_PLANNING_EDITORIAL_TRUST,
    );
    assert.equal(saved.topic, "Updated topic after evidence");

    const preserved = preserveLockedEditorialEvidenceInPayload(
      merged.draft.payload,
      applied.draft.payload,
    );
    assert.ok(preserved[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY]);
  } finally {
    process.chdir(previousCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("HARDEN: cross-writer interleaving preserves evidence; concurrent/stale/clear/archive", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ee-ui-interleave-"));
  const previousCwd = process.cwd();
  process.chdir(dir);
  try {
    const cms = new JsonCatalogRepository();
    const draft = baseDraft({
      id: "seoplan_ee_interleave",
      fingerprint: "NEW_BLOG:ee-interleave",
    });
    await cms.saveSeoPlanningDraft(draft);

    const parsed = parseSeoPlanningEditorialEvidence(sampleEvidence(2));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    // 1) Evidence save then stale ordinary workspace save → latest evidence preserved.
    const emptyRev = fingerprintEditorialEvidenceFromPayload(draft.payload);
    const evSave = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: emptyRev,
      evidence: parsed.value,
    });
    assert.equal(evSave.ok, true);
    if (!evSave.ok) return;
    const evidenceRev = fingerprintEditorialEvidenceFromPayload(evSave.draft.payload);
    assert.equal(
      readSeoPlanningEditorialEvidence(evSave.draft.payload).entries.length,
      2,
    );

    const staleWorkspace = applySeoPlanningWorkspaceUpdate(
      baseDraft({
        id: draft.id,
        fingerprint: draft.fingerprint,
        payload: { ...draft.payload },
      }),
      {
        id: draft.id,
        topic: "Workspace after evidence",
        workingTitle: draft.workingTitle,
        searchIntent: "INFORMATIONAL",
        humanNotes: "from stale client",
        workflowStatus: "CONTENT_NEEDED",
      },
    );
    assert.equal(staleWorkspace.ok, true);
    if (!staleWorkspace.ok) return;
    const afterWorkspace = await cms.saveSeoPlanningDraft(staleWorkspace.draft);
    assert.equal(
      fingerprintEditorialEvidenceFromPayload(afterWorkspace.payload),
      evidenceRev,
    );
    assert.equal(afterWorkspace.topic, "Workspace after evidence");
    assert.equal(
      (afterWorkspace.payload.researchSnapshot as { mark: string }).mark,
      "original-research",
    );

    // 2) Suggestion mutation → latest evidence preserved.
    // Opportunity fixture exposes suggestedAngle/nextStep (not topic) for derivation.
    const suggestion = applySeoPlanningSuggestionCommand(afterWorkspace, {
      id: draft.id,
      key: "nextStep",
      operation: "IGNORE",
    });
    assert.equal(suggestion.ok, true);
    if (!suggestion.ok) return;
    const afterSuggestion = await cms.saveSeoPlanningDraft(suggestion.draft);
    assert.equal(
      fingerprintEditorialEvidenceFromPayload(afterSuggestion.payload),
      evidenceRev,
    );
    assert.equal(
      readSeoPlanningEditorialEvidence(afterSuggestion.payload).entries[0]?.trust,
      SEO_PLANNING_EDITORIAL_TRUST,
    );

    // 3) Writing + image cache updates → latest evidence preserved.
    const writingEntry = buildWritingPromptCacheEntry({
      chatgptPrompt: "Writing prompt body",
      writingFingerprint: "wf_test_1",
      model: "test-model",
      generatedAt: "2026-10-06T02:00:00.000Z",
    });
    const writingMerge = await cms.mergeSeoPlanningWritingPromptCache({
      id: draft.id,
      provider: "openai",
      entry: writingEntry,
      acceptLatest: () => true,
    });
    assert.equal(writingMerge.ok, true);
    if (!writingMerge.ok) return;
    assert.equal(
      fingerprintEditorialEvidenceFromPayload(writingMerge.draft.payload),
      evidenceRev,
    );

    const imageEntry = buildImagePromptCacheEntry({
      chatgptImagePrompt: "Image prompt body",
      imageFingerprint: "if_test_1",
      model: "test-image-model",
      generatedAt: "2026-10-06T02:01:00.000Z",
    });
    const imageMerge = await cms.mergeSeoPlanningImagePromptCache({
      id: draft.id,
      provider: "openai",
      entry: imageEntry,
      acceptLatest: () => true,
    });
    assert.equal(imageMerge.ok, true);
    if (!imageMerge.ok) return;
    assert.equal(
      fingerprintEditorialEvidenceFromPayload(imageMerge.draft.payload),
      evidenceRev,
    );
    assert.ok(imageMerge.draft.payload.writingPrompts);
    assert.ok(imageMerge.draft.payload.imagePrompts);

    // 4) Two concurrent evidence saves → one valid, stale rejected; no mutation after stale.
    const editorBParsed = parseSeoPlanningEditorialEvidence(sampleEvidence(1));
    assert.equal(editorBParsed.ok, true);
    if (!editorBParsed.ok) return;
    const editorBStale = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: emptyRev,
      evidence: editorBParsed.value,
    });
    assert.equal(editorBStale.ok, false);
    if (!editorBStale.ok) assert.equal(editorBStale.reason, "stale");
    const mid = await cms.getSeoPlanningDraftById(draft.id);
    assert.equal(fingerprintEditorialEvidenceFromPayload(mid!.payload), evidenceRev);

    const editedParsed = parseSeoPlanningEditorialEvidence({
      ...sampleEvidence(1),
      originalContribution: "Editor A second save",
    });
    assert.equal(editedParsed.ok, true);
    if (!editedParsed.ok) return;
    const editorAOk = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: evidenceRev,
      evidence: editedParsed.value,
    });
    assert.equal(editorAOk.ok, true);
    if (!editorAOk.ok) return;
    const afterA = fingerprintEditorialEvidenceFromPayload(editorAOk.draft.payload);
    assert.notEqual(afterA, evidenceRev);
    assert.equal(
      readSeoPlanningEditorialEvidence(editorAOk.draft.payload).originalContribution,
      "Editor A second save",
    );

    // Stale explicit clear rejected; no mutation.
    const staleClear = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: evidenceRev,
      evidence: null,
    });
    assert.equal(staleClear.ok, false);
    if (!staleClear.ok) assert.equal(staleClear.reason, "stale");
    assert.equal(
      fingerprintEditorialEvidenceFromPayload(
        (await cms.getSeoPlanningDraftById(draft.id))!.payload,
      ),
      afterA,
    );

    // 6) Valid clear with current revision.
    const cleared = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: afterA,
      evidence: null,
    });
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal(cleared.draft.payload[SEO_PLANNING_EDITORIAL_EVIDENCE_PAYLOAD_KEY], undefined);
    assert.ok(cleared.draft.payload.writingPrompts);
    assert.ok(cleared.draft.payload.imagePrompts);
    assert.equal(
      (cleared.draft.payload.researchSnapshot as { mark: string }).mark,
      "original-research",
    );

    // Re-seed evidence then archive race.
    const reseed = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: fingerprintEditorialEvidenceFromPayload(cleared.draft.payload),
      evidence: parsed.value,
    });
    assert.equal(reseed.ok, true);
    if (!reseed.ok) return;
    const reseedRev = fingerprintEditorialEvidenceFromPayload(reseed.draft.payload);

    const archived = await cms.archiveSeoPlanningDraft(draft.id);
    assert.equal(archived.ok, true);
    const archiveRace = await cms.mergeSeoPlanningEditorialEvidence({
      id: draft.id,
      expectedEvidenceRevision: reseedRev,
      evidence: editedParsed.value,
    });
    assert.equal(archiveRace.ok, false);
    if (!archiveRace.ok) assert.equal(archiveRace.reason, "archived");
    const afterArchive = await cms.getSeoPlanningDraftById(draft.id);
    assert.ok(afterArchive?.archivedAt);
    assert.equal(
      fingerprintEditorialEvidenceFromPayload(afterArchive!.payload),
      reseedRev,
    );

    // 7) Evidence-only save must not change immutable draft fields (pre-archive check via restore).
    const restored = await cms.restoreSeoPlanningDraft(draft.id);
    assert.equal(restored.ok, true);
    if (!restored.ok) return;
    assert.equal(restored.draft.recommendation, "NEW_BLOG");
    assert.equal(restored.draft.fingerprint, draft.fingerprint);
    assert.equal(restored.draft.linkedPostId, null);
  } finally {
    process.chdir(previousCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("write freeze helper still active when env set", () => {
  withEnv({ CMS_WRITE_FREEZE: "1" }, () => {
    assert.equal(isCmsWriteFreezeActive(), true);
  });
  withEnv({ CMS_WRITE_FREEZE: undefined }, () => {
    assert.equal(isCmsWriteFreezeActive(), false);
  });
});

test("source: action RBAC + freeze + merge path; no Apply/Publish/Scheduler controls", () => {
  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.match(actions, /saveSeoPlanningEditorialEvidenceAction/);
  assert.match(actions, /requireAdminActor\("seo"\)/);
  assert.match(actions, /rejectIfCmsWriteFrozen/);
  assert.match(actions, /mergeSeoPlanningEditorialEvidence/);
  assert.match(actions, /SEO_PLANNING_EDITORIAL_EVIDENCE_STALE_MESSAGE/);
  assert.doesNotMatch(actions, /saveSeoPlanningEditorialEvidenceAction[\s\S]{0,800}saveSeoPlanningDraft/);

  const mysql = read("lib/cms/mysql-catalog.ts");
  assert.match(mysql, /async mergeSeoPlanningEditorialEvidence/);
  assert.match(
    mysql,
    /SELECT \* FROM seo_planning_drafts WHERE id = \? LIMIT 1 FOR UPDATE/,
  );
  assert.match(
    mysql,
    /fingerprintEditorialEvidenceFromPayload\(latest\.payload\)/,
  );
  assert.match(mysql, /isSeoPlanningEditorialEvidenceRevisionToken/);
  assert.match(
    mysql,
    /UPDATE seo_planning_drafts SET payload = \?, updated_at = \? WHERE id = \?/,
  );
  assert.match(mysql, /preserveLockedEditorialEvidenceInPayload/);
  assert.match(mysql, /FOR UPDATE/);

  const json = read("lib/cms/json-catalog.ts");
  assert.match(json, /async mergeSeoPlanningEditorialEvidence/);
  assert.match(json, /withSeoPlanningJsonWriteLock/);
  assert.match(json, /no cross-process CAS claim for JSON catalog/);
  assert.match(json, /preserveLockedEditorialEvidenceInPayload/);
  assert.match(json, /isSeoPlanningEditorialEvidenceRevisionToken/);

  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  assert.match(detail, /SeoPlanningEditorialEvidencePanel/);
  assert.match(detail, /SeoPlanningEditorialReadinessChecklist/);

  const checklistUi = read("components/sidhu/SeoPlanningEditorialReadinessChecklist.tsx");
  assert.match(checklistUi, /AI Apply: unavailable/);
  assert.match(checklistUi, /Autonomous Publishing/);
  assert.match(checklistUi, /Scheduler/);
  assert.doesNotMatch(checklistUi, /onClick=\{[^}]*Apply/);
  assert.doesNotMatch(checklistUi, /Publish now|Schedule publish/i);
  assert.match(checklistUi, /No Apply, Publish, Schedule/);

  const evidenceUi = read("components/sidhu/SeoPlanningEditorialEvidence.tsx");
  assert.match(evidenceUi, /SEO_PLANNING_EDITORIAL_TRUST/);
  assert.match(evidenceUi, /Save editorial evidence/);
  assert.match(evidenceUi, /Cancel \/ Revert/);
  assert.match(evidenceUi, /Clear evidence/);
  assert.doesNotMatch(evidenceUi, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(evidenceUi, /autoSave|setInterval|debounce.*save/i);

  const readiness = read("lib/cms/seo-planning/editorial-readiness.ts");
  assert.doesNotMatch(readiness, /from \"@\/lib\/cms\/seo-planning\/article-generation\"/);
  assert.doesNotMatch(readiness, /import\s+[\"']server-only[\"']/);
});

test("source: schema v6 unchanged; production gates; handoff/A1 untouched by evidence save", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 6);
  const schema = read("lib/db/schema.ts");
  assert.doesNotMatch(schema, /editorial_evidence_revision/);
  assert.doesNotMatch(schema, /evidence_revision/);

  const handoff = read("lib/cms/seo-planning/handoff.ts");
  assert.match(handoff, /evaluateSeoPlanningHandoffEligibility/);
  assert.doesNotMatch(handoff, /editorialEvidenceV1/);

  const a1 = read("lib/cms/seo-planning/article-generation.ts");
  assert.match(a1, /evaluateNewBlogArticleEligibility/);
  assert.match(a1, /EDITORIAL_UNVERIFIED|editorial_unverified/);

  const caps = SEO_PLANNING_EDITORIAL_EVIDENCE_CAPS.entryCount;
  assert.equal(caps, 5);
});

test("source: evidence save does not invoke providers or A2 apply", () => {
  const actions = read("lib/cms/seo-planning-actions.ts");
  const block = actions.slice(
    actions.indexOf("saveSeoPlanningEditorialEvidenceAction"),
    actions.indexOf("UpdateSeoPlanningSuggestionResult") > 0
      ? actions.indexOf(
          "Edit, apply, or ignore one private suggestion",
          actions.indexOf("saveSeoPlanningEditorialEvidenceAction"),
        )
      : actions.length,
  );
  assert.doesNotMatch(block, /generateNewBlogArticlePreview|requestOpenAi|requestGemini|runGsc/i);
  assert.doesNotMatch(block, /handoffSeoPlanningToBlog|applySeoPlanningWorkspaceUpdate/);
  assert.doesNotMatch(block, /publish|schedule/i);
});
