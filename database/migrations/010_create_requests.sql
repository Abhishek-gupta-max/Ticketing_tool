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
