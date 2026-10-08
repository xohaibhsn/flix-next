-- CMS tables for THE FLIX. Safe to run repeatedly (IF NOT EXISTS).
-- Do not DROP tables. Seed is handled in application code only when tables are empty.
-- Runtime also adds any missing blog/media columns via information_schema checks. Do not overwrite rows.

CREATE TABLE IF NOT EXISTS pages (
  id VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'published',
  cms_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY pages_slug_unique (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS page_sections (
  id VARCHAR(80) NOT NULL,
  page_id VARCHAR(80) NOT NULL,
  section_type VARCHAR(60) NOT NULL,
  label VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  visible TINYINT(1) NOT NULL DEFAULT 1,
  section_data LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY page_sections_page_sort (page_id, sort_order),
  CONSTRAINT page_sections_page_fk
    FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(80) NOT NULL,
  setting_value LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS media_assets (
  id VARCHAR(80) NOT NULL,
  public_id VARCHAR(255) NOT NULL,
  secure_url VARCHAR(500) NOT NULL,
  filename VARCHAR(160) NOT NULL DEFAULT '',
  width INT NULL,
  height INT NULL,
  format VARCHAR(40) NOT NULL DEFAULT '',
  resource_type VARCHAR(40) NOT NULL DEFAULT 'image',
  folder VARCHAR(160) NOT NULL DEFAULT '',
  bytes INT NULL,
  alt VARCHAR(160) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY media_assets_public_id (public_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pricing_plans (
  id VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  price VARCHAR(40) NOT NULL DEFAULT '',
  duration VARCHAR(80) NOT NULL DEFAULT '',
  badge_text VARCHAR(80) NOT NULL DEFAULT '',
  is_popular TINYINT(1) NOT NULL DEFAULT 0,
  features LONGTEXT NOT NULL,
  button_label VARCHAR(80) NOT NULL DEFAULT 'Choose Plan',
  button_url VARCHAR(255) NOT NULL DEFAULT '/contact/',
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY pricing_plans_slug_unique (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS faqs (
  id VARCHAR(80) NOT NULL,
  question VARCHAR(255) NOT NULL,
  answer LONGTEXT NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'General',
  sort_order INT NOT NULL DEFAULT 0,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY faqs_category_sort (category, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blog_categories (
  id VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY blog_categories_slug_unique (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS blog_posts (
  id VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  excerpt TEXT NOT NULL,
  content LONGTEXT NOT NULL,
  category_id VARCHAR(80) NULL,
  featured_image LONGTEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  featured TINYINT(1) NOT NULL DEFAULT 0,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  seo_title VARCHAR(200) NOT NULL DEFAULT '',
  seo_description VARCHAR(300) NOT NULL DEFAULT '',
  focus_keyword VARCHAR(120) NOT NULL DEFAULT '',
  canonical_url VARCHAR(255) NOT NULL DEFAULT '',
  robots_index TINYINT(1) NOT NULL DEFAULT 1,
  robots_follow TINYINT(1) NOT NULL DEFAULT 1,
  og_title VARCHAR(200) NOT NULL DEFAULT '',
  og_description VARCHAR(300) NOT NULL DEFAULT '',
  og_image LONGTEXT NULL,
  sitemap_include TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY blog_posts_slug_unique (slug),
  KEY blog_posts_status_published (status, published_at),
  KEY blog_posts_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS redirects (
  id VARCHAR(80) NOT NULL,
  source_path VARCHAR(255) NOT NULL,
  destination_path VARCHAR(255) NOT NULL,
  status_code SMALLINT NOT NULL DEFAULT 301,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY redirects_source_unique (source_path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_messages (
  id VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  phone VARCHAR(60) NOT NULL DEFAULT '',
  subject VARCHAR(180) NOT NULL DEFAULT '',
  message LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY contact_messages_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash CHAR(64) NOT NULL,
  fail_count INT NOT NULL DEFAULT 0,
  reset_at BIGINT NOT NULL,
  PRIMARY KEY (ip_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(80) NOT NULL,
  username VARCHAR(80) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'custom',
  permissions LONGTEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  session_version INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  created_by VARCHAR(80) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY admin_users_username_unique (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seo_planning_drafts (
  id VARCHAR(80) NOT NULL,
  recommendation VARCHAR(40) NOT NULL,
  workflow_status VARCHAR(40) NOT NULL DEFAULT 'PLANNING',
  fingerprint VARCHAR(320) NOT NULL,
  topic VARCHAR(160) NOT NULL DEFAULT '',
  working_title VARCHAR(180) NOT NULL DEFAULT '',
  proposed_slug VARCHAR(180) NOT NULL DEFAULT '',
  target_post_id VARCHAR(80) NULL,
  matched_public_url VARCHAR(300) NOT NULL DEFAULT '',
  restore_path VARCHAR(300) NOT NULL DEFAULT '',
  search_intent VARCHAR(40) NOT NULL DEFAULT '',
  linked_post_id VARCHAR(80) NULL,
  created_by VARCHAR(80) NOT NULL DEFAULT '',
  payload LONGTEXT NOT NULL,
  archived_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY seo_planning_drafts_fingerprint_unique (fingerprint),
  KEY seo_planning_drafts_workflow (workflow_status),
  KEY seo_planning_drafts_target_post (target_post_id),
  KEY seo_planning_drafts_archived_at (archived_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Experiment Ledger V1 — Research run + per-opportunity decision history (MySQL-only).
CREATE TABLE IF NOT EXISTS seo_research_runs (
  id VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL,
  completed_at DATETIME NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  actor_admin_id VARCHAR(80) NULL,
  research_ok TINYINT(1) NOT NULL,
  research_error_code VARCHAR(80) NULL,
  pipeline_run_status VARCHAR(40) NOT NULL,
  pipeline_version VARCHAR(20) NULL,
  pipeline_error_code VARCHAR(80) NULL,
  opportunity_count INT NOT NULL DEFAULT 0,
  gsc_status VARCHAR(40) NULL,
  durability_status VARCHAR(20) NOT NULL DEFAULT 'COMPLETE',
  PRIMARY KEY (id),
  KEY seo_research_runs_created (created_at),
  KEY seo_research_runs_source_created (source, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seo_opportunity_decisions (
  id VARCHAR(80) NOT NULL,
  run_id VARCHAR(80) NOT NULL,
  opportunity_index INT NOT NULL,
  opportunity_identity VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL,
  topic VARCHAR(160) NOT NULL DEFAULT '',
  working_title VARCHAR(180) NOT NULL DEFAULT '',
  research_recommendation VARCHAR(40) NOT NULL DEFAULT '',
  research_confidence VARCHAR(20) NULL,
  existing_coverage VARCHAR(20) NULL,
  matched_public_url VARCHAR(300) NOT NULL DEFAULT '',
  restore_path VARCHAR(300) NOT NULL DEFAULT '',
  target_post_id VARCHAR(80) NULL,
  evaluation_status VARCHAR(40) NOT NULL,
  rf_verdict VARCHAR(40) NULL,
  rf_fingerprint VARCHAR(80) NULL,
  nba_action VARCHAR(40) NULL,
  nba_status VARCHAR(40) NULL,
  nba_autonomous_eligible TINYINT(1) NULL,
  nba_fingerprint VARCHAR(80) NULL,
  priority_score INT NULL,
  priority_tier VARCHAR(20) NULL,
  priority_score_version VARCHAR(20) NULL,
  priority_automation_selectable TINYINT(1) NULL,
  priority_fingerprint VARCHAR(80) NULL,
  pipeline_fingerprint VARCHAR(80) NULL,
  selected TINYINT(1) NOT NULL DEFAULT 0,
  selection_source VARCHAR(40) NOT NULL DEFAULT 'none',
  PRIMARY KEY (id),
  UNIQUE KEY seo_opportunity_decisions_run_index (run_id, opportunity_index),
  KEY seo_opportunity_decisions_identity (opportunity_identity),
  KEY seo_opportunity_decisions_target (target_post_id),
  KEY seo_opportunity_decisions_nba_selected (nba_action, selected),
  CONSTRAINT seo_opportunity_decisions_run_fk
    FOREIGN KEY (run_id) REFERENCES seo_research_runs(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
