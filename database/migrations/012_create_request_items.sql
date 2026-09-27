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
