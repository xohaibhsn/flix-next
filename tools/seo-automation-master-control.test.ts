import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  authorizePilotSpend,
  emptyPilotUsage,
  evaluateAutonomousNewBlogEligibility,
  evaluateSeoAutomationSchedulerTick,
  buildSchedulerOccurrenceKey,
  prepareBoundedUkResearchPilot,
  planSeoAutomationDurableMigration,
  readSeoAutomationSwitchBoard,
  requireBoundedCostEstimate,
  SEO_AUTOMATION_PILOT_LIMITS,
  computeOutcomeDeltas,
  buildEmptyOutcomeWindow,
} from "../lib/cms/seo-automation";
import { resolveCmsApplyProductionDeps } from "../lib/cms/seo-planning/article-apply-production-di";

describe("SEO Automation master control", () => {
  it("defaults all autonomous paths OFF with emergency kill ON", () => {
    const board = readSeoAutomationSwitchBoard();
    assert.equal(board.emergencyKill, true);
    assert.equal(board.masterEnabled, false);
    assert.equal(board.researchEnabled, false);
    assert.equal(board.applyWritersEnabled, false);
    assert.equal(board.publisherEnabled, false);
    assert.equal(board.schedulerEnabled, false);
    assert.equal(board.allAutonomousOff, true);
  });

  it("rejects REFRESH/HOLD/RESTORE for autonomous NEW_BLOG", () => {
    for (const nbaAction of ["REFRESH_EXISTING", "HOLD", "RESTORE_HISTORICAL", "SKIP", "INTERNAL_LINK"]) {
      const result = evaluateAutonomousNewBlogEligibility({
        refreshFirstVerdict: "PASS_NEW_CONTENT",
        nbaAction,
        autonomousEligible: true,
        automationSelectable: true,
        hasValidResearchProvenance: true,
        hasFirstPartyContentGap: true,
        hasSuitableSearchIntentEvidence: true,
        hasExistingEquivalentContent: false,
        hasProtectedTargetConflict: false,
        hasOpportunityOwnedGscEvidence: true,
        gscRequired: false,
        urlStatusUnknown: false,
        priorityScore: 99,
      });
      assert.equal(result.ok, false);
      assert.equal(result.eligible, false);
    }
  });

  it("accepts only full NEW_BLOG eligibility stack", () => {
    const result = evaluateAutonomousNewBlogEligibility({
      refreshFirstVerdict: "PASS_NEW_CONTENT",
      nbaAction: "NEW_BLOG",
      autonomousEligible: true,
      automationSelectable: true,
      hasValidResearchProvenance: true,
      hasFirstPartyContentGap: true,
      hasSuitableSearchIntentEvidence: true,
      hasExistingEquivalentContent: false,
      hasProtectedTargetConflict: false,
      hasOpportunityOwnedGscEvidence: true,
      gscRequired: true,
      urlStatusUnknown: false,
      priorityScore: 1,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.code, "ELIGIBLE_NEW_BLOG");
  });

  it("blocks UNKNOWN URL status and missing opportunity GSC when required", () => {
    const unknown = evaluateAutonomousNewBlogEligibility({
      refreshFirstVerdict: "PASS_NEW_CONTENT",
      nbaAction: "NEW_BLOG",
      autonomousEligible: true,
      automationSelectable: true,
      hasValidResearchProvenance: true,
      hasFirstPartyContentGap: true,
      hasSuitableSearchIntentEvidence: true,
      hasExistingEquivalentContent: false,
      hasProtectedTargetConflict: false,
      hasOpportunityOwnedGscEvidence: true,
      gscRequired: false,
      urlStatusUnknown: true,
    });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.code, "UNKNOWN_URL_STATUS");

    const gsc = evaluateAutonomousNewBlogEligibility({
      refreshFirstVerdict: "PASS_NEW_CONTENT",
      nbaAction: "NEW_BLOG",
      autonomousEligible: true,
      automationSelectable: true,
      hasValidResearchProvenance: true,
      hasFirstPartyContentGap: true,
      hasSuitableSearchIntentEvidence: true,
      hasExistingEquivalentContent: false,
      hasProtectedTargetConflict: false,
      hasOpportunityOwnedGscEvidence: false,
      gscRequired: true,
      urlStatusUnknown: false,
    });
    assert.equal(gsc.ok, false);
    if (!gsc.ok) assert.equal(gsc.code, "MISSING_OPPORTUNITY_GSC");
  });

  it("enforces pilot budgets and unbounded cost skip", () => {
    const ok = authorizePilotSpend(emptyPilotUsage(), "researchInvocations", 1);
    assert.equal(ok.ok, true);
    const over = authorizePilotSpend(
      { ...emptyPilotUsage(), researchInvocations: SEO_AUTOMATION_PILOT_LIMITS.maxResearchInvocations },
      "researchInvocations",
      1,
    );
    assert.equal(over.ok, false);
    const cost = requireBoundedCostEstimate(null);
    assert.equal(cost.ok, false);
    if (!cost.ok) assert.equal(cost.code, "cost_unbounded");
  });

  it("scheduler tick stays fail-closed and builds DST-safe occurrence keys", () => {
    const keyA = buildSchedulerOccurrenceKey({
      utcInstant: new Date("2026-03-29T01:30:00.000Z"),
      timezone: "Europe/London",
      dailyTimeHhMm: "09:00",
    });
    const keyB = buildSchedulerOccurrenceKey({
      utcInstant: new Date("2026-10-25T01:30:00.000Z"),
      timezone: "Europe/London",
      dailyTimeHhMm: "09:00",
    });
    assert.match(keyA, /^Europe\/London\|/);
    assert.match(keyB, /^Europe\/London\|/);
    assert.notEqual(keyA, keyB);

    const tick = evaluateSeoAutomationSchedulerTick({
      signedInvocationValid: true,
      utcInstant: new Date("2026-10-24T08:00:00.000Z"),
    });
    assert.equal(tick.ok, false);
  });

  it("research pilot never auto-executes live paid call", () => {
    const decision = prepareBoundedUkResearchPilot({
      openaiUkResearchConfigured: true,
      modelAllowlisted: true,
      pricingKnown: true,
      estimatedCostUsd: 0.05,
      operationSpecificAuthorization: true,
      usage: emptyPilotUsage(),
    });
    // Emergency kill / master OFF → blocked; if somehow open, still executeLiveCall=false
    assert.equal(decision.executeLiveCall, false);
  });

  it("production DI remains unavailable without schema/facade/writers", () => {
    const deps = resolveCmsApplyProductionDeps({ physicalSchemaPresent: false });
    assert.equal(deps.ok, false);
    assert.equal(deps.mode, "unavailable");
    const stillClosed = resolveCmsApplyProductionDeps({ physicalSchemaPresent: true });
    assert.equal(stillClosed.ok, false);
  });

  it("migration plan never authorizes execute and lists fencing blocker", () => {
    const plan = planSeoAutomationDurableMigration();
    assert.equal(plan.executeAuthorized, false);
    assert.equal(plan.registeredWithEnsure, false);
    assert.ok(plan.ddlStatementCount >= 3);
    assert.ok(plan.blockers.some((b) => b.includes("oldWorkersPositivelyFenced")));
  });

  it("outcome deltas never fabricate zeros from missing evidence", () => {
    const baseline = {
      impressions: null,
      clicks: 10,
      ctr: null,
      averagePosition: 5,
      capturedAt: null,
      evidenceStatus: "missing" as const,
    };
    const window = buildEmptyOutcomeWindow(7);
    window.clicks = 12;
    window.averagePosition = 4;
    const deltas = computeOutcomeDeltas(baseline, window);
    assert.equal(deltas.deltaImpressions, null);
    assert.equal(deltas.deltaClicks, 2);
    assert.equal(deltas.causalImprovementClaimed, false);
  });
});
