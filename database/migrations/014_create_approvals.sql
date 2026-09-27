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
