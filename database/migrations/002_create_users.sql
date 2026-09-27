-- Login accounts. Agents, managers, admins and customer portal users all sign in
-- through this table. Passwords are stored as bcrypt hashes only.
-- token_version is embedded in every JWT; bumping it invalidates all sessions.

CREATE TABLE IF NOT EXISTS users (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id                SMALLINT UNSIGNED NOT NULL,
  name                   VARCHAR(120) NOT NULL,
  email                  VARCHAR(190) NOT NULL,
  password_hash          VARCHAR(255) NOT NULL,
  status                 ENUM('active','inactive','locked') NOT NULL DEFAULT 'active',
  token_version          INT UNSIGNED NOT NULL DEFAULT 0,
  failed_login_count     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until           DATETIME(3) NULL,
  last_login_at          DATETIME(3) NULL,
  password_changed_at    DATETIME(3) NULL,
  reset_token_hash       CHAR(64) NULL,
  reset_token_expires_at DATETIME(3) NULL,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at             DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_reset_token (reset_token_hash),
  KEY idx_users_role (role_id),
  KEY idx_users_status (status),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
