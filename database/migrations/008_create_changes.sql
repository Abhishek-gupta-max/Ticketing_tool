-- Change management: plans, risk assessment, schedule and affected assets.
-- CAB approvals live in the reusable approvals table (migration 014).

CREATE TABLE IF NOT EXISTS changes (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  change_number       VARCHAR(20)  NOT NULL,
  title               VARCHAR(255) NOT NULL,
  type                ENUM('Standard','Normal','Emergency') NOT NULL DEFAULT 'Normal',
  status              VARCHAR(30)  NOT NULL DEFAULT 'Draft',
  owner_id            INT UNSIGNED NULL,
  customer_id         INT UNSIGNED NULL,
  problem_id          INT UNSIGNED NULL,
  planned_start       DATETIME(3)  NOT NULL,
  planned_end         DATETIME(3)  NOT NULL,
  impact              TINYINT UNSIGNED NOT NULL DEFAULT 2,
  urgency             TINYINT UNSIGNED NOT NULL DEFAULT 2,
  risk                ENUM('Low','Medium','High') NOT NULL DEFAULT 'Medium',
  risk_scope          TINYINT UNSIGNED NOT NULL DEFAULT 2,
  risk_downtime       TINYINT UNSIGNED NOT NULL DEFAULT 1,
  risk_tested         TINYINT(1)   NOT NULL DEFAULT 1,
  risk_backout        TINYINT(1)   NOT NULL DEFAULT 1,
  description         TEXT         NULL,
  implementation_plan TEXT         NULL,
  backout_plan        TEXT         NULL,
  test_plan           TEXT         NULL,
  close_code          VARCHAR(60)  NULL,
  close_notes         TEXT         NULL,
  created_by          INT UNSIGNED NULL,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at          DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_changes_number (change_number),
  KEY idx_changes_status (status),
  KEY idx_changes_start (planned_start),
  KEY idx_changes_owner (owner_id),
  KEY idx_changes_problem (problem_id),
  CONSTRAINT chk_changes_status CHECK (status IN ('Draft','Risk review','Approval','Scheduled','Doing','Verify','Closed','Canceled')),
  CONSTRAINT chk_changes_window CHECK (planned_end > planned_start),
  CONSTRAINT fk_changes_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_changes_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_changes_problem FOREIGN KEY (problem_id) REFERENCES problems (id) ON DELETE SET NULL,
  CONSTRAINT fk_changes_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS change_assets (
  change_id INT UNSIGNED NOT NULL,
  asset_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (change_id, asset_id),
  KEY idx_change_assets_asset (asset_id),
  CONSTRAINT fk_change_assets_change FOREIGN KEY (change_id) REFERENCES changes (id) ON DELETE CASCADE,
  CONSTRAINT fk_change_assets_asset FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS change_activities (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  change_id  INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NULL,
  type       ENUM('system','note') NOT NULL DEFAULT 'system',
  body       TEXT        NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_change_activities_change (change_id, created_at),
  CONSTRAINT fk_change_activities_change FOREIGN KEY (change_id) REFERENCES changes (id) ON DELETE CASCADE,
  CONSTRAINT fk_change_activities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
