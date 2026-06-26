/**
 * erikred-mbc-sync: daily 2am cron
 * Assembles site state snapshot and POSTs to myblogcenter CF Worker.
 */

interface Env {
  DB: D1Database;
  MBC_DB: D1Database; // myblogcenter D1 (direct write, avoids worker-to-worker fetch restriction)
  AI: Ai;
  SITE_SLUG: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await pushToMyblogcenter(env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'POST' && new URL(request.url).pathname === '/trigger') {
      await pushToMyblogcenter(env);
      return Response.json({ ok: true });
    }
    return new Response('OK', { status: 200 });
  },
};

async function pushToMyblogcenter(env: Env): Promise<void> {
  console.log('[mbc-sync] Starting erikred daily sync');

  try {
    await syncGscAnalytics(env.DB);
  } catch (error) {
    console.error('[mbc-sync] GSC sync failed:', error);
  }

  try {
    await checkSubscriberNames(env.DB, env.AI);
  } catch (error) {
    console.error('[mbc-sync] Name check failed:', error);
  }

  // Daily: remove unverified subscribers whose 7-day grace has expired
  try {
    await purgeExpiredUnverified(env.DB);
  } catch (error) {
    console.error('[mbc-sync] Purge unverified failed:', error);
  }

  // Monthly (1st of month): send verification reminder to all unreminded unverified subscribers
  try {
    if (new Date().getUTCDate() === 1) {
      await sendVerificationReminders(env.DB);
    }
  } catch (error) {
    console.error('[mbc-sync] Verification reminders failed:', error);
  }

  // Aggregate raw pageviews into page_view_daily before fetching analytics
  try {
    await aggregatePageViewsDaily(env.DB);
  } catch (error) {
    console.error('[mbc-sync] Page view aggregation failed:', error);
  }

  // Clean up raw analytics older than 6 months
  await pruneOldAnalytics(env.DB);

  const [keywordTargets, articles, analytics, analyticsDaily, gscPages, gscQueries,
         sessionStats, referrers, devices, countries, comments] = await Promise.all([
    fetchKeywordTargets(env.DB),
    fetchArticles(env.DB),
    fetchAnalytics(env.DB),
    fetchAnalyticsDaily(env.DB),
    fetchGscPages(env.DB),
    fetchGscQueries(env.DB),
    fetchSessionStats(env.DB),
    fetchReferrers(env.DB),
    fetchDeviceStats(env.DB),
    fetchCountryStats(env.DB),
    fetchCommentStats(env.DB),
  ]);

  const payload = {
    seo_config: { keyword_targets: keywordTargets, templates: [], settings: {} },
    articles,
    analytics,
    analytics_daily: analyticsDaily,
    gsc_pages: gscPages,
    gsc_queries: gscQueries,
    session_stats: sessionStats,
    referrers,
    devices,
    countries,
    comments,
    sales: [],
    pushed_at: new Date().toISOString(),
  };

  // Keep sync_queue insert as a log/backup
  await env.MBC_DB.prepare(
    'INSERT INTO sync_queue (site_slug, payload) VALUES (?, ?)',
  ).bind(env.SITE_SLUG, JSON.stringify(payload)).run();

  // Write analytics directly to MBC queryable tables
  await upsertAnalyticsToMBC(env.MBC_DB, env.SITE_SLUG, payload);

  console.log(`[mbc-sync] Synced ${articles.length} articles, ${sessionStats.length} session stat rows, ${comments.length} comment stat rows for ${env.SITE_SLUG}`);
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function num(v: unknown): number {
  return Number(v || 0) || 0;
}

async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

async function ensureGscTables(db: D1Database): Promise<void> {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS gsc_sync_runs (
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
    )`,
    `CREATE TABLE IF NOT EXISTS gsc_daily_summary (
      day TEXT PRIMARY KEY,
      clicks REAL NOT NULL DEFAULT 0,
      impressions REAL NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS gsc_daily_queries (
      day TEXT NOT NULL,
      query TEXT NOT NULL,
      clicks REAL NOT NULL DEFAULT 0,
      impressions REAL NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (day, query)
    )`,
    `CREATE TABLE IF NOT EXISTS gsc_daily_pages (
      day TEXT NOT NULL,
      page TEXT NOT NULL,
      clicks REAL NOT NULL DEFAULT 0,
      impressions REAL NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (day, page)
    )`,
    `CREATE TABLE IF NOT EXISTS gsc_daily_countries (
      day TEXT NOT NULL,
      country TEXT NOT NULL,
      clicks REAL NOT NULL DEFAULT 0,
      impressions REAL NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (day, country)
    )`,
    `CREATE TABLE IF NOT EXISTS gsc_daily_devices (
      day TEXT NOT NULL,
      device TEXT NOT NULL,
      clicks REAL NOT NULL DEFAULT 0,
      impressions REAL NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (day, device)
    )`,
  ];

  for (const sql of ddl) {
    await db.prepare(sql).run();
  }
}

async function getOAuthAccessToken(db: D1Database): Promise<string> {
  const clientId = ((await getSetting(db, 'gsc_oauth_client_id')) || '').trim();
  const clientSecret = ((await getSetting(db, 'gsc_oauth_client_secret')) || '').trim();
  const refreshToken = ((await getSetting(db, 'gsc_oauth_refresh_token')) || '').trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('missing_oauth_settings');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokenJson: any = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(`oauth_refresh_failed:${tokenJson.error || 'unknown'}`);
  }

  return tokenJson.access_token;
}

async function querySearchAnalytics(
  property: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit: number,
) {
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions,
        rowLimit,
        startRow: 0,
        aggregationType: 'auto',
        dataState: 'all',
      }),
    }
  );

  const json: any = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || 'gsc_query_failed');
  }

  return json.rows || [];
}

async function syncGscAnalytics(db: D1Database): Promise<void> {
  await ensureGscTables(db);

  const property = ((await getSetting(db, 'gsc_property')) || '').trim();
  const authSource = ((await getSetting(db, 'gsc_auth_source')) || 'service_account').trim();
  if (!property) {
    console.log('[mbc-sync] Skipping GSC sync: gsc_property is empty');
    return;
  }
  if (authSource !== 'oauth') {
    console.log('[mbc-sync] Skipping GSC sync: daily worker supports oauth source only');
    return;
  }

  const endDate = ymd(addDays(new Date(), -1));
  const startDate = ymd(addDays(new Date(`${endDate}T00:00:00Z`), -3));

  const runInsert = await db.prepare(
    'INSERT INTO gsc_sync_runs (status, auth_source, start_date, end_date, message) VALUES (?, ?, ?, ?, ?)'
  ).bind('running', authSource, startDate, endDate, 'daily_vm_trigger').run();
  const runId = Number((runInsert.meta as any)?.last_row_id || 0);

  try {
    const token = await getOAuthAccessToken(db);

    const [summaryRows, queryRows, pageRows, countryRows, deviceRows] = await Promise.all([
      querySearchAnalytics(property, token, startDate, endDate, ['date'], 32),
      querySearchAnalytics(property, token, startDate, endDate, ['date', 'query'], 2500),
      querySearchAnalytics(property, token, startDate, endDate, ['date', 'page'], 2500),
      querySearchAnalytics(property, token, startDate, endDate, ['date', 'country'], 400),
      querySearchAnalytics(property, token, startDate, endDate, ['date', 'device'], 200),
    ]);

    await db.prepare('DELETE FROM gsc_daily_summary WHERE day >= ? AND day <= ?').bind(startDate, endDate).run();
    await db.prepare('DELETE FROM gsc_daily_queries WHERE day >= ? AND day <= ?').bind(startDate, endDate).run();
    await db.prepare('DELETE FROM gsc_daily_pages WHERE day >= ? AND day <= ?').bind(startDate, endDate).run();
    await db.prepare('DELETE FROM gsc_daily_countries WHERE day >= ? AND day <= ?').bind(startDate, endDate).run();
    await db.prepare('DELETE FROM gsc_daily_devices WHERE day >= ? AND day <= ?').bind(startDate, endDate).run();

    const summaryStmt = db.prepare(
      'INSERT OR REPLACE INTO gsc_daily_summary (day, clicks, impressions, ctr, position, synced_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
    );
    for (const row of summaryRows) {
      const day = String(row.keys?.[0] || '').trim();
      if (!day) continue;
      await summaryStmt.bind(day, num(row.clicks), num(row.impressions), num(row.ctr), num(row.position)).run();
    }

    const queryStmt = db.prepare(
      'INSERT OR REPLACE INTO gsc_daily_queries (day, query, clicks, impressions, ctr, position, synced_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
    );
    for (const row of queryRows) {
      const day = String(row.keys?.[0] || '').trim();
      const query = String(row.keys?.[1] || '').trim();
      if (!day || !query) continue;
      await queryStmt.bind(day, query, num(row.clicks), num(row.impressions), num(row.ctr), num(row.position)).run();
    }

    const pageStmt = db.prepare(
      'INSERT OR REPLACE INTO gsc_daily_pages (day, page, clicks, impressions, ctr, position, synced_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
    );
    for (const row of pageRows) {
      const day = String(row.keys?.[0] || '').trim();
      const page = String(row.keys?.[1] || '').trim();
      if (!day || !page) continue;
      await pageStmt.bind(day, page, num(row.clicks), num(row.impressions), num(row.ctr), num(row.position)).run();
    }

    const countryStmt = db.prepare(
      'INSERT OR REPLACE INTO gsc_daily_countries (day, country, clicks, impressions, ctr, position, synced_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
    );
    for (const row of countryRows) {
      const day = String(row.keys?.[0] || '').trim();
      const country = String(row.keys?.[1] || '').trim();
      if (!day || !country) continue;
      await countryStmt.bind(day, country, num(row.clicks), num(row.impressions), num(row.ctr), num(row.position)).run();
    }

    const deviceStmt = db.prepare(
      'INSERT OR REPLACE INTO gsc_daily_devices (day, device, clicks, impressions, ctr, position, synced_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
    );
    for (const row of deviceRows) {
      const day = String(row.keys?.[0] || '').trim();
      const device = String(row.keys?.[1] || '').trim();
      if (!day || !device) continue;
      await deviceStmt.bind(day, device, num(row.clicks), num(row.impressions), num(row.ctr), num(row.position)).run();
    }

    await db.prepare(
      'UPDATE gsc_sync_runs SET status = ?, rows_summary = ?, rows_queries = ?, rows_pages = ?, rows_countries = ?, rows_devices = ?, finished_at = datetime(\'now\') WHERE id = ?'
    ).bind('success', summaryRows.length, queryRows.length, pageRows.length, countryRows.length, deviceRows.length, runId).run();

    console.log(`[mbc-sync] GSC sync success (${startDate}..${endDate}) summary=${summaryRows.length} queries=${queryRows.length} pages=${pageRows.length}`);
  } catch (error: any) {
    await db.prepare(
      'UPDATE gsc_sync_runs SET status = ?, message = ?, finished_at = datetime(\'now\') WHERE id = ?'
    ).bind('failed', String(error?.message || error || 'unknown').slice(0, 500), runId).run();
    throw error;
  }
}

async function fetchKeywordTargets(db: D1Database) {
  const result = await db.prepare(`
    SELECT id, keyword, location, intent_class, funnel_stage, priority,
           active, last_published_at
    FROM article_keyword_targets
    WHERE active = 1
    ORDER BY priority DESC
    LIMIT 200
  `).all();
  return result.results || [];
}

async function fetchArticles(db: D1Database) {
  const result = await db.prepare(`
    SELECT id, slug, title, tags, published_at
    FROM blog_posts
    WHERE published_at IS NOT NULL
    ORDER BY published_at DESC
    LIMIT 500
  `).all();
  return (result.results || []).map((r: Record<string, unknown>) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    tags: r.tags,
    published_at: r.published_at,
    social_posted_fb: null,
    social_posted_ig: null,
  }));
}

async function fetchAnalytics(db: D1Database) {
  const result = await db.prepare(`
    SELECT
      p.path as slug,
      SUM(CASE WHEN p.day >= date('now', '-7 days') THEN p.views ELSE 0 END) as views_7d,
      SUM(p.views) as views_30d
    FROM page_view_daily p
    WHERE p.path LIKE '/blog/%'
      AND p.day >= date('now', '-30 days')
    GROUP BY p.path
    ORDER BY views_30d DESC
    LIMIT 500
  `).all();
  return (result.results || []).map((r: Record<string, unknown>) => ({
    slug: String(r.slug || '').replace('/blog/', '').replace(/\/$/, ''),
    views_7d: Number(r.views_7d) || 0,
    views_30d: Number(r.views_30d) || 0,
    avg_time_on_page: null,
    bounce_rate: null,
  }));
}

// Daily views per article — last 90 days
async function fetchAnalyticsDaily(db: D1Database) {
  const result = await db.prepare(`
    SELECT path as slug, day, views
    FROM page_view_daily
    WHERE path LIKE '/blog/%'
      AND day >= date('now', '-90 days')
    ORDER BY path, day
    LIMIT 10000
  `).all();
  return (result.results || []).map((r: Record<string, unknown>) => ({
    slug: String(r.slug || '').replace('/blog/', '').replace(/\/$/, ''),
    day:  String(r.day || ''),
    views: Number(r.views) || 0,
  }));
}

// Per-article GSC data from gsc_daily_pages — last 90 days, blog pages only
async function fetchGscPages(db: D1Database) {
  try {
    const result = await db.prepare(`
      SELECT page as slug, day, clicks, impressions, ctr, position
      FROM gsc_daily_pages
      WHERE page LIKE '%/blog/%'
        AND day >= date('now', '-90 days')
      ORDER BY page, day
      LIMIT 10000
    `).all();
    return (result.results || []).map((r: Record<string, unknown>) => ({
      slug: String(r.slug || '').replace(/^https?:\/\/[^/]+/, '').replace('/blog/', '').replace(/\/$/, ''),
      day:  String(r.day || ''),
      clicks:      Number(r.clicks)      || 0,
      impressions: Number(r.impressions) || 0,
      ctr:         Number(r.ctr)         || 0,
      position:    Number(r.position)    || 0,
    }));
  } catch {
    return [];
  }
}

// Top search queries (site-wide) — last 30 days, top 2000 by clicks
async function fetchGscQueries(db: D1Database) {
  try {
    const result = await db.prepare(`
      SELECT day, query, clicks, impressions, ctr, position
      FROM gsc_daily_queries
      WHERE day >= date('now', '-30 days') AND clicks > 0
      ORDER BY day DESC, clicks DESC LIMIT 2000
    `).all();
    return (result.results || []).map((r: Record<string, unknown>) => ({
      day: String(r.day || ''), query: String(r.query || ''),
      clicks: Number(r.clicks) || 0, impressions: Number(r.impressions) || 0,
      ctr: Number(r.ctr) || 0, position: Number(r.position) || 0,
    }));
  } catch { return []; }
}

function syncLogStmt(mbc: D1Database, siteId: number, siteSlug: string, dataType: string, row: Record<string, unknown>): D1PreparedStatement {
  return mbc.prepare('INSERT INTO sync_log (site_id, data_type, payload) VALUES (?, ?, ?)')
    .bind(siteId, dataType, JSON.stringify({ site_slug: siteSlug, ...row }));
}

async function upsertAnalyticsToMBC(mbc: D1Database, siteSlug: string, payload: Record<string, unknown>): Promise<void> {
  const siteRow = await mbc.prepare('SELECT id FROM sites WHERE slug = ? LIMIT 1')
    .bind(siteSlug).first<{ id: number }>();
  if (!siteRow) { console.error(`[mbc-sync] Site '${siteSlug}' not found in MBC`); return; }
  const siteId = siteRow.id;

  const now  = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const today = now.slice(0, 10);
  const CHUNK = 100;

  async function batch(stmts: D1PreparedStatement[]): Promise<void> {
    for (let i = 0; i < stmts.length; i += CHUNK) {
      await mbc.batch(stmts.slice(i, i + CHUNK));
    }
  }

  // article_analytics + article_analytics_history
  const analytics = ((payload.analytics as any[]) || []).filter(a => a?.slug);
  if (analytics.length) {
    await batch([
      ...analytics.map((a: any) =>
        mbc.prepare('INSERT OR REPLACE INTO article_analytics (site_id, slug, views_7d, views_30d, synced_at) VALUES (?,?,?,?,?)')
          .bind(siteId, a.slug, a.views_7d ?? 0, a.views_30d ?? 0, now)
      ),
      ...analytics.map((a: any) =>
        mbc.prepare('INSERT OR IGNORE INTO article_analytics_history (site_id, slug, views_7d, views_30d, recorded_date) VALUES (?,?,?,?,?)')
          .bind(siteId, a.slug, a.views_7d ?? 0, a.views_30d ?? 0, today)
      ),
      ...analytics.map((a: any) =>
        syncLogStmt(mbc, siteId, siteSlug, 'article_analytics', {
          slug: a.slug, views_7d: a.views_7d ?? 0, views_30d: a.views_30d ?? 0, synced_at: now,
        })
      ),
    ]);
  }

  // article_views_daily
  const daily = ((payload.analytics_daily as any[]) || []).filter(r => r?.slug && r?.day);
  if (daily.length) {
    await batch(daily.flatMap((r: any) => [
      mbc.prepare('INSERT OR REPLACE INTO article_views_daily (site_id, slug, day, views) VALUES (?,?,?,?)')
        .bind(siteId, r.slug, r.day, r.views ?? 0),
      syncLogStmt(mbc, siteId, siteSlug, 'article_views_daily', { slug: r.slug, day: r.day, views: r.views ?? 0 }),
    ]));
  }

  // article_gsc_history (from gsc_pages)
  const gscPages = ((payload.gsc_pages as any[]) || []).filter(r => r?.slug && r?.day);
  if (gscPages.length) {
    await batch(gscPages.flatMap((r: any) => [
      mbc.prepare('INSERT OR REPLACE INTO article_gsc_history (site_id, slug, clicks, impressions, position, ctr, recorded_date) VALUES (?,?,?,?,?,?,?)')
        .bind(siteId, r.slug, r.clicks ?? 0, r.impressions ?? 0, r.position ?? null, r.ctr ?? null, r.day),
      syncLogStmt(mbc, siteId, siteSlug, 'article_gsc_history', {
        slug: r.slug, clicks: r.clicks ?? 0, impressions: r.impressions ?? 0,
        position: r.position ?? null, ctr: r.ctr ?? null, recorded_date: r.day,
      }),
    ]));
  }

  // site_gsc_queries
  const gscQueries = ((payload.gsc_queries as any[]) || []).filter(r => r?.day && r?.query);
  if (gscQueries.length) {
    await batch(gscQueries.flatMap((r: any) => [
      mbc.prepare('INSERT OR REPLACE INTO site_gsc_queries (site_id, day, query, clicks, impressions, ctr, position) VALUES (?,?,?,?,?,?,?)')
        .bind(siteId, r.day, r.query, r.clicks ?? 0, r.impressions ?? 0, r.ctr ?? 0, r.position ?? 0),
      syncLogStmt(mbc, siteId, siteSlug, 'site_gsc_queries', {
        day: r.day, query: r.query, clicks: r.clicks ?? 0, impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0, position: r.position ?? 0,
      }),
    ]));
  }

  // article_session_daily
  const sessions = ((payload.session_stats as any[]) || []).filter(r => r?.slug && r?.day);
  if (sessions.length) {
    await batch(sessions.flatMap((r: any) => [
      mbc.prepare('INSERT OR REPLACE INTO article_session_daily (site_id, slug, day, unique_visitors, avg_duration_seconds, bounce_rate) VALUES (?,?,?,?,?,?)')
        .bind(siteId, r.slug, r.day, r.unique_visitors ?? 0, r.avg_duration ?? 0, r.bounce_rate ?? 0),
      syncLogStmt(mbc, siteId, siteSlug, 'article_session_daily', {
        slug: r.slug, day: r.day, unique_visitors: r.unique_visitors ?? 0,
        avg_duration_seconds: r.avg_duration ?? 0, bounce_rate: r.bounce_rate ?? 0,
      }),
    ]));
  }

  // article_referrers
  const referrers = ((payload.referrers as any[]) || []).filter(r => r?.slug && r?.referrer);
  if (referrers.length) {
    await batch(referrers.flatMap((r: any) => [
      mbc.prepare('INSERT OR REPLACE INTO article_referrers (site_id, slug, referrer, clicks, recorded_date) VALUES (?,?,?,?,?)')
        .bind(siteId, r.slug, r.referrer, r.clicks ?? 0, today),
      syncLogStmt(mbc, siteId, siteSlug, 'article_referrers', {
        slug: r.slug, referrer: r.referrer, clicks: r.clicks ?? 0, recorded_date: today,
      }),
    ]));
  }

  // article_devices
  const devices = ((payload.devices as any[]) || []).filter(r => r?.slug && r?.device);
  if (devices.length) {
    await batch(devices.flatMap((r: any) => [
      mbc.prepare('INSERT OR REPLACE INTO article_devices (site_id, slug, device, count, recorded_date) VALUES (?,?,?,?,?)')
        .bind(siteId, r.slug, r.device, r.count ?? 0, today),
      syncLogStmt(mbc, siteId, siteSlug, 'article_devices', {
        slug: r.slug, device: r.device, count: r.count ?? 0, recorded_date: today,
      }),
    ]));
  }

  // article_countries
  const countries = ((payload.countries as any[]) || []).filter(r => r?.slug && r?.country);
  if (countries.length) {
    await batch(countries.flatMap((r: any) => [
      mbc.prepare('INSERT OR REPLACE INTO article_countries (site_id, slug, country, count, recorded_date) VALUES (?,?,?,?,?)')
        .bind(siteId, r.slug, r.country, r.count ?? 0, today),
      syncLogStmt(mbc, siteId, siteSlug, 'article_countries', {
        slug: r.slug, country: r.country, count: r.count ?? 0, recorded_date: today,
      }),
    ]));
  }

  // article_comment_stats
  const comments = ((payload.comments as any[]) || []).filter(r => r?.slug);
  if (comments.length) {
    await batch(comments.flatMap((r: any) => [
      mbc.prepare('INSERT OR REPLACE INTO article_comment_stats (site_id, slug, comment_count, unique_commenters, synced_at) VALUES (?,?,?,?,?)')
        .bind(siteId, r.slug, r.comment_count ?? 0, r.unique_commenters ?? 0, now),
      syncLogStmt(mbc, siteId, siteSlug, 'article_comment_stats', {
        slug: r.slug, comment_count: r.comment_count ?? 0, unique_commenters: r.unique_commenters ?? 0, synced_at: now,
      }),
    ]));
  }

  // Update last_synced_at on the site
  await mbc.prepare("UPDATE sites SET last_synced_at = ? WHERE id = ?").bind(now, siteId).run();

  // Prune sync_log entries older than 14 days (VM tracks its own watermark; this is storage hygiene)
  await mbc.prepare("DELETE FROM sync_log WHERE created_at < datetime('now', '-14 days')").run();

  console.log(`[mbc-sync] MBC analytics upserted for site_id=${siteId} (${siteSlug}): ${analytics.length} articles, ${daily.length} daily rows, ${sessions.length} session rows`);
}

async function aggregatePageViewsDaily(db: D1Database): Promise<void> {
  const result = await db.prepare(`
    INSERT OR REPLACE INTO page_view_daily (path, day, views)
    SELECT path, date(created_at) AS day, COUNT(*) AS views
    FROM analytics_pageviews
    WHERE date(created_at) >= date('now', '-90 days')
    GROUP BY path, date(created_at)
  `).run();
  const written = (result.meta as any)?.changes || 0;
  console.log(`[mbc-sync] Aggregated page_view_daily: ${written} rows upserted`);
}

async function pruneOldAnalytics(db: D1Database): Promise<void> {
  const cutoff = "date('now', '-180 days')";
  await db.batch([
    db.prepare(`DELETE FROM analytics_sessions WHERE started_at < ${cutoff}`),
    db.prepare(`DELETE FROM analytics_pageviews WHERE created_at < ${cutoff}`),
  ]).catch(() => {});
}

async function fetchSessionStats(db: D1Database) {
  try {
    const result = await db.prepare(`
      SELECT
        ap.path,
        date(ap.created_at) AS day,
        COUNT(DISTINCT ap.session_id) AS unique_visitors,
        AVG(CASE WHEN ap.duration_seconds > 0 THEN ap.duration_seconds END) AS avg_duration,
        SUM(CASE WHEN s.page_views = 1 AND s.entry_path = ap.path THEN 1 ELSE 0 END) * 1.0
          / COUNT(DISTINCT ap.session_id) AS bounce_rate
      FROM analytics_pageviews ap
      LEFT JOIN analytics_sessions s ON s.id = ap.session_id
      WHERE ap.path LIKE '/blog/%'
        AND ap.created_at >= date('now', '-90 days')
      GROUP BY ap.path, date(ap.created_at)
      ORDER BY ap.path, day LIMIT 10000
    `).all();
    return (result.results || []).map((r: Record<string, unknown>) => ({
      slug: String(r.path || '').replace('/blog/', '').replace(/\/$/, ''),
      day: String(r.day || ''),
      unique_visitors: Number(r.unique_visitors) || 0,
      avg_duration: r.avg_duration != null ? +Number(r.avg_duration).toFixed(1) : null,
      bounce_rate: r.bounce_rate != null ? +Number(r.bounce_rate).toFixed(3) : null,
    }));
  } catch { return []; }
}

async function fetchReferrers(db: D1Database) {
  try {
    const result = await db.prepare(`
      SELECT ap.path, s.referrer, COUNT(*) AS clicks
      FROM analytics_pageviews ap
      JOIN analytics_sessions s ON s.id = ap.session_id
      WHERE ap.path LIKE '/blog/%'
        AND s.referrer IS NOT NULL
        AND ap.created_at >= date('now', '-30 days')
      GROUP BY ap.path, s.referrer
      ORDER BY clicks DESC LIMIT 2000
    `).all();
    return (result.results || []).map((r: Record<string, unknown>) => ({
      slug: String(r.path || '').replace('/blog/', '').replace(/\/$/, ''),
      referrer: String(r.referrer || ''),
      clicks: Number(r.clicks) || 0,
    }));
  } catch { return []; }
}

async function fetchDeviceStats(db: D1Database) {
  try {
    const result = await db.prepare(`
      SELECT ap.path, s.device_type AS device, COUNT(*) AS count
      FROM analytics_pageviews ap
      JOIN analytics_sessions s ON s.id = ap.session_id
      WHERE ap.path LIKE '/blog/%'
        AND ap.created_at >= date('now', '-30 days')
      GROUP BY ap.path, s.device_type
      ORDER BY ap.path, count DESC LIMIT 2000
    `).all();
    return (result.results || []).map((r: Record<string, unknown>) => ({
      slug: String(r.path || '').replace('/blog/', '').replace(/\/$/, ''),
      device: String(r.device || 'desktop'),
      count: Number(r.count) || 0,
    }));
  } catch { return []; }
}

async function fetchCountryStats(db: D1Database) {
  try {
    const result = await db.prepare(`
      SELECT ap.path, s.country, COUNT(*) AS count
      FROM analytics_pageviews ap
      JOIN analytics_sessions s ON s.id = ap.session_id
      WHERE ap.path LIKE '/blog/%'
        AND s.country IS NOT NULL
        AND ap.created_at >= date('now', '-30 days')
      GROUP BY ap.path, s.country
      ORDER BY ap.path, count DESC LIMIT 2000
    `).all();
    return (result.results || []).map((r: Record<string, unknown>) => ({
      slug: String(r.path || '').replace('/blog/', '').replace(/\/$/, ''),
      country: String(r.country || ''),
      count: Number(r.count) || 0,
    }));
  } catch { return []; }
}

// Check unchecked subscriber first names via AI — runs once per name (first_name_valid stays set)
async function checkSubscriberNames(db: D1Database, ai: Ai): Promise<void> {
  if (!ai) return;
  const { results: rows } = await db.prepare(
    `SELECT id, first_name FROM subscribers
     WHERE first_name IS NOT NULL AND trim(first_name) != '' AND first_name_valid IS NULL
     LIMIT 100`
  ).all<{ id: string; first_name: string }>();

  if (!rows || rows.length === 0) {
    console.log('[mbc-sync] No unchecked subscriber names');
    return;
  }

  let valid = 0, gibberish = 0;
  for (const row of rows) {
    let isValid = true;
    try {
      const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a validator. Answer only "yes" or "no", nothing else.' },
          { role: 'user',   content: `Is "${row.first_name.trim()}" a plausible human first name?` },
        ],
        max_tokens: 5,
      });
      isValid = (response?.response ?? '').toLowerCase().trim().startsWith('yes');
    } catch {
      continue; // leave unchecked if AI fails
    }
    await db.prepare(`UPDATE subscribers SET first_name_valid = ? WHERE id = ?`)
      .bind(isValid ? 1 : 0, row.id).run();
    if (isValid) valid++; else gibberish++;
  }
  console.log(`[mbc-sync] Name check done: ${valid} valid, ${gibberish} gibberish`);
}

function buildVerificationReminderEmail(firstName: string, verifyUrl: string, unsubUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Please verify your email</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#f59e0b 0%,#ea580c 100%);padding:36px 40px;text-align:center">
      <p style="margin:0 0 6px;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">Erik Red</p>
      <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;line-height:1.3">Please verify your email</h1>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:36px 40px">

      <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7">Hi ${firstName},</p>

      <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7">Thanks for stopping by Erik Red! We want to make sure we're only sending kitchen inspiration and updates to active inboxes.</p>

      <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7">We deeply respect your privacy and your inbox space. Because we don't believe in holding onto data or sending unwanted emails, our system automatically cleans up unverified email addresses after a few days.</p>

      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.7">To ensure our updates actually make it to you (and don't get lost in the spam folder), could you take two seconds to confirm your address?</p>

      <!-- CTA Button -->
      <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px">
        <tr>
          <td style="background:linear-gradient(135deg,#f59e0b 0%,#ea580c 100%);border-radius:8px">
            <a href="${verifyUrl}" style="display:inline-block;padding:15px 36px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.01em">Confirm My Subscription &rarr;</a>
          </td>
        </tr>
      </table>

      <!-- Benefits -->
      <p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.7">Once confirmed, you'll instantly lock in access to:</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px">
        <tr>
          <td style="padding:10px 16px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0;margin-bottom:8px">
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6"><strong style="color:#b45309">Exclusive Member Deals:</strong> VIP discounts on our premium silicone baking mats.</p>
          </td>
        </tr>
        <tr><td style="height:8px"></td></tr>
        <tr>
          <td style="padding:10px 16px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0">
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6"><strong style="color:#b45309">First Dibs on Restocks:</strong> Get notified first when our sold-out full-sheet mats land.</p>
          </td>
        </tr>
        <tr><td style="height:8px"></td></tr>
        <tr>
          <td style="padding:10px 16px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0">
            <p style="margin:0;color:#374151;font-size:14px;line-height:1.6"><strong style="color:#b45309">Curated Recipes &amp; Guides:</strong> Content engineered to elevate your baking.</p>
          </td>
        </tr>
      </table>

      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7">If you have any questions about how we handle your information, feel free to review our <a href="https://erikred.ca/privacy" style="color:#d97706;text-decoration:underline">Privacy Policy</a> and <a href="https://erikred.ca/data-use-policy" style="color:#d97706;text-decoration:underline">Data Use Policy</a>.</p>

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:20px 40px 28px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;line-height:1.7">Thank you for staying on the insider list!</p>
      <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.7">
        You received this because you subscribed to Erik Red updates.&nbsp;&nbsp;
        <a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function purgeExpiredUnverified(db: D1Database): Promise<void> {
  const result = await db.prepare(`
    DELETE FROM subscribers
    WHERE is_verified = 0
      AND verification_reminder_sent_at IS NOT NULL
      AND verification_reminder_sent_at <= datetime('now', '-7 days')
  `).run();
  const deleted = (result.meta as any)?.changes || 0;
  if (deleted > 0) console.log(`[mbc-sync] Purged ${deleted} unverified subscribers past 7-day grace`);
}

async function sendVerificationReminders(db: D1Database): Promise<void> {
  const keyRow = await db.prepare("SELECT value FROM app_settings WHERE key = 'resend_api_key' LIMIT 1")
    .first<{ value: string }>();
  const resendKey = keyRow?.value?.trim();
  if (!resendKey) {
    console.log('[mbc-sync] Skipping verification reminders: no Resend API key configured');
    return;
  }

  const { results: pending } = await db.prepare(`
    SELECT id, email, first_name, verification_token
    FROM subscribers
    WHERE is_verified = 0 AND is_active = 1 AND verification_reminder_sent_at IS NULL
    LIMIT 100
  `).all<{ id: string; email: string; first_name: string | null; verification_token: string | null }>();

  if (!pending || pending.length === 0) {
    console.log('[mbc-sync] No unverified subscribers to remind');
    return;
  }

  // Ensure every pending subscriber has a verification token
  const withTokens = await Promise.all(pending.map(async sub => {
    if (!sub.verification_token) {
      const token = crypto.randomUUID();
      await db.prepare('UPDATE subscribers SET verification_token = ? WHERE id = ?').bind(token, sub.id).run();
      return { ...sub, verification_token: token };
    }
    return sub;
  }));

  const BATCH = 100;
  let sent = 0;
  for (let i = 0; i < withTokens.length; i += BATCH) {
    const chunk = withTokens.slice(i, i + BATCH);
    const emails = chunk.map(sub => {
      const name = sub.first_name?.trim() || 'there';
      const verifyUrl = `https://erikred.ca/api/verify-subscription?token=${sub.verification_token}`;
      const unsubUrl = `https://erikred.ca/api/unsubscribe?email=${encodeURIComponent(sub.email)}`;
      return {
        from: 'Erik Red <noreply@erikred.ca>',
        to: [sub.email],
        subject: 'Please verify your email',
        html: buildVerificationReminderEmail(name, verifyUrl, unsubUrl),
      };
    });

    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emails),
    });

    if (res.ok) {
      await db.batch(chunk.map(s =>
        db.prepare("UPDATE subscribers SET verification_reminder_sent_at = datetime('now') WHERE id = ?").bind(s.id)
      ));
      sent += chunk.length;
    } else {
      console.error('[mbc-sync] Resend batch error:', await res.text());
    }
  }
  console.log(`[mbc-sync] Verification reminders sent to ${sent} subscribers`);
}

// Erik Red: blog_comments linked via post_id → blog_posts.id → blog_posts.slug
async function fetchCommentStats(db: D1Database) {
  try {
    const result = await db.prepare(`
      SELECT bp.slug, COUNT(c.id) AS comment_count,
             COUNT(DISTINCT c.user_email) AS unique_commenters
      FROM blog_comments c
      JOIN blog_posts bp ON bp.id = c.post_id
      WHERE c.is_deleted = 0
      GROUP BY bp.slug
    `).all();
    return (result.results || []).map((r: Record<string, unknown>) => ({
      slug: String(r.slug || ''),
      comment_count: Number(r.comment_count) || 0,
      unique_commenters: Number(r.unique_commenters) || 0,
    }));
  } catch { return []; }
}
