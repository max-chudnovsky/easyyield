-- Additional indexes from second batch of D1 query insights.

-- /api/blog/posts.ts (and similar): WHERE status='published' ORDER BY featured DESC, published_at DESC
-- Existing idx_articles_status only covers the filter, not the sort.
CREATE INDEX IF NOT EXISTS idx_articles_status_featured_published
  ON articles(status, featured, published_at);

-- analytics_sessions cleanup/listing/source-breakdown queries:
--   DELETE ... WHERE started_at < date('now', '-180 days')
--   SELECT ... ORDER BY started_at DESC LIMIT ?
--   SELECT referrer, COUNT(*) ... WHERE started_at >= datetime('now', ?) GROUP BY referrer
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_started_at
  ON analytics_sessions(started_at);

-- Admin "all pageviews" overview: WHERE pv.type = 'page' GROUP BY pv.path
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_type_path
  ON analytics_pageviews(type, path);
