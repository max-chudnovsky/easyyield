-- Canonical cms-blog schema unification (shared across touringstar, velesco, milkplays).
-- See /home/max/velesco/shared/packages/cms-blog/migrations/0002_unify_articles_schema.sql
-- for the generic reference shape (used as-is by milkplays). velesco's actual
-- production schema diverged from that baseline, so this migration is adapted:
--   - velesco's `articles` already has `text_block_one`/`text_block_two`
--     columns (like touringstar did) - these are dropped, not part of the
--     canonical schema (multi-image articles use `inline_images`/`<img_N>`).
--   - velesco already has an `article_translations` table, but in an older
--     shape (language_code, no slug, provider/model columns) - this is
--     reshaped into the new canonical (article_id, lang_code, slug, ...)
--     shape, preserved as `article_translations_legacy` for reference.
--   - velesco already has `article_generation_runs`/`article_keyword_targets`
--     tables (different shape than the canonical reference) - left as-is
--     (IF NOT EXISTS no-ops); only `article_image_reference` is new.

PRAGMA foreign_keys = OFF;

-- 0. Move the legacy per-language table aside.
ALTER TABLE article_translations RENAME TO article_translations_legacy;

-- 1. Create the canonical core `articles` table and copy language-independent data.
CREATE TABLE articles_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'qa_pending', 'approved', 'published', 'archived')),
  featured_image_path TEXT,
  inline_images TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  target_keyword TEXT,
  intent_class TEXT,
  funnel_stage TEXT,
  quality_score REAL,
  qa_scores_json TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  template_key TEXT,
  tour_id INTEGER,
  scope_type TEXT NOT NULL DEFAULT 'destination',
  canonical_topic_key TEXT,
  region TEXT,
  location TEXT,
  primary_angle TEXT,
  activity_type TEXT,
  angle_sector TEXT,
  country_code TEXT,
  event_name TEXT,
  event_month INTEGER,
  event_day INTEGER,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO articles_new (
  id, status, featured_image_path, inline_images, tags, target_keyword,
  intent_class, funnel_stage, quality_score, featured, published_at,
  created_at, updated_at
)
SELECT
  id, status, featured_image_path, COALESCE(inline_images, '[]'), tags, target_keyword,
  intent_class, funnel_stage, quality_score, featured, published_at,
  created_at, updated_at
FROM articles;

-- 2. Create the canonical per-language content table (FK target rewritten to
--    `articles` once articles_new is renamed below).
CREATE TABLE article_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles_new(id) ON DELETE CASCADE,
  lang_code TEXT NOT NULL DEFAULT 'en',
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  markdown_content TEXT NOT NULL DEFAULT '',
  html_content TEXT,
  meta_title TEXT,
  meta_description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(article_id, lang_code)
);

-- 2a. Existing article content (velesco's `articles` had its own
--     slug/title/description/markdown_content) becomes the 'en' translation.
INSERT INTO article_translations (
  article_id, lang_code, slug, title, description, markdown_content,
  html_content, created_at, updated_at
)
SELECT
  id, 'en', slug, title, description, markdown_content, NULL, created_at, updated_at
FROM articles;

-- 2b. Migrate existing non-English translations from the legacy table.
INSERT INTO article_translations (
  article_id, lang_code, slug, title, description, markdown_content,
  html_content, created_at, updated_at
)
SELECT
  t.article_id, t.language_code,
  (SELECT a.slug FROM articles a WHERE a.id = t.article_id) || '-' || t.language_code,
  t.title, t.description, t.markdown_content, NULL, t.created_at, t.updated_at
FROM article_translations_legacy t
WHERE t.language_code != 'en';

-- 3. Swap articles for the canonical core table. `article_comments`,
--    `article_generation_runs`, `article_keyword_targets` keep referencing
--    "articles" by name (unaffected by this rename); the article_translations
--    FK above is rewritten from articles_new to articles by this rename.
DROP TABLE articles;
ALTER TABLE articles_new RENAME TO articles;

PRAGMA foreign_keys = ON;

CREATE INDEX idx_articles_status_published ON articles(status, published_at DESC);
CREATE INDEX idx_articles_status_featured_published ON articles(status, featured, published_at);
CREATE INDEX idx_articles_keyword ON articles(target_keyword);
CREATE INDEX idx_articles_topic ON articles(canonical_topic_key);
CREATE INDEX idx_articles_tour ON articles(tour_id);
CREATE INDEX idx_articles_region ON articles(region);
CREATE INDEX idx_articles_location ON articles(location);
CREATE INDEX idx_articles_primary_angle ON articles(primary_angle);

CREATE INDEX idx_article_translations_slug ON article_translations(slug);
CREATE INDEX idx_article_translations_lang ON article_translations(lang_code);
CREATE INDEX idx_article_translations_article ON article_translations(article_id);

-- 4. Shared image pool table (new for velesco).
CREATE TABLE IF NOT EXISTS article_image_reference (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_key TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  country_code TEXT,
  region TEXT,
  location TEXT,
  activity TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  suggested_count INTEGER NOT NULL DEFAULT 0,
  last_suggested_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
