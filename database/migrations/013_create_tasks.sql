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
