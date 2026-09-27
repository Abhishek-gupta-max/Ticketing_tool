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
