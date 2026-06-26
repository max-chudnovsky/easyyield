-- Indexes to eliminate full-table-scans on the highest-cost D1 queries
-- (identified via Cloudflare D1 query insights — analytics aggregation
-- queries in /api/mbc/export and the per-pageview duration update).

-- /api/analytics/event.ts: UPDATE ... WHERE id = (SELECT id FROM analytics_pageviews
-- WHERE session_id = ? AND path = ? ORDER BY created_at DESC LIMIT 1)
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_session_path_created
  ON analytics_pageviews(session_id, path, created_at DESC);

-- /api/mbc/export.ts fetchSessionStats/fetchReferrers/fetchDeviceStats/fetchCountryStats:
-- WHERE path LIKE '/blog/%' AND created_at >= date('now', '-N days')
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_path_created
  ON analytics_pageviews(path, created_at);

-- /api/mbc/export.ts aggregatePageViewsDaily: WHERE created_at >= date('now', '-90 days')
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_created
  ON analytics_pageviews(created_at);
