-- GSC analytics storage for daily SEO reporting

CREATE TABLE IF NOT EXISTS gsc_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  auth_source TEXT,
  start_date TEXT,
  end_date TEXT,
  rows_summary INTEGER NOT NULL DEFAULT 0,
  rows_queries INTEGER NOT NULL DEFAULT 0,
  rows_pages INTEGER NOT NULL DEFAULT 0,
  rows_countries INTEGER NOT NULL DEFAULT 0,
  rows_devices INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS gsc_daily_summary (
  day TEXT PRIMARY KEY,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gsc_daily_queries (
  day TEXT NOT NULL,
  query TEXT NOT NULL,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, query)
);

CREATE TABLE IF NOT EXISTS gsc_daily_pages (
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, page)
);

CREATE TABLE IF NOT EXISTS gsc_daily_countries (
  day TEXT NOT NULL,
  country TEXT NOT NULL,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, country)
);

CREATE TABLE IF NOT EXISTS gsc_daily_devices (
  day TEXT NOT NULL,
  device TEXT NOT NULL,
  clicks REAL NOT NULL DEFAULT 0,
  impressions REAL NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, device)
);

CREATE INDEX IF NOT EXISTS idx_gsc_daily_queries_day ON gsc_daily_queries(day);
CREATE INDEX IF NOT EXISTS idx_gsc_daily_pages_day ON gsc_daily_pages(day);
CREATE INDEX IF NOT EXISTS idx_gsc_daily_countries_day ON gsc_daily_countries(day);
CREATE INDEX IF NOT EXISTS idx_gsc_daily_devices_day ON gsc_daily_devices(day);
