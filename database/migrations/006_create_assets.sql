-- Assets (configuration items), their types and dependencies.

CREATE TABLE IF NOT EXISTS asset_types (
  id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(60) NOT NULL,
  icon       VARCHAR(30) NOT NULL DEFAULT 'box',
  is_subscription TINYINT(1) NOT NULL DEFAULT 0,
  is_personal_device TINYINT(1) NOT NULL DEFAULT 0,
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_types_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_tag          VARCHAR(20)  NOT NULL,
  name               VARCHAR(160) NOT NULL,
  asset_type_id      SMALLINT UNSIGNED NOT NULL,
  criticality        ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
  status             ENUM('In use','In maintenance','In stock','Retired') NOT NULL DEFAULT 'In use',
  environment        VARCHAR(40)  NOT NULL DEFAULT 'Production',
  customer_id        INT UNSIGNED NOT NULL,
  department         VARCHAR(80)  NULL,
  location           VARCHAR(120) NULL,
  serial_number      VARCHAR(120) NULL,
  platform           VARCHAR(120) NULL,
  purchase_date      DATE         NULL,
  warranty_end       DATE         NULL,
  assigned_person_id INT UNSIGNED NULL,
  owner_person_id    INT UNSIGNED NULL,
  managed_by         INT UNSIGNED NULL,
  support_team_id    INT UNSIGNED NULL,
  notes              TEXT         NULL,
  created_by         INT UNSIGNED NULL,
  created_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at         DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assets_tag (asset_tag),
  UNIQUE KEY uq_assets_name (name),
  KEY idx_assets_type (asset_type_id),
  KEY idx_assets_status (status),
  KEY idx_assets_customer (customer_id),
  KEY idx_assets_assigned (assigned_person_id),
  KEY idx_assets_owner (owner_person_id),
  KEY idx_assets_support_team (support_team_id),
  CONSTRAINT fk_assets_type FOREIGN KEY (asset_type_id) REFERENCES asset_types (id),
  CONSTRAINT fk_assets_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_assets_assigned FOREIGN KEY (assigned_person_id) REFERENCES people (id) ON DELETE SET NULL,
  CONSTRAINT fk_assets_owner FOREIGN KEY (owner_person_id) REFERENCES people (id) ON DELETE SET NULL,
  CONSTRAINT fk_assets_managed_by FOREIGN KEY (managed_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_assets_support_team FOREIGN KEY (support_team_id) REFERENCES teams (id) ON DELETE SET NULL,
  CONSTRAINT fk_assets_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asset_dependencies (
  asset_id            INT UNSIGNED NOT NULL,
  depends_on_asset_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (asset_id, depends_on_asset_id),
  KEY idx_asset_dependencies_target (depends_on_asset_id),
  CONSTRAINT fk_asset_dep_asset FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE CASCADE,
  CONSTRAINT fk_asset_dep_target FOREIGN KEY (depends_on_asset_id) REFERENCES assets (id) ON DELETE CASCADE,
  CONSTRAINT chk_asset_dep_self CHECK (asset_id <> depends_on_asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
