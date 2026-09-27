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
