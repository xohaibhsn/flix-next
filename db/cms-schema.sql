-- CMS tables for THE FLIX. Safe to run repeatedly (IF NOT EXISTS).
-- Do not DROP tables. Seed is handled in application code only when tables are empty.

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
  section_type VARCHAR(40) NOT NULL,
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
