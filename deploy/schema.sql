SET ROLE admin;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  username_key VARCHAR(32) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx
  ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  title_key TEXT NOT NULL UNIQUE,
  abstract TEXT NOT NULL DEFAULT '',
  authors TEXT[] NOT NULL DEFAULT '{}',
  publisher TEXT NOT NULL DEFAULT '机构待补充',
  category VARCHAR(32) NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  published_at DATE,
  source_url TEXT NOT NULL,
  external_id VARCHAR(128),
  imported_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT articles_category_check CHECK (
    category IN ('Ego第一人称', 'VLA', '世界模型', '强化学习')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS articles_external_id_idx
  ON articles(external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS articles_category_idx ON articles(category);
CREATE INDEX IF NOT EXISTS articles_published_at_idx ON articles(published_at DESC);

ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE articles ALTER COLUMN publisher SET DEFAULT '机构待补充';
UPDATE articles SET tags = ARRAY[category] WHERE CARDINALITY(tags) = 0;
UPDATE articles SET publisher = '机构待补充' WHERE LOWER(publisher) = 'arxiv';
UPDATE articles SET publisher = 'Physical Intelligence'
  WHERE LOWER(title) LIKE '%pi0.5%' OR title LIKE '%π0.5%';
CREATE INDEX IF NOT EXISTS articles_tags_idx ON articles USING GIN(tags);

CREATE TABLE IF NOT EXISTS reading_list (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS reading_list_user_created_idx
  ON reading_list(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS article_reads (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS article_reads_article_idx
  ON article_reads(article_id, read_at DESC);

INSERT INTO article_reads (user_id, article_id, read_at)
SELECT user_id, article_id, updated_at FROM reviews
ON CONFLICT (user_id, article_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS reading_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS reading_progress_user_updated_idx
  ON reading_progress(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(content)) > 0),
  review_type VARCHAR(8) NOT NULL DEFAULT 'long'
    CHECK (review_type IN ('short', 'long')),
  must_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS reviews_article_rating_idx
  ON reviews(article_id, rating DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_user_created_idx
  ON reviews(user_id, created_at DESC);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS review_type VARCHAR(8) NOT NULL DEFAULT 'long';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS must_read BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS app_migrations (
  migration_key TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH apply_once AS (
  INSERT INTO app_migrations (migration_key)
  VALUES ('2026-07-31-lcx-siyang-latest-reviews-short')
  ON CONFLICT (migration_key) DO NOTHING
  RETURNING migration_key
),
latest_reviews AS (
  SELECT DISTINCT ON (LOWER(users.username)) reviews.id
  FROM reviews
  INNER JOIN users ON users.id = reviews.user_id
  WHERE LOWER(users.username) IN ('lcx', 'siyang')
  ORDER BY LOWER(users.username), reviews.updated_at DESC, reviews.id DESC
)
UPDATE reviews
SET review_type = 'short'
WHERE reviews.id IN (SELECT id FROM latest_reviews)
  AND EXISTS (SELECT 1 FROM apply_once);

CREATE TABLE IF NOT EXISTS review_attachments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  content_type VARCHAR(32) NOT NULL,
  image_data BYTEA NOT NULL,
  note VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_attachments_review_idx
  ON review_attachments(review_id, id);

CREATE TABLE IF NOT EXISTS review_annotations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  quote TEXT NOT NULL DEFAULT '',
  translation TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(content)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_annotations_review_idx
  ON review_annotations(review_id, page_number, id);

CREATE TABLE IF NOT EXISTS review_likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, review_id)
);

CREATE INDEX IF NOT EXISTS review_likes_review_idx
  ON review_likes(review_id, created_at DESC);
