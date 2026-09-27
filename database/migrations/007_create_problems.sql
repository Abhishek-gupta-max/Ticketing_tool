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
