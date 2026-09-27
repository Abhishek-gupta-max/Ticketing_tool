-- Knowledge base articles, categories, tags, votes and per-user daily views.

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(80) NOT NULL,
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_knowledge_categories_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_number    VARCHAR(20)  NOT NULL,
  title             VARCHAR(255) NOT NULL,
  category_id       SMALLINT UNSIGNED NOT NULL,
  audience          ENUM('Public','Internal') NOT NULL DEFAULT 'Public',
  status            ENUM('Draft','Published','Archived') NOT NULL DEFAULT 'Draft',
  body              MEDIUMTEXT   NOT NULL,
  view_count        INT UNSIGNED NOT NULL DEFAULT 0,
  helpful_count     INT UNSIGNED NOT NULL DEFAULT 0,
  not_helpful_count INT UNSIGNED NOT NULL DEFAULT 0,
  author_id         INT UNSIGNED NULL,
  published_at      DATETIME(3)  NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at        DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_knowledge_articles_number (article_number),
  KEY idx_knowledge_articles_status (status, audience),
  KEY idx_knowledge_articles_category (category_id),
  KEY idx_knowledge_articles_views (view_count),
  FULLTEXT KEY ft_knowledge_articles (title, body),
  CONSTRAINT fk_knowledge_articles_category FOREIGN KEY (category_id) REFERENCES knowledge_categories (id),
  CONSTRAINT fk_knowledge_articles_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_article_tags (
  article_id INT UNSIGNED NOT NULL,
  tag        VARCHAR(60) NOT NULL,
  PRIMARY KEY (article_id, tag),
  KEY idx_knowledge_article_tags_tag (tag),
  CONSTRAINT fk_kb_tags_article FOREIGN KEY (article_id) REFERENCES knowledge_articles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_article_votes (
  article_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  is_helpful TINYINT(1)   NOT NULL,
  voted_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (article_id, user_id),
  CONSTRAINT fk_kb_votes_article FOREIGN KEY (article_id) REFERENCES knowledge_articles (id) ON DELETE CASCADE,
  CONSTRAINT fk_kb_votes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per user per article per day, so refreshing a page does not inflate
-- the view count.
CREATE TABLE IF NOT EXISTS knowledge_article_views (
  article_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  view_date  DATE         NOT NULL,
  PRIMARY KEY (article_id, user_id, view_date),
  CONSTRAINT fk_kb_views_article FOREIGN KEY (article_id) REFERENCES knowledge_articles (id) ON DELETE CASCADE,
  CONSTRAINT fk_kb_views_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
