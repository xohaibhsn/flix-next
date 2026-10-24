import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SEO_AI_ONESHOT_PUBLISHER_ACTIVATED,
  SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED,
} from "../lib/cms/seo-planning";
import {
  SEO_MANAGER_CMS_BLOG_LIST_HREF,
  buildSeoAutomationWorkspaceStatus,
  resolveNewBlogEligibilityPanelStatus,
  readSeoAutomationSwitchBoard,
} from "../lib/cms/seo-automation";

describe("SEO activation readiness dashboard", () => {
  it("Blog drafts link targets Sidhu CMS /sidhu/blog/", () => {
    assert.equal(SEO_MANAGER_CMS_BLOG_LIST_HREF, "/sidhu/blog/");
    const panel = readFileSync(
      join(process.cwd(), "components/sidhu/SeoAutomationControlPanel.tsx"),
      "utf8",
    );
    assert.match(panel, /status\.cmsBlogListHref/);
    assert.doesNotMatch(panel, /href=["']\/sidhu\/blogs\/["']/);
    const status = buildSeoAutomationWorkspaceStatus();
    assert.equal(status.cmsBlogListHref, "/sidhu/blog/");
  });

  it("without authoritative summary, eligibility is NOT currently verified (not a false zero)", () => {
    const panel = resolveNewBlogEligibilityPanelStatus();
    assert.equal(panel.status, "ELIGIBILITY_NOT_CURRENTLY_VERIFIED");
    if (panel.status === "ELIGIBILITY_NOT_CURRENTLY_VERIFIED") {
      assert.equal(panel.evidenceFreshness, "stale_or_absent");
      assert.ok(panel.historicalLastAuditNote);
      assert.match(panel.historicalLastAuditNote, /Historical last-audited/);
    }
    const status = buildSeoAutomationWorkspaceStatus();
    assert.equal(status.newBlogEligibility.status, "ELIGIBILITY_NOT_CURRENTLY_VERIFIED");
    assert.ok(status.blockers.includes("eligibility_not_currently_verified"));
    assert.ok(!status.blockers.includes("no_eligible_new_blog_in_live_ledger_at_last_audit"));
  });

  it("incomplete summary yields UNKNOWN rather than zero eligible", () => {
    const panel = resolveNewBlogEligibilityPanelStatus({
      authoritativeSummary: { eligibleNewBlogCount: 0, summaryComplete: false },
    });
    assert.equal(panel.status, "UNKNOWN");
  });

  it("complete summary reports current eligible vs ineligible counts", () => {
    const eligible = resolveNewBlogEligibilityPanelStatus({
      authoritativeSummary: { eligibleNewBlogCount: 2, summaryComplete: true },
    });
    assert.equal(eligible.status, "CURRENT");
    if (eligible.status === "CURRENT") assert.equal(eligible.eligibleNewBlogCount, 2);

    const none = buildSeoAutomationWorkspaceStatus({
      authoritativeEligibilitySummary: { eligibleNewBlogCount: 0, summaryComplete: true },
    });
    assert.equal(none.newBlogEligibility.status, "CURRENT");
    if (none.newBlogEligibility.status === "CURRENT") {
      assert.equal(none.newBlogEligibility.eligibleNewBlogCount, 0);
    }
    assert.ok(none.blockers.includes("no_current_eligible_new_blog"));
  });

  it("does not activate Apply wiring or oneshot publisher", () => {
    assert.equal(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED, false);
    assert.equal(Boolean(SEO_AI_ONESHOT_PUBLISHER_ACTIVATED), false);
    const board = readSeoAutomationSwitchBoard();
    assert.equal(board.emergencyKill, true);
    assert.equal(board.applyWritersEnabled, false);
    assert.equal(board.publisherEnabled, false);
    assert.equal(board.schedulerEnabled, false);
    const status = buildSeoAutomationWorkspaceStatus();
    assert.equal(status.livePilotReady, false);
    assert.equal(status.a2ApplyProductionWiringEnabled, false);
    assert.equal(status.oneshotPublisherActivated, false);
  });
});
