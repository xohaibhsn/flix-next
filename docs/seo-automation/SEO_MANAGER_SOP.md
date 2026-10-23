# SEO Manager Operating Guide — SEO Automation

Single operational owner: **SEO Manager**. Existing `super_admin` oversight remains intact.

Autonomous writers, publisher, and scheduler default **OFF**. Do not treat code deployment as publication readiness.

## 1. Run Research

1. Open Sidhu → **SEO → Opportunities**.
2. Use the existing UK Research action only when budgets and provider configuration are verified.
3. Bound: one invocation, max five opportunities, no automatic retries, no model fallback.
4. If Research fails, do **not** silently switch providers for UK Research.

## 2. Eligibility (NEW_BLOG)

Autonomous NEW_BLOG requires **all** of:

- Refresh-First: `PASS_NEW_CONTENT`
- NBA: `NEW_BLOG`
- `autonomousEligible = true`
- Priority `automationSelectable = true`
- Valid Research provenance
- First-party content gap + suitable search intent
- No equivalent content / protected target conflict
- Opportunity-owned GSC evidence when required

Priority score alone never authorizes creation.  
`GSC AVAILABLE` at run level is **not** opportunity-owned evidence.  
`UNKNOWN` URL status is **not** 404 / RESTORE.

## 3. Reject REFRESH / HOLD for autonomous creation

Do **not** convert `REFRESH_EXISTING`, `RESTORE_HISTORICAL`, `HOLD`, `SKIP`, or `INTERNAL_LINK` into autonomous NEW_BLOG.  
Manual REFRESH editing remains a separate editorial workflow.

If a run yields zero eligible NEW_BLOG opportunities, record `NO_ELIGIBLE_NEW_BLOG` and stop content generation for that run.

## 4. Review Ledger evidence

1. Open **SEO → Ledger**.
2. Inspect run status, decisions, and linked evidence.
3. Confirm Research / decision identity before Planning.

## 5. Use Planning

1. Open **SEO → Planning**.
2. Verify provenance to Ledger / Research.
3. Keep protected Planning drafts (e.g. Firestick REFRESH) intact unless intentionally editing under the manual workflow.

## 6. Review AI Preview (A1)

1. Generate private preview only when `SEO_AI_ARTICLE_GENERATION_ENABLED` and model config are verified.
2. Preview is **not** publishing.
3. Check UK suitability, originality, factual claims, headings, and intent match.
4. Reject fabricated prices, guarantees, or competitor-copied text.

## 7. Approve Apply (A2)

1. Approval must be a **server-issued receipt** bound to preview fingerprint + Planning identity.
2. Client `approved=true` is **never** sufficient.
3. Apply targets a **private Blog draft** only; published posts are protected.
4. Production Apply remains fail-closed until durable schema migration, worker fencing, and wiring gates pass.

## 8. Check the private Blog draft

1. Open **Sidhu → Blogs**.
2. Confirm draft status, linked Planning id, content fingerprint, and no accidental publish.

## 9. Verify images and SEO

- Prefer existing licensed Cloudinary assets (max 1–2 images).
- Alt text must describe actual visual content.
- Validate SEO title, meta description, slug, canonical, H1/H2/H3, internal links.
- Do not change sitewide SEO settings from article automation.

## 10. Publish

1. PrePublish QA must **PASS** (mandatory).
2. SEO Manager approval must match the exact content version.
3. Use controlled one-shot publisher only after activation; until then use supervised Manual Publish if authorized.
4. Never publish unreviewed AI content.

## 11. Configure scheduler

Defaults: timezone `Europe/London`, **no** compulsory Mon/Wed/Fri days, caps at zero, manual pause **ON**, recurrence **blocked**.  
Do not enable Hostinger cron until writer, audit, cost, kill-switch, and supervised pilot gates pass.

## 12. Check budgets

Pilot ceilings (aggregate): 1 Research, 4 GSC reads, 1 Ledger persist, ≤5 decisions, 1 article generation, 1 Apply, ≤2 images, 1 supervised publication, ≤1 repair, **0** automatic retries.

If cost cannot be bounded, **skip** the paid call.

## 13. Emergency OFF

Master control emergency kill switch blocks Research, generation, Apply writers, publisher, scheduler, and recurring outcomes. Leave it ON until acceptance.

## 14. Investigate failures

Check Sidhu automation panel blockers, Ledger failed runs, sanitized action errors, provider telemetry (no secrets), and audit rows when durable stores exist.

## 15. Stop publication

Pause scheduler / keep publisher OFF / use write-freeze when instructed for migrations. Prefer draft revert for oneshot rollback (never cascade to unrelated posts).

## 16. Inspect 7 / 14 / 28-day outcomes

After a genuine publication, track impressions, clicks, CTR, average position vs baseline.  
Missing GSC evidence ≠ zero. Do not invent improvement percentages. Observe GSC lag.

## Protected assets (do not overwrite)

- `/blogs/how-to-watch-iptv-on-firestick/`
- `/blogs/getting-started-with-the-flixiptv/`
- Planning `seoplan_fbf7dfc4-81d4-4d81-bd91-c4f1e9c317c8`
- Existing Ledger history, redirects, sitemap/canonical rules, Cloudinary inventory
