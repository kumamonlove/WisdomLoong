SET ROLE admin;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  username_key VARCHAR(32) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS visibility_groups (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_key VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_visibility_groups (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility_group_id INTEGER NOT NULL REFERENCES visibility_groups(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, visibility_group_id)
);

CREATE INDEX IF NOT EXISTS user_visibility_groups_group_idx
  ON user_visibility_groups(visibility_group_id, user_id);

CREATE TABLE IF NOT EXISTS registration_invite_codes (
  code_hash CHAR(64) PRIMARY KEY,
  visibility_group_id INTEGER NOT NULL REFERENCES visibility_groups(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION can_users_share_content(
  viewer_user_id INTEGER,
  author_user_id INTEGER
) RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_visibility_groups viewer_group
    INNER JOIN user_visibility_groups author_group
      ON author_group.visibility_group_id = viewer_group.visibility_group_id
    WHERE viewer_group.user_id = viewer_user_id
      AND author_group.user_id = author_user_id
  );
$$;

INSERT INTO visibility_groups (group_key, display_name)
VALUES
  ('zujiansuanfa', 'ZUJIANSUANFA'),
  ('hihihi', 'HIHIHI')
ON CONFLICT (group_key) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO user_visibility_groups (user_id, visibility_group_id)
SELECT user_visibility_groups.user_id, target_group.id
FROM user_visibility_groups
INNER JOIN visibility_groups source_group
  ON source_group.id = user_visibility_groups.visibility_group_id
CROSS JOIN visibility_groups target_group
WHERE source_group.group_key = 'ordinary'
  AND target_group.group_key = 'zujiansuanfa'
ON CONFLICT DO NOTHING;

DELETE FROM visibility_groups WHERE group_key = 'ordinary';

INSERT INTO user_visibility_groups (user_id, visibility_group_id)
SELECT users.id, visibility_groups.id
FROM users
CROSS JOIN visibility_groups
WHERE visibility_groups.group_key = 'zujiansuanfa'
  AND NOT EXISTS (
    SELECT 1 FROM user_visibility_groups
    WHERE user_visibility_groups.user_id = users.id
  )
ON CONFLICT DO NOTHING;

INSERT INTO user_visibility_groups (user_id, visibility_group_id)
SELECT users.id, visibility_groups.id
FROM users
CROSS JOIN visibility_groups
WHERE users.username_key IN ('liuyanwen', 'siyang', 'qianxi')
  AND visibility_groups.group_key IN ('zujiansuanfa', 'hihihi')
ON CONFLICT DO NOTHING;

INSERT INTO registration_invite_codes (code_hash, visibility_group_id, enabled)
SELECT invite.code_hash, visibility_groups.id, TRUE
FROM (VALUES
  ('25bbe6f318e65eff211350fe232ae0bd7b6680b16b454485f67c611ed7a50b77', 'hihihi'),
  ('4ee37d5c68f2706e10c036f1bde0d1702e671316d19990024c125876443ed92e', 'zujiansuanfa')
) AS invite(code_hash, group_key)
INNER JOIN visibility_groups ON visibility_groups.group_key = invite.group_key
ON CONFLICT (code_hash) DO UPDATE SET
  visibility_group_id = EXCLUDED.visibility_group_id,
  enabled = TRUE;

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
  abstract_zh TEXT NOT NULL DEFAULT '',
  authors TEXT[] NOT NULL DEFAULT '{}',
  publisher TEXT NOT NULL DEFAULT '机构待补充',
  category VARCHAR(32) NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  published_at DATE,
  source_url TEXT NOT NULL,
  external_id VARCHAR(128),
  imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
ALTER TABLE articles ADD COLUMN IF NOT EXISTS abstract_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS abstract_translation_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS abstract_translation_next_attempt_at TIMESTAMPTZ;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS abstract_translation_last_error TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ALTER COLUMN publisher SET DEFAULT '机构待补充';
ALTER TABLE articles ALTER COLUMN imported_by DROP NOT NULL;
ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_imported_by_fkey;
ALTER TABLE articles
  ADD CONSTRAINT articles_imported_by_fkey
  FOREIGN KEY (imported_by) REFERENCES users(id) ON DELETE SET NULL;
UPDATE articles SET tags = ARRAY[category] WHERE CARDINALITY(tags) = 0;
UPDATE articles SET publisher = '机构待补充' WHERE LOWER(publisher) = 'arxiv';
UPDATE articles SET publisher = 'Physical Intelligence'
  WHERE LOWER(title) LIKE '%pi0.5%' OR title LIKE '%π0.5%';
CREATE INDEX IF NOT EXISTS articles_tags_idx ON articles USING GIN(tags);

CREATE TABLE IF NOT EXISTS knowledge_graph_domains (
  domain TEXT PRIMARY KEY,
  narrative TEXT NOT NULL DEFAULT '',
  status VARCHAR(12) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'error')),
  article_count INTEGER NOT NULL DEFAULT 0,
  analysis_version INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE knowledge_graph_domains
  ADD COLUMN IF NOT EXISTS analysis_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
  domain TEXT NOT NULL REFERENCES knowledge_graph_domains(domain) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  contribution TEXT NOT NULL DEFAULT '',
  lineage_reason TEXT NOT NULL DEFAULT '',
  parent_article_ids INTEGER[] NOT NULL DEFAULT '{}',
  analysis_source VARCHAR(16) NOT NULL DEFAULT 'title'
    CHECK (analysis_source IN ('title', 'abstract', 'fulltext')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (domain, article_id)
);

CREATE INDEX IF NOT EXISTS knowledge_graph_nodes_article_idx
  ON knowledge_graph_nodes(article_id);

CREATE TABLE IF NOT EXISTS knowledge_graph_canvas_nodes (
  domain TEXT NOT NULL,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  position_x INTEGER NOT NULL DEFAULT 80 CHECK (position_x BETWEEN 0 AND 7500),
  position_y INTEGER NOT NULL DEFAULT 80 CHECK (position_y BETWEEN 0 AND 7500),
  note TEXT NOT NULL DEFAULT '',
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (domain, article_id)
);

CREATE TABLE IF NOT EXISTS knowledge_graph_canvas_edges (
  id BIGSERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  source_article_id INTEGER NOT NULL,
  target_article_id INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT knowledge_graph_canvas_edges_distinct CHECK (source_article_id <> target_article_id),
  CONSTRAINT knowledge_graph_canvas_edges_source_fkey
    FOREIGN KEY (domain, source_article_id)
    REFERENCES knowledge_graph_canvas_nodes(domain, article_id) ON DELETE CASCADE,
  CONSTRAINT knowledge_graph_canvas_edges_target_fkey
    FOREIGN KEY (domain, target_article_id)
    REFERENCES knowledge_graph_canvas_nodes(domain, article_id) ON DELETE CASCADE,
  CONSTRAINT knowledge_graph_canvas_edges_unique
    UNIQUE (domain, source_article_id, target_article_id)
);

CREATE INDEX IF NOT EXISTS knowledge_graph_canvas_edges_domain_idx
  ON knowledge_graph_canvas_edges(domain);

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
  position_y REAL NOT NULL DEFAULT 0 CHECK (position_y >= 0 AND position_y <= 100),
  position_x REAL NOT NULL DEFAULT 0 CHECK (position_x >= 0 AND position_x <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, article_id)
);

ALTER TABLE reading_progress ADD COLUMN IF NOT EXISTS position_y REAL NOT NULL DEFAULT 0;
ALTER TABLE reading_progress ADD COLUMN IF NOT EXISTS position_x REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS reading_progress_user_updated_idx
  ON reading_progress(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS article_recent_views (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS article_recent_views_user_viewed_idx
  ON article_recent_views(user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS article_recent_views_article_viewed_idx
  ON article_recent_views(article_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS reading_annotation_drafts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, article_id),
  CONSTRAINT reading_annotation_drafts_array_check CHECK (JSONB_TYPEOF(annotations) = 'array')
);

CREATE INDEX IF NOT EXISTS reading_annotation_drafts_updated_idx
  ON reading_annotation_drafts(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS published_annotations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  quote TEXT NOT NULL DEFAULT '',
  translation TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(content)) > 0),
  annotation_kind TEXT NOT NULL DEFAULT 'frame' CHECK (annotation_kind IN ('frame', 'highlight')),
  rect_x REAL NOT NULL,
  rect_y REAL NOT NULL,
  rect_width REAL NOT NULL,
  rect_height REAL NOT NULL,
  highlight_rects JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS published_annotations_article_idx
  ON published_annotations(article_id, page_number, id);

CREATE INDEX IF NOT EXISTS published_annotations_user_article_idx
  ON published_annotations(user_id, article_id);

CREATE TABLE IF NOT EXISTS annotation_comments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  published_annotation_id INTEGER REFERENCES published_annotations(id) ON DELETE CASCADE,
  review_annotation_id INTEGER,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(content)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT annotation_comments_single_target CHECK (
    (published_annotation_id IS NOT NULL)::int + (review_annotation_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS annotation_comments_published_idx
  ON annotation_comments(published_annotation_id, created_at, id);
CREATE INDEX IF NOT EXISTS annotation_comments_review_idx
  ON annotation_comments(review_annotation_id, created_at, id);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(content)) > 0),
  review_type VARCHAR(8) NOT NULL DEFAULT 'long'
    CHECK (review_type = 'long'),
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
ALTER TABLE reviews ALTER COLUMN rating DROP NOT NULL;

CREATE TABLE IF NOT EXISTS article_ratings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  must_read BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, article_id)
);

ALTER TABLE article_ratings ADD COLUMN IF NOT EXISTS must_read BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS article_ratings_article_idx
  ON article_ratings(article_id, rating DESC, updated_at DESC);

INSERT INTO article_ratings (user_id, article_id, rating, must_read, updated_at)
SELECT user_id, article_id, rating, must_read, updated_at FROM reviews
WHERE rating IS NOT NULL
ON CONFLICT (user_id, article_id) DO UPDATE SET
  rating = CASE
    WHEN EXCLUDED.updated_at >= article_ratings.updated_at THEN EXCLUDED.rating
    ELSE article_ratings.rating
  END,
  must_read = CASE
    WHEN EXCLUDED.updated_at >= article_ratings.updated_at THEN EXCLUDED.must_read
    ELSE article_ratings.must_read
  END,
  updated_at = GREATEST(article_ratings.updated_at, EXCLUDED.updated_at);

CREATE TABLE IF NOT EXISTS app_migrations (
  migration_key TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH apply_once AS (
  INSERT INTO app_migrations (migration_key)
  VALUES ('2026-07-31-pi05-must-read-v2')
  ON CONFLICT (migration_key) DO NOTHING
  RETURNING migration_key
),
pi05_reviews AS (
  SELECT DISTINCT ON (articles.id) reviews.id
  FROM reviews
  INNER JOIN articles ON articles.id = reviews.article_id
  WHERE LOWER(articles.title) LIKE '%pi0.5%'
     OR articles.title LIKE '%π0.5%'
     OR LOWER(articles.title) LIKE '%pi_{0.5}%'
     OR articles.title LIKE '%π_{0.5}%'
  ORDER BY articles.id, reviews.updated_at DESC, reviews.id DESC
)
UPDATE reviews
SET must_read = TRUE
WHERE reviews.id IN (SELECT id FROM pi05_reviews)
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
  rect_x REAL,
  rect_y REAL,
  rect_width REAL,
  rect_height REAL,
  annotation_kind TEXT NOT NULL DEFAULT 'frame' CHECK (annotation_kind IN ('frame', 'highlight')),
  highlight_rects JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE review_annotations ADD COLUMN IF NOT EXISTS rect_x REAL;
ALTER TABLE review_annotations ADD COLUMN IF NOT EXISTS rect_y REAL;
ALTER TABLE review_annotations ADD COLUMN IF NOT EXISTS rect_width REAL;
ALTER TABLE review_annotations ADD COLUMN IF NOT EXISTS rect_height REAL;
ALTER TABLE review_annotations ADD COLUMN IF NOT EXISTS annotation_kind TEXT NOT NULL DEFAULT 'frame';
ALTER TABLE review_annotations ADD COLUMN IF NOT EXISTS highlight_rects JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS review_annotations_review_idx
  ON review_annotations(review_id, page_number, id);

DO $$ BEGIN
  ALTER TABLE annotation_comments
    ADD CONSTRAINT annotation_comments_review_annotation_fk
    FOREIGN KEY (review_annotation_id) REFERENCES review_annotations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TABLE IF EXISTS review_annotation_likes;

CREATE TABLE IF NOT EXISTS reading_note_pdfs (
  review_id INTEGER PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
  file_name VARCHAR(180) NOT NULL,
  source VARCHAR(12) NOT NULL CHECK (source IN ('generated', 'uploaded')),
  pdf_data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reading_note_pdfs_updated_idx
  ON reading_note_pdfs(updated_at DESC);

CREATE TABLE IF NOT EXISTS reading_note_reads (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  first_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, review_id)
);

CREATE INDEX IF NOT EXISTS reading_note_reads_review_idx
  ON reading_note_reads(review_id, last_read_at DESC);

WITH apply_once AS (
  INSERT INTO app_migrations (migration_key)
  VALUES ('2026-08-03-remove-pre-v1.14-annotations')
  ON CONFLICT (migration_key) DO NOTHING
  RETURNING migration_key
)
DELETE FROM review_annotations
WHERE review_annotations.created_at < TIMESTAMPTZ '2026-08-03 02:09:03+00'
  AND EXISTS (SELECT 1 FROM apply_once);

WITH apply_once AS (
  INSERT INTO app_migrations (migration_key)
  VALUES ('2026-08-03-remove-page-only-annotations')
  ON CONFLICT (migration_key) DO NOTHING
  RETURNING migration_key
)
DELETE FROM review_annotations
WHERE (rect_x IS NULL OR rect_y IS NULL OR rect_width IS NULL OR rect_height IS NULL)
  AND EXISTS (SELECT 1 FROM apply_once);

UPDATE reviews SET review_type = 'long' WHERE review_type <> 'long';
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_review_type_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_review_type_check CHECK (review_type = 'long');

CREATE TABLE IF NOT EXISTS review_likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, review_id)
);

CREATE INDEX IF NOT EXISTS review_likes_review_idx
  ON review_likes(review_id, created_at DESC);

CREATE TABLE IF NOT EXISTS review_comments (
  id BIGSERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(content)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_comments_review_idx
  ON review_comments(review_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS review_comments_user_idx
  ON review_comments(user_id, created_at DESC);

DELETE FROM review_likes
WHERE NOT EXISTS (
  SELECT 1 FROM reading_note_pdfs WHERE reading_note_pdfs.review_id = review_likes.review_id
);

DO $$
DECLARE
  reset_applied BOOLEAN := FALSE;
  users_before INTEGER := 0;
  reviews_before INTEGER := 0;
  notes_before INTEGER := 0;
BEGIN
  INSERT INTO app_migrations (migration_key)
  VALUES ('2026-08-03-formal-launch-user-data-reset')
  ON CONFLICT (migration_key) DO NOTHING
  RETURNING TRUE INTO reset_applied;

  IF reset_applied THEN
    SELECT COUNT(*) INTO users_before FROM users;
    SELECT COUNT(*) INTO reviews_before FROM reviews;
    SELECT COUNT(*) INTO notes_before FROM reading_note_pdfs;

    DELETE FROM users;

    ALTER TABLE users ALTER COLUMN id RESTART WITH 1;
    ALTER TABLE reviews ALTER COLUMN id RESTART WITH 1;
    ALTER TABLE review_attachments ALTER COLUMN id RESTART WITH 1;
    ALTER TABLE review_annotations ALTER COLUMN id RESTART WITH 1;

    RAISE NOTICE 'Formal launch reset removed users=%, reviews=%, reading_note_pdfs=%',
      users_before, reviews_before, notes_before;
  END IF;
END $$;
