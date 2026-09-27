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
