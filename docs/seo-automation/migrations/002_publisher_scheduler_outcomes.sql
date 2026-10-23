-- ARTIFACT ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT BERLIN AUTHORITY
-- Source of truth: lib/cms/seo-automation/migration-artifacts.ts

CREATE TABLE IF NOT EXISTS seo_automation_publisher_jobs (
  job_id VARCHAR(80) NOT NULL,
  post_id VARCHAR(80) NOT NULL,
  planning_draft_id VARCHAR(80) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  supervised_receipt_id VARCHAR(80) NOT NULL,
  status VARCHAR(24) NOT NULL,
  lease_owner VARCHAR(80) NULL,
  lease_expires_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (job_id),
  UNIQUE KEY seo_automation_publisher_jobs_idempotency (idempotency_key),
  KEY seo_automation_publisher_jobs_post (post_id),
  CONSTRAINT seo_automation_publisher_jobs_post_fk
    FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE RESTRICT,
  CONSTRAINT seo_automation_publisher_jobs_planning_fk
    FOREIGN KEY (planning_draft_id) REFERENCES seo_planning_drafts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seo_automation_scheduler_leases (
  occurrence_key VARCHAR(160) NOT NULL,
  claimed_by VARCHAR(80) NOT NULL,
  claimed_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  status VARCHAR(24) NOT NULL,
  PRIMARY KEY (occurrence_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seo_automation_gsc_outcomes (
  outcome_id VARCHAR(80) NOT NULL,
  research_opportunity_id VARCHAR(80) NOT NULL,
  ledger_decision_id VARCHAR(80) NULL,
  planning_id VARCHAR(80) NOT NULL,
  blog_post_id VARCHAR(80) NOT NULL,
  published_canonical_url VARCHAR(512) NOT NULL,
  publication_timestamp DATETIME NOT NULL,
  baseline_json MEDIUMTEXT NOT NULL,
  day7_json MEDIUMTEXT NULL,
  day14_json MEDIUMTEXT NULL,
  day28_json MEDIUMTEXT NULL,
  experiment_status VARCHAR(32) NOT NULL,
  ai_provider_cost_usd DECIMAL(10,4) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (outcome_id),
  UNIQUE KEY seo_automation_gsc_outcomes_post (blog_post_id),
  KEY seo_automation_gsc_outcomes_planning (planning_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
