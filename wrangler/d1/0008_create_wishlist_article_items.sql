-- D1 migration: create article favorites table
CREATE TABLE IF NOT EXISTS wishlist_article_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, article_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (article_id) REFERENCES blog_posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wishlist_article_user ON wishlist_article_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_article_article ON wishlist_article_items(article_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_article_created_at ON wishlist_article_items(created_at DESC);
