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
