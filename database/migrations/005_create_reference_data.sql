-- Configuration that used to live as JavaScript constants in the browser:
-- priorities with their SLA targets, ticket categories with routing,
-- pick-list values, automation rules, canned responses, number sequences
-- and key/value settings.

CREATE TABLE IF NOT EXISTS priorities (
  id                 TINYINT UNSIGNED NOT NULL,
  name               VARCHAR(20) NOT NULL,
  response_minutes   INT UNSIGNED NOT NULL,
  resolution_minutes INT UNSIGNED NOT NULL,
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_priorities_name (name),
  CONSTRAINT chk_priorities_minutes CHECK (response_minutes > 0 AND resolution_minutes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_categories (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(80)  NOT NULL,
  default_team_id INT UNSIGNED NULL,
  sort_order      SMALLINT     NOT NULL DEFAULT 0,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_ticket_categories_name (name),
  KEY idx_ticket_categories_team (default_team_id),
  CONSTRAINT fk_ticket_categories_team FOREIGN KEY (default_team_id) REFERENCES teams (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Small pick lists (channels, hold reasons, resolution codes, ...).
CREATE TABLE IF NOT EXISTS lookup_values (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  list_key   VARCHAR(40)  NOT NULL,
  value      VARCHAR(120) NOT NULL,
  sort_order SMALLINT     NOT NULL DEFAULT 0,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lookup_values (list_key, value),
  KEY idx_lookup_values_list (list_key, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Server-side record numbers (INC-2026-0001 ...). Rows are locked by the
-- INSERT ... ON DUPLICATE KEY UPDATE inside the creating transaction, so two
-- concurrent requests can never receive the same number.
CREATE TABLE IF NOT EXISTS sequences (
  prefix     VARCHAR(10)  NOT NULL,
  seq_year   SMALLINT UNSIGNED NOT NULL,
  last_value INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (prefix, seq_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Key/value settings for structured configuration blocks (organisation,
-- business hours, notifications, integrations). Values are JSON because each
-- block is read and written as a unit.
CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(60) NOT NULL,
  value       LONGTEXT    NOT NULL CHECK (JSON_VALID(value)),
  updated_by  INT UNSIGNED NULL,
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS automation_rules (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(10)  NOT NULL,
  name        VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  is_enabled  TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_automation_rules_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS canned_responses (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  body       TEXT         NOT NULL,
  sort_order SMALLINT     NOT NULL DEFAULT 0,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_canned_responses_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
