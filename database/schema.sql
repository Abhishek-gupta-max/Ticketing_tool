-- Veltrixsecure Service Desk: full schema generated from database/migrations.
-- Generated file. Do not edit; run "npm run db:schema" after adding a migration.
-- Target: MySQL 8 / MariaDB 10.4+ (utf8mb4).

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ===================== 001_create_roles_permissions.sql =====================
-- Roles, permissions and the join table used for role-based access control.
-- Permissions are granular strings such as "ticket:create". The backend checks
-- them on every protected route; the frontend only uses them to hide controls.

CREATE TABLE IF NOT EXISTS roles (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(40)  NOT NULL,
  description VARCHAR(255) NULL,
  is_system   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(60)  NOT NULL,
  description VARCHAR(255) NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       SMALLINT UNSIGNED NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_role_permissions_permission (permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 002_create_users.sql =====================
-- Login accounts. Agents, managers, admins and customer portal users all sign in
-- through this table. Passwords are stored as bcrypt hashes only.
-- token_version is embedded in every JWT; bumping it invalidates all sessions.

CREATE TABLE IF NOT EXISTS users (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id                SMALLINT UNSIGNED NOT NULL,
  name                   VARCHAR(120) NOT NULL,
  email                  VARCHAR(190) NOT NULL,
  password_hash          VARCHAR(255) NOT NULL,
  status                 ENUM('active','inactive','locked') NOT NULL DEFAULT 'active',
  token_version          INT UNSIGNED NOT NULL DEFAULT 0,
  failed_login_count     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until           DATETIME(3) NULL,
  last_login_at          DATETIME(3) NULL,
  password_changed_at    DATETIME(3) NULL,
  reset_token_hash       CHAR(64) NULL,
  reset_token_expires_at DATETIME(3) NULL,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at             DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_reset_token (reset_token_hash),
  KEY idx_users_role (role_id),
  KEY idx_users_status (status),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 003_create_teams.sql =====================
-- Teams (assignment groups), their members and the agent profile.
-- An agent is a user with an agent profile. An agent can belong to several
-- teams; primary_team_id is the one shown next to their name.

CREATE TABLE IF NOT EXISTS teams (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(40)  NOT NULL,
  name        VARCHAR(120) NOT NULL,
  type        ENUM('Support','Approval') NOT NULL DEFAULT 'Support',
  description VARCHAR(500) NULL,
  email       VARCHAR(190) NULL,
  manager_id  INT UNSIGNED NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_teams_code (code),
  UNIQUE KEY uq_teams_name (name),
  KEY idx_teams_manager (manager_id),
  CONSTRAINT fk_teams_manager FOREIGN KEY (manager_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agents (
  user_id         INT UNSIGNED NOT NULL,
  primary_team_id INT UNSIGNED NULL,
  job_title       VARCHAR(120) NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  KEY idx_agents_primary_team (primary_team_id),
  CONSTRAINT fk_agents_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_agents_primary_team FOREIGN KEY (primary_team_id) REFERENCES teams (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS team_members (
  team_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  is_on_call TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (team_id, user_id),
  KEY idx_team_members_user (user_id),
  CONSTRAINT fk_team_members_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE CASCADE,
  CONSTRAINT fk_team_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 004_create_customers_people.sql =====================
-- Customers are the organisations the desk supports. People are their
-- requesters. A person may optionally have a portal login (user_id).

CREATE TABLE IF NOT EXISTS customers (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code       VARCHAR(40)  NOT NULL,
  name       VARCHAR(160) NOT NULL,
  plan       ENUM('Enterprise','Business','Starter','Internal') NOT NULL DEFAULT 'Business',
  is_internal TINYINT(1)  NOT NULL DEFAULT 0,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_code (code),
  UNIQUE KEY uq_customers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS people (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NULL,
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(190) NOT NULL,
  is_vip      TINYINT(1)   NOT NULL DEFAULT 0,
  department  VARCHAR(80)  NULL,
  job_title   VARCHAR(80)  NULL,
  location    VARCHAR(80)  NULL,
  phone       VARCHAR(40)  NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at  DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_people_email (email),
  UNIQUE KEY uq_people_user (user_id),
  KEY idx_people_customer (customer_id),
  KEY idx_people_name (name),
  CONSTRAINT fk_people_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_people_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 005_create_reference_data.sql =====================
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

-- ===================== 006_create_assets.sql =====================
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

-- ===================== 007_create_problems.sql =====================
-- Problem management: root cause, workaround, known errors.

CREATE TABLE IF NOT EXISTS problems (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  problem_number  VARCHAR(20)  NOT NULL,
  title           VARCHAR(255) NOT NULL,
  status          VARCHAR(30)  NOT NULL DEFAULT 'Logged',
  priority        TINYINT UNSIGNED NOT NULL DEFAULT 3,
  owner_id        INT UNSIGNED NULL,
  team_id         INT UNSIGNED NULL,
  customer_id     INT UNSIGNED NULL,
  root_cause      TEXT         NULL,
  workaround      TEXT         NULL,
  is_known_error  TINYINT(1)   NOT NULL DEFAULT 0,
  resolution_code VARCHAR(60)  NULL,
  fix_notes       TEXT         NULL,
  resolved_at     DATETIME(3)  NULL,
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_problems_number (problem_number),
  KEY idx_problems_status (status),
  KEY idx_problems_owner (owner_id),
  KEY idx_problems_created (created_at),
  CONSTRAINT chk_problems_status CHECK (status IN ('Logged','Investigating','Finding cause','Fix underway','Fixed','Closed')),
  CONSTRAINT fk_problems_priority FOREIGN KEY (priority) REFERENCES priorities (id),
  CONSTRAINT fk_problems_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_problems_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL,
  CONSTRAINT fk_problems_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_problems_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS problem_activities (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  problem_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NULL,
  type       ENUM('system','note') NOT NULL DEFAULT 'system',
  body       TEXT        NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_problem_activities_problem (problem_id, created_at),
  CONSTRAINT fk_problem_activities_problem FOREIGN KEY (problem_id) REFERENCES problems (id) ON DELETE CASCADE,
  CONSTRAINT fk_problem_activities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 008_create_changes.sql =====================
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

-- ===================== 009_create_catalog.sql =====================
-- Service catalog: orderable items, their form fields and the fulfilment
-- tasks created when an item is approved.

CREATE TABLE IF NOT EXISTS catalog_items (
  id                SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code              VARCHAR(20)  NOT NULL,
  name              VARCHAR(120) NOT NULL,
  category_id       SMALLINT UNSIGNED NOT NULL,
  icon              VARCHAR(30)  NOT NULL DEFAULT 'box',
  description       VARCHAR(500) NOT NULL,
  requires_approval TINYINT(1)   NOT NULL DEFAULT 0,
  fulfilment_hours  SMALLINT UNSIGNED NOT NULL DEFAULT 24,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order        SMALLINT     NOT NULL DEFAULT 0,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_catalog_items_code (code),
  UNIQUE KEY uq_catalog_items_name (name),
  KEY idx_catalog_items_category (category_id),
  CONSTRAINT fk_catalog_items_category FOREIGN KEY (category_id) REFERENCES ticket_categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- options holds the choices of a select field as a JSON array of strings.
CREATE TABLE IF NOT EXISTS catalog_fields (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  catalog_item_id SMALLINT UNSIGNED NOT NULL,
  field_key       VARCHAR(40)  NOT NULL,
  label           VARCHAR(120) NOT NULL,
  field_type      ENUM('text','textarea','select','date') NOT NULL DEFAULT 'text',
  is_required     TINYINT(1)   NOT NULL DEFAULT 0,
  options         LONGTEXT     NULL CHECK (options IS NULL OR JSON_VALID(options)),
  sort_order      SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_catalog_fields_key (catalog_item_id, field_key),
  CONSTRAINT fk_catalog_fields_item FOREIGN KEY (catalog_item_id) REFERENCES catalog_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_tasks (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  catalog_item_id SMALLINT UNSIGNED NOT NULL,
  title           VARCHAR(200) NOT NULL,
  sort_order      SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_catalog_tasks_item (catalog_item_id, sort_order),
  CONSTRAINT fk_catalog_tasks_item FOREIGN KEY (catalog_item_id) REFERENCES catalog_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 010_create_requests.sql =====================
-- A service request (REQ-2026-0001) groups one or more order items. Each order
-- item is a ticket of kind 'request' (REQ-2026-0001.1) linked through
-- request_items (migration 012) so it gets its own approval, SLA and tasks.

CREATE TABLE IF NOT EXISTS requests (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_number   VARCHAR(20)  NOT NULL,
  requested_for_id INT UNSIGNED NOT NULL,
  customer_id      INT UNSIGNED NOT NULL,
  opened_by        INT UNSIGNED NULL,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_requests_number (request_number),
  KEY idx_requests_requested_for (requested_for_id),
  KEY idx_requests_customer (customer_id),
  KEY idx_requests_created (created_at),
  CONSTRAINT fk_requests_requested_for FOREIGN KEY (requested_for_id) REFERENCES people (id),
  CONSTRAINT fk_requests_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_requests_opened_by FOREIGN KEY (opened_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 011_create_tickets.sql =====================
-- Tickets (incidents and request order items) with their tags, comments,
-- system activity, field history and major incidents.
--
-- SLA columns: sla_*_due_at are the targets at creation (or after a priority
-- change). paused_seconds accumulates time spent On Hold / Waiting for
-- requester; paused_at is set while the clock is paused right now.

CREATE TABLE IF NOT EXISTS tickets (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_number         VARCHAR(32)  NOT NULL,
  kind                  ENUM('incident','request') NOT NULL,
  title                 VARCHAR(255) NOT NULL,
  description           TEXT         NULL,
  customer_id           INT UNSIGNED NOT NULL,
  requester_id          INT UNSIGNED NOT NULL,
  category_id           SMALLINT UNSIGNED NOT NULL,
  team_id               INT UNSIGNED NULL,
  assigned_to           INT UNSIGNED NULL,
  channel               VARCHAR(30)  NOT NULL DEFAULT 'Portal',
  impact                TINYINT UNSIGNED NOT NULL DEFAULT 2,
  urgency               TINYINT UNSIGNED NOT NULL DEFAULT 2,
  priority              TINYINT UNSIGNED NOT NULL DEFAULT 3,
  status                VARCHAR(30)  NOT NULL DEFAULT 'New',
  hold_reason           VARCHAR(60)  NULL,
  is_major              TINYINT(1)   NOT NULL DEFAULT 0,
  sla_response_due_at   DATETIME(3)  NOT NULL,
  sla_resolution_due_at DATETIME(3)  NOT NULL,
  paused_at             DATETIME(3)  NULL,
  paused_seconds        INT UNSIGNED NOT NULL DEFAULT 0,
  first_response_at     DATETIME(3)  NULL,
  resolved_at           DATETIME(3)  NULL,
  closed_at             DATETIME(3)  NULL,
  resolution_code       VARCHAR(60)  NULL,
  resolution_notes      TEXT         NULL,
  csat                  TINYINT UNSIGNED NULL,
  reopened_count        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  asset_id              INT UNSIGNED NULL,
  problem_id            INT UNSIGNED NULL,
  change_id             INT UNSIGNED NULL,
  parent_ticket_id      BIGINT UNSIGNED NULL,
  request_id            INT UNSIGNED NULL,
  catalog_item_id       SMALLINT UNSIGNED NULL,
  created_by            INT UNSIGNED NULL,
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at            DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tickets_number (ticket_number),
  KEY idx_tickets_status (status),
  KEY idx_tickets_priority (priority),
  KEY idx_tickets_assigned_to (assigned_to),
  KEY idx_tickets_created_at (created_at),
  KEY idx_tickets_category (category_id),
  KEY idx_tickets_team (team_id),
  KEY idx_tickets_customer (customer_id),
  KEY idx_tickets_requester (requester_id),
  KEY idx_tickets_kind_status (kind, status),
  KEY idx_tickets_resolved_at (resolved_at),
  KEY idx_tickets_updated_at (updated_at),
  KEY idx_tickets_asset (asset_id),
  KEY idx_tickets_problem (problem_id),
  KEY idx_tickets_change (change_id),
  KEY idx_tickets_request (request_id),
  KEY idx_tickets_parent (parent_ticket_id),
  FULLTEXT KEY ft_tickets_title (title),
  CONSTRAINT chk_tickets_status CHECK (status IN ('New','In Progress','On Hold','Awaiting approval','Resolved','Closed')),
  CONSTRAINT chk_tickets_impact CHECK (impact BETWEEN 1 AND 3),
  CONSTRAINT chk_tickets_urgency CHECK (urgency BETWEEN 1 AND 3),
  CONSTRAINT chk_tickets_csat CHECK (csat IS NULL OR csat BETWEEN 1 AND 5),
  CONSTRAINT fk_tickets_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_tickets_requester FOREIGN KEY (requester_id) REFERENCES people (id),
  CONSTRAINT fk_tickets_category FOREIGN KEY (category_id) REFERENCES ticket_categories (id),
  CONSTRAINT fk_tickets_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_assigned_to FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_priority FOREIGN KEY (priority) REFERENCES priorities (id),
  CONSTRAINT fk_tickets_asset FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_problem FOREIGN KEY (problem_id) REFERENCES problems (id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_change FOREIGN KEY (change_id) REFERENCES changes (id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_parent FOREIGN KEY (parent_ticket_id) REFERENCES tickets (id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_request FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_catalog_item FOREIGN KEY (catalog_item_id) REFERENCES catalog_items (id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_tags (
  ticket_id BIGINT UNSIGNED NOT NULL,
  tag       VARCHAR(60) NOT NULL,
  PRIMARY KEY (ticket_id, tag),
  KEY idx_ticket_tags_tag (tag),
  CONSTRAINT fk_ticket_tags_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Replies to the requester ('comment') and agent-only work notes ('note').
CREATE TABLE IF NOT EXISTS ticket_comments (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id  BIGINT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NULL,
  type       ENUM('comment','note') NOT NULL DEFAULT 'comment',
  body       TEXT        NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ticket_comments_ticket (ticket_id, created_at),
  CONSTRAINT fk_ticket_comments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_comments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- System timeline entries ("Assigned to ...", "State changed ...").
CREATE TABLE IF NOT EXISTS ticket_activities (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id  BIGINT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NULL,
  body       TEXT        NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ticket_activities_ticket (ticket_id, created_at),
  CONSTRAINT fk_ticket_activities_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_activities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Field-level change history (old value -> new value).
CREATE TABLE IF NOT EXISTS ticket_history (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id  BIGINT UNSIGNED NOT NULL,
  field      VARCHAR(40) NOT NULL,
  old_value  TEXT        NULL,
  new_value  TEXT        NULL,
  changed_by INT UNSIGNED NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ticket_history_ticket (ticket_id, changed_at),
  CONSTRAINT fk_ticket_history_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_history_user FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS major_incidents (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  mi_number    VARCHAR(20)  NOT NULL,
  ticket_id    BIGINT UNSIGNED NOT NULL,
  title        VARCHAR(255) NOT NULL,
  status       ENUM('Active','Resolved') NOT NULL DEFAULT 'Active',
  commander_id INT UNSIGNED NULL,
  impact       TEXT         NOT NULL,
  started_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at  DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_major_incidents_number (mi_number),
  KEY idx_major_incidents_status (status),
  KEY idx_major_incidents_ticket (ticket_id),
  CONSTRAINT fk_major_incidents_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id),
  CONSTRAINT fk_major_incidents_commander FOREIGN KEY (commander_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS major_incident_updates (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  major_incident_id INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NULL,
  body              TEXT        NOT NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_mi_updates_mi (major_incident_id, created_at),
  CONSTRAINT fk_mi_updates_mi FOREIGN KEY (major_incident_id) REFERENCES major_incidents (id) ON DELETE CASCADE,
  CONSTRAINT fk_mi_updates_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 012_create_request_items.sql =====================
-- Order items of a service request and the answers given on the catalog form.

CREATE TABLE IF NOT EXISTS request_items (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id      INT UNSIGNED NOT NULL,
  ticket_id       BIGINT UNSIGNED NOT NULL,
  catalog_item_id SMALLINT UNSIGNED NULL,
  line_no         SMALLINT UNSIGNED NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_request_items_ticket (ticket_id),
  UNIQUE KEY uq_request_items_line (request_id, line_no),
  KEY idx_request_items_catalog (catalog_item_id),
  CONSTRAINT fk_request_items_request FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_request_items_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
  CONSTRAINT fk_request_items_catalog FOREIGN KEY (catalog_item_id) REFERENCES catalog_items (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_item_values (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_item_id INT UNSIGNED NOT NULL,
  field_key       VARCHAR(40)  NOT NULL,
  label           VARCHAR(120) NOT NULL,
  value           TEXT         NULL,
  sort_order      SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_request_item_values_key (request_item_id, field_key),
  CONSTRAINT fk_request_item_values_item FOREIGN KEY (request_item_id) REFERENCES request_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 013_create_tasks.sql =====================
-- Tasks: stand-alone, or children of a ticket, problem or change.
-- Exactly zero or one parent foreign key is set (enforced by CHECK).

CREATE TABLE IF NOT EXISTS tasks (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_number   VARCHAR(20)  NOT NULL,
  type          ENUM('Task','Incident task','Catalog task','Change task','Problem task') NOT NULL DEFAULT 'Task',
  ticket_id     BIGINT UNSIGNED NULL,
  problem_id    INT UNSIGNED NULL,
  change_id     INT UNSIGNED NULL,
  title         VARCHAR(255) NOT NULL,
  description   TEXT         NULL,
  state         VARCHAR(20)  NOT NULL DEFAULT 'Ready',
  priority      TINYINT UNSIGNED NOT NULL DEFAULT 3,
  assigned_to   INT UNSIGNED NULL,
  team_id       INT UNSIGNED NULL,
  due_at        DATETIME(3)  NULL,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_sequential TINYINT(1)   NOT NULL DEFAULT 0,
  closed_at     DATETIME(3)  NULL,
  close_notes   TEXT         NULL,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_tasks_number (task_number),
  KEY idx_tasks_ticket (ticket_id, sort_order),
  KEY idx_tasks_problem (problem_id, sort_order),
  KEY idx_tasks_change (change_id, sort_order),
  KEY idx_tasks_assigned_state (assigned_to, state),
  KEY idx_tasks_state (state),
  KEY idx_tasks_team (team_id),
  KEY idx_tasks_due (due_at),
  CONSTRAINT chk_tasks_state CHECK (state IN ('Waiting','Ready','In progress','Done','Not done','Not needed')),
  CONSTRAINT chk_tasks_single_parent CHECK ((ticket_id IS NOT NULL) + (problem_id IS NOT NULL) + (change_id IS NOT NULL) <= 1),
  CONSTRAINT fk_tasks_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_problem FOREIGN KEY (problem_id) REFERENCES problems (id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_change FOREIGN KEY (change_id) REFERENCES changes (id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_priority FOREIGN KEY (priority) REFERENCES priorities (id),
  CONSTRAINT fk_tasks_assigned_to FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agent work notes on a task.
CREATE TABLE IF NOT EXISTS task_comments (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NULL,
  body       TEXT        NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_task_comments_task (task_id, created_at),
  CONSTRAINT fk_task_comments_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_task_comments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- System history of a task (state changes, assignment).
CREATE TABLE IF NOT EXISTS task_activities (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NULL,
  body       TEXT        NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_task_activities_task (task_id, created_at),
  CONSTRAINT fk_task_activities_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_task_activities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 014_create_approvals.sql =====================
-- Reusable approval records. An approval belongs to a ticket (request order
-- item, "Line manager") or to a change (one row per CAB approver).
-- change_approvals is a read-only view over the change rows.

CREATE TABLE IF NOT EXISTS approvals (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  approval_type ENUM('request','change') NOT NULL,
  ticket_id     BIGINT UNSIGNED NULL,
  change_id     INT UNSIGNED NULL,
  approver_id   INT UNSIGNED NULL,
  approver_role VARCHAR(60)  NOT NULL,
  status        ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  is_requested  TINYINT(1)   NOT NULL DEFAULT 1,
  comment       TEXT         NULL,
  decided_by    INT UNSIGNED NULL,
  decided_at    DATETIME(3)  NULL,
  sort_order    SMALLINT     NOT NULL DEFAULT 0,
  requested_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_approvals_ticket (ticket_id),
  KEY idx_approvals_change (change_id, sort_order),
  KEY idx_approvals_approver_status (approver_id, status),
  KEY idx_approvals_status (status, approval_type),
  KEY idx_approvals_decided (decided_at),
  CONSTRAINT chk_approvals_target CHECK ((approval_type = 'request' AND ticket_id IS NOT NULL AND change_id IS NULL)
                                      OR (approval_type = 'change' AND change_id IS NOT NULL AND ticket_id IS NULL)),
  CONSTRAINT fk_approvals_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
  CONSTRAINT fk_approvals_change FOREIGN KEY (change_id) REFERENCES changes (id) ON DELETE CASCADE,
  CONSTRAINT fk_approvals_approver FOREIGN KEY (approver_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_approvals_decided_by FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW change_approvals AS
  SELECT id, change_id, approver_id, approver_role, status, is_requested, comment,
         decided_by, decided_at, sort_order, requested_at
    FROM approvals
   WHERE approval_type = 'change';

-- ===================== 015_create_attachments.sql =====================
-- File attachment metadata. The file bytes live on disk under a random name
-- outside any public directory; downloads go through an authorised endpoint.
-- One table serves tickets, problems, changes and tasks; ticket_attachments is
-- a convenience view.

CREATE TABLE IF NOT EXISTS attachments (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type   ENUM('ticket','problem','change','task') NOT NULL,
  entity_id     BIGINT UNSIGNED NOT NULL,
  comment_id    BIGINT UNSIGNED NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name   CHAR(36)     NOT NULL,
  mime_type     VARCHAR(120) NOT NULL,
  extension     VARCHAR(20)  NOT NULL,
  size_bytes    INT UNSIGNED NOT NULL,
  sha256        CHAR(64)     NOT NULL,
  uploaded_by   INT UNSIGNED NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at    DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attachments_stored_name (stored_name),
  KEY idx_attachments_entity (entity_type, entity_id),
  KEY idx_attachments_comment (comment_id),
  CONSTRAINT fk_attachments_comment FOREIGN KEY (comment_id) REFERENCES ticket_comments (id) ON DELETE SET NULL,
  CONSTRAINT fk_attachments_user FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_attachments_size CHECK (size_bytes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW ticket_attachments AS
  SELECT id, entity_id AS ticket_id, comment_id, original_name, mime_type, extension,
         size_bytes, sha256, uploaded_by, created_at
    FROM attachments
   WHERE entity_type = 'ticket' AND deleted_at IS NULL;

-- ===================== 016_create_knowledge_base.sql =====================
-- Knowledge base articles, categories, tags, votes and per-user daily views.

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(80) NOT NULL,
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_knowledge_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_number    VARCHAR(20)  NOT NULL,
  title             VARCHAR(255) NOT NULL,
  category_id       SMALLINT UNSIGNED NOT NULL,
  audience          ENUM('Public','Internal') NOT NULL DEFAULT 'Public',
  status            ENUM('Draft','Published','Archived') NOT NULL DEFAULT 'Draft',
  body              MEDIUMTEXT   NOT NULL,
  view_count        INT UNSIGNED NOT NULL DEFAULT 0,
  helpful_count     INT UNSIGNED NOT NULL DEFAULT 0,
  not_helpful_count INT UNSIGNED NOT NULL DEFAULT 0,
  author_id         INT UNSIGNED NULL,
  published_at      DATETIME(3)  NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at        DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_knowledge_articles_number (article_number),
  KEY idx_knowledge_articles_status (status, audience),
  KEY idx_knowledge_articles_category (category_id),
  KEY idx_knowledge_articles_views (view_count),
  FULLTEXT KEY ft_knowledge_articles (title, body),
  CONSTRAINT fk_knowledge_articles_category FOREIGN KEY (category_id) REFERENCES knowledge_categories (id),
  CONSTRAINT fk_knowledge_articles_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_article_tags (
  article_id INT UNSIGNED NOT NULL,
  tag        VARCHAR(60) NOT NULL,
  PRIMARY KEY (article_id, tag),
  KEY idx_knowledge_article_tags_tag (tag),
  CONSTRAINT fk_kb_tags_article FOREIGN KEY (article_id) REFERENCES knowledge_articles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_article_votes (
  article_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  is_helpful TINYINT(1)   NOT NULL,
  voted_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (article_id, user_id),
  CONSTRAINT fk_kb_votes_article FOREIGN KEY (article_id) REFERENCES knowledge_articles (id) ON DELETE CASCADE,
  CONSTRAINT fk_kb_votes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per user per article per day, so refreshing a page does not inflate
-- the view count.
CREATE TABLE IF NOT EXISTS knowledge_article_views (
  article_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  view_date  DATE         NOT NULL,
  PRIMARY KEY (article_id, user_id, view_date),
  CONSTRAINT fk_kb_views_article FOREIGN KEY (article_id) REFERENCES knowledge_articles (id) ON DELETE CASCADE,
  CONSTRAINT fk_kb_views_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 017_create_notifications.sql =====================
-- Per-user notifications (assignment, approval requests, major incidents,
-- SLA warnings). dedupe_key stops background jobs from notifying twice.

CREATE TABLE IF NOT EXISTS notifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  type       VARCHAR(40)  NOT NULL,
  severity   ENUM('info','warn','bad') NOT NULL DEFAULT 'info',
  title      VARCHAR(255) NOT NULL,
  link       VARCHAR(255) NULL,
  dedupe_key VARCHAR(120) NULL,
  is_read    TINYINT(1)   NOT NULL DEFAULT 0,
  read_at    DATETIME(3)  NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_dedupe (user_id, dedupe_key),
  KEY idx_notifications_user (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================== 018_create_audit_logs.sql =====================
-- Append-only audit trail. Triggers reject UPDATE and DELETE so entries cannot
-- be altered from the application or from ad-hoc SQL by mistake.

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL,
  action      VARCHAR(160) NOT NULL,
  entity_type VARCHAR(40)  NOT NULL,
  entity_id   VARCHAR(40)  NULL,
  entity_ref  VARCHAR(60)  NULL,
  old_values  LONGTEXT     NULL CHECK (old_values IS NULL OR JSON_VALID(old_values)),
  new_values  LONGTEXT     NULL CHECK (new_values IS NULL OR JSON_VALID(new_values)),
  ip_address  VARCHAR(45)  NULL,
  user_agent  VARCHAR(255) NULL,
  request_id  CHAR(36)     NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_logs_user (user_id),
  KEY idx_audit_logs_created (created_at),
  KEY idx_audit_logs_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS trg_audit_logs_no_update;
DROP TRIGGER IF EXISTS trg_audit_logs_no_delete;

DELIMITER $$
CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';
END$$

CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only';
END$$
DELIMITER ;

-- ===================== 019_create_report_schedules.sql =====================
-- Scheduled report definitions (shown on the Reports page).

CREATE TABLE IF NOT EXISTS report_schedules (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  frequency  ENUM('Daily','Weekly','Monthly') NOT NULL DEFAULT 'Weekly',
  format     ENUM('PDF','CSV') NOT NULL DEFAULT 'PDF',
  recipient  VARCHAR(190) NOT NULL,
  run_when   VARCHAR(60)  NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_report_schedules_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
