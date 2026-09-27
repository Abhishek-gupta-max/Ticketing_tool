-- Scheduled report definitions (shown on the Reports page).

CREATE TABLE IF NOT EXISTS report_schedules (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120) NOT NULL,
  frequency  ENUM('Daily','Weekly','Monthly') NOT NULL DEFAULT 'Weekly',
  format     ENUM('PDF','CSV') NOT NULL DEFAULT 'PDF',
  recipient  VARCHAR(190) NOT NULL,
  run_when   VARCHAR(60)  NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_report_schedules_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
