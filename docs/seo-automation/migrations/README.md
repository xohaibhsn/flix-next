# SEO Automation durable migration artifacts

**Status: NOT REGISTERED / NOT EXECUTABLE IN PRODUCTION**

- Live CMS schema remains **v6** (`CURRENT_CMS_SCHEMA_VERSION`).
- These statements must **not** be appended to `CMS_SCHEMA_STATEMENTS`.
- Must **not** bump schema version from this folder.
- Must **not** run via `ensureCmsSchema` until Berlin allocates a slot **and** all ten migration safety gates pass (including old-worker fencing).

## Contents

1. A2 Apply: `seo_ai_article_previews`, `seo_ai_article_approvals`, `seo_ai_article_apply_audits` (see `lib/cms/seo-planning/article-apply-durable-schema.ts`).
2. Publisher jobs / leases / GSC outcomes (see `lib/cms/seo-automation/migration-artifacts.ts`).

## Restore credibility requirement

Before any production DDL:

1. Verified production MySQL backup completed.
2. Documented restore procedure tested or technically credible.
3. Writer freeze enforceable across workers.
4. Old workers positively fenced (Hostinger `/sidhu/` block alone is insufficient).

If fencing cannot be proven: **do not migrate or activate durable writers**.
