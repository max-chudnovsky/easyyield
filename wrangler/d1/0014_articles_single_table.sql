-- Migrate velesco to a single-table `articles` model (matches touringstar).
-- Adds the small set of columns needed to fold blog_posts into articles,
-- and creates article_comments (replacing blog_comments with an
-- articles.id-based FK).

ALTER TABLE articles ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN inline_images TEXT DEFAULT '[]';

CREATE TABLE IF NOT EXISTS article_comments (
  id TEXT PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  deleted_by TEXT,
  deleted_reason TEXT,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_article_comments_article_id ON article_comments(article_id);
