// Social metrics (YouTube / Facebook / Instagram) for the header cards.
//
// Same shape as lib/youtube-videos.ts: a LAZY hourly scan, cached in D1
// (`social_metrics`, NOT KV), that NEVER throws (the header must always render).
// On a request, if a platform's row is older than 1h we refetch it; we only
// WRITE the row when a value actually changed (we always bump last_scan_at so we
// don't rescan for another hour). Missing credentials -> null fields -> "—" cards.

const YT_CHANNEL_ID = 'UCJ6fa6JxMw3hA15TVvC2EWg'; // @Easy_Yield
const FB_PAGE_ID = '1161123523754325';            // Easy Yield FB page (MBC system-user portfolio)
const TTL_MS = 60 * 60 * 1000; // 1 hour
// "views" = total video views across the platform's videos (parallels YouTube's channel viewCount).

export interface PlatformMetric {
  count: number | null;  // subscribers (YT) / fans (FB) / followers (IG)
  videos: number | null;
  views: number | null;
}
export interface SocialMetrics {
  youtube: PlatformMetric;
  facebook: PlatformMetric;
  instagram: PlatformMetric;
}
const EMPTY: PlatformMetric = { count: null, videos: null, views: null };
const PLATFORM_KEYS = ['youtube', 'facebook', 'instagram'] as const;

async function ensureTable(db: any): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS social_metrics (
       platform     TEXT PRIMARY KEY,
       count        INTEGER,
       videos       INTEGER,
       views        INTEGER,
       last_scan_at INTEGER NOT NULL DEFAULT 0,
       updated_at   INTEGER NOT NULL DEFAULT 0
     )`
  ).run();
}

async function readRows(db: any): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  try {
    const res = await db
      .prepare('SELECT platform, count, videos, views, last_scan_at FROM social_metrics')
      .all();
    for (const r of res?.results ?? []) out[r.platform] = r;
  } catch { /* table not created yet -> treated as all-stale */ }
  return out;
}

// --- per-platform fetchers: return EMPTY (null fields) when no credential ---

// Reuse the pipeline's OAuth (client_id/secret + refresh_token, stored in CF secrets):
// refresh -> an access token -> channels.list(statistics, mine=true). channelId kept for reference.
void YT_CHANNEL_ID;
async function fetchYouTube(env: any): Promise<PlatformMetric> {
  const cid = env?.YT_CLIENT_ID, csec = env?.YT_CLIENT_SECRET, rtok = env?.YT_REFRESH_TOKEN;
  if (!cid || !csec || !rtok) return EMPTY;
  try {
    const tr = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cid, client_secret: csec, refresh_token: rtok, grant_type: 'refresh_token',
      }),
    });
    if (!tr.ok) return EMPTY;
    const at = (await tr.json() as any)?.access_token;
    if (!at) return EMPTY;
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true',
      { headers: { Authorization: `Bearer ${at}` } }
    );
    if (!res.ok) return EMPTY;
    const s = ((await res.json() as any)?.items?.[0])?.statistics;
    if (!s) return EMPTY;
    return {
      count: Number(s.subscriberCount ?? 0),
      videos: Number(s.videoCount ?? 0),
      views: Number(s.viewCount ?? 0),
    };
  } catch { return EMPTY; }
}

// FB page: followers + video count + summed video views, via the MBC system-user
// FB_PAGE_TOKEN (page is in that portfolio). Confirmed query 2026-06-28.
async function fetchFacebook(env: any): Promise<PlatformMetric> {
  const token = env?.FB_TOKEN;
  if (!token) return EMPTY;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${FB_PAGE_ID}?fields=followers_count,videos.limit(100){views}&access_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return EMPTY;
    const j: any = await res.json();
    if (j?.error) return EMPTY;
    const vids: any[] = j?.videos?.data ?? [];
    const views = vids.reduce((a, v) => a + Number(v?.views ?? 0), 0);
    return { count: Number(j.followers_count ?? 0), videos: vids.length, views };
  } catch { return EMPTY; }
}
// IG (reached via the linked FB page, same FB_TOKEN): followers + video/reel count
// + summed media views. Confirmed query 2026-06-28.
async function fetchInstagram(env: any): Promise<PlatformMetric> {
  const token = env?.FB_TOKEN;
  if (!token) return EMPTY;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${FB_PAGE_ID}?fields=instagram_business_account{followers_count,media.limit(50){media_type,media_product_type,insights.metric(views)}}&access_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return EMPTY;
    const j: any = await res.json();
    const ig = j?.instagram_business_account;
    if (!ig) return EMPTY;
    const media: any[] = ig?.media?.data ?? [];
    let videos = 0, views = 0;
    for (const it of media) {
      if (it.media_type === 'VIDEO' || it.media_product_type === 'REELS') videos++;
      for (const ins of (it.insights?.data ?? [])) {
        if (ins.name === 'views') views += Number(ins.values?.[0]?.value ?? 0);
      }
    }
    return { count: Number(ig.followers_count ?? 0), videos, views };
  } catch { return EMPTY; }
}

const FETCHERS: Record<string, (env: any) => Promise<PlatformMetric>> = {
  youtube: fetchYouTube,
  facebook: fetchFacebook,
  instagram: fetchInstagram,
};

async function scanIfStale(db: any, env: any, rows: Record<string, any>): Promise<void> {
  const now = Date.now();
  const anyStale = PLATFORM_KEYS.some(
    (p) => !rows[p] || now - Number(rows[p].last_scan_at || 0) > TTL_MS
  );
  if (!anyStale) return;
  await ensureTable(db);
  for (const platform of PLATFORM_KEYS) {
    const old = rows[platform];
    if (old && now - Number(old.last_scan_at || 0) <= TTL_MS) continue; // still fresh
    const m = await FETCHERS[platform](env);
    const changed =
      !old || old.count !== m.count || old.videos !== m.videos || old.views !== m.views;
    if (changed) {
      await db
        .prepare(
          `INSERT INTO social_metrics (platform, count, videos, views, last_scan_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(platform) DO UPDATE SET
             count=excluded.count, videos=excluded.videos, views=excluded.views,
             last_scan_at=excluded.last_scan_at, updated_at=excluded.updated_at`
        )
        .bind(platform, m.count, m.videos, m.views, now, now)
        .run();
      rows[platform] = { platform, ...m, last_scan_at: now };
    } else {
      // no change -> only advance the scan clock (update-only-if-change)
      await db
        .prepare('UPDATE social_metrics SET last_scan_at=? WHERE platform=?')
        .bind(now, platform)
        .run();
      rows[platform].last_scan_at = now;
    }
  }
}

/** Social metrics for the `/api/social-metrics` endpoint (NOT the page render).
 *  Reads D1 and runs the lazy ≤1h scan SYNCHRONOUSLY — fine here since this is an
 *  isolated API call that can be slow without affecting any page. Never throws;
 *  returns null fields when data/credentials are missing. */
export async function getSocialMetrics(env: any): Promise<SocialMetrics> {
  const base: SocialMetrics = { youtube: { ...EMPTY }, facebook: { ...EMPTY }, instagram: { ...EMPTY } };
  const db = env?.DB;
  if (!db) return base;
  try {
    const rows = await readRows(db);
    await scanIfStale(db, env, rows);
    for (const p of PLATFORM_KEYS) {
      const r = rows[p];
      if (r) base[p] = { count: r.count ?? null, videos: r.videos ?? null, views: r.views ?? null };
    }
  } catch { /* never throw */ }
  return base;
}
