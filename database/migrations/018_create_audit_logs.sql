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
