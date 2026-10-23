-- ARTIFACT ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT BERLIN AUTHORITY
-- Preserves live schema v6; unallocated additive slot (not v7).
-- Source of truth: lib/cms/seo-planning/article-apply-durable-schema.ts

CREATE TABLE IF NOT EXISTS seo_ai_article_previews (
  preview_session_id VARCHAR(80) NOT NULL,
  planning_draft_id VARCHAR(80) NOT NULL,
  planning_updated_at DATETIME NOT NULL,
  writing_fingerprint VARCHAR(128) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  generation_id VARCHAR(80) NOT NULL,
  model VARCHAR(120) NOT NULL,
  title VARCHAR(160) NOT NULL,
  excerpt VARCHAR(400) NOT NULL,
  html MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  invalidated TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (preview_session_id),
  KEY seo_ai_article_previews_planning (planning_draft_id),
  KEY seo_ai_article_previews_generation (generation_id),
  CONSTRAINT seo_ai_article_previews_planning_fk
    FOREIGN KEY (planning_draft_id) REFERENCES seo_planning_drafts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seo_ai_article_approvals (
  receipt_id VARCHAR(80) NOT NULL,
  preview_session_id VARCHAR(80) NOT NULL,
  planning_draft_id VARCHAR(80) NOT NULL,
  planning_updated_at DATETIME NOT NULL,
  writing_fingerprint VARCHAR(128) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  approved_by_admin_id VARCHAR(80) NOT NULL,
  factual_review_confirmed TINYINT(1) NOT NULL,
  approved_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (receipt_id),
  KEY seo_ai_article_approvals_preview (preview_session_id),
  KEY seo_ai_article_approvals_planning (planning_draft_id),
  KEY seo_ai_article_approvals_admin (approved_by_admin_id),
  CONSTRAINT seo_ai_article_approvals_preview_fk
    FOREIGN KEY (preview_session_id) REFERENCES seo_ai_article_previews(preview_session_id) ON DELETE RESTRICT,
  CONSTRAINT seo_ai_article_approvals_planning_fk
    FOREIGN KEY (planning_draft_id) REFERENCES seo_planning_drafts(id) ON DELETE RESTRICT,
  CONSTRAINT seo_ai_article_approvals_admin_fk
    FOREIGN KEY (approved_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seo_ai_article_apply_audits (
  apply_operation_key VARCHAR(120) NOT NULL,
  planning_draft_id VARCHAR(80) NOT NULL,
  post_id VARCHAR(80) NULL,
  preview_session_id VARCHAR(80) NOT NULL,
  approval_receipt_id VARCHAR(80) NOT NULL,
  generation_id VARCHAR(80) NOT NULL,
  admin_id VARCHAR(80) NOT NULL,
  writing_fingerprint VARCHAR(128) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  outcome VARCHAR(24) NOT NULL,
  result_code VARCHAR(64) NULL,
  detail VARCHAR(200) NOT NULL DEFAULT '',
  publication_ready TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (apply_operation_key),
  KEY seo_ai_article_apply_audits_planning (planning_draft_id),
  KEY seo_ai_article_apply_audits_post (post_id),
  KEY seo_ai_article_apply_audits_preview (preview_session_id),
  CONSTRAINT seo_ai_article_apply_audits_planning_fk
    FOREIGN KEY (planning_draft_id) REFERENCES seo_planning_drafts(id) ON DELETE RESTRICT,
  CONSTRAINT seo_ai_article_apply_audits_preview_fk
    FOREIGN KEY (preview_session_id) REFERENCES seo_ai_article_previews(preview_session_id) ON DELETE RESTRICT,
  CONSTRAINT seo_ai_article_apply_audits_approval_fk
    FOREIGN KEY (approval_receipt_id) REFERENCES seo_ai_article_approvals(receipt_id) ON DELETE RESTRICT,
  CONSTRAINT seo_ai_article_apply_audits_post_fk
    FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
