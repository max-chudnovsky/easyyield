-- myblogcenter article tables for Velesco
-- Mirrors touringstar 0035-0040+0055 schema

CREATE TABLE IF NOT EXISTS article_keyword_targets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword          TEXT NOT NULL,
  location         TEXT NOT NULL DEFAULT '',
  intent_class     TEXT NOT NULL DEFAULT 'informational',
  funnel_stage     TEXT NOT NULL DEFAULT 'awareness',
  priority         INTEGER NOT NULL DEFAULT 50,
  active           INTEGER NOT NULL DEFAULT 1,
  last_published_at TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS article_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  structure   TEXT NOT NULL DEFAULT '{}',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS articles (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  markdown_content    TEXT NOT NULL DEFAULT '',
  text_block_one      TEXT NOT NULL DEFAULT '',
  text_block_two      TEXT NOT NULL DEFAULT '',
  featured_image_path TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'draft',
  target_keyword      TEXT NOT NULL DEFAULT '',
  intent_class        TEXT NOT NULL DEFAULT 'informational',
  funnel_stage        TEXT NOT NULL DEFAULT 'awareness',
  tags                TEXT NOT NULL DEFAULT '[]',
  quality_score       INTEGER NOT NULL DEFAULT 80,
  published_at        TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS article_translations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id       INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  language_code    TEXT NOT NULL,
  title            TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  markdown_content TEXT NOT NULL DEFAULT '',
  provider         TEXT NOT NULL DEFAULT '',
  model            TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(article_id, language_code)
);

CREATE TABLE IF NOT EXISTS article_generation_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key          TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending',
  topic            TEXT NOT NULL DEFAULT '',
  article_id       INTEGER REFERENCES articles(id),
  quality_score    INTEGER,
  model_used       TEXT,
  error            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at      TEXT
);

CREATE TABLE IF NOT EXISTS page_view_daily (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  day     TEXT NOT NULL,
  path    TEXT NOT NULL,
  views   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(day, path)
);

CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_article_kw_active ON article_keyword_targets(active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_page_view_daily_day ON page_view_daily(day, path);
