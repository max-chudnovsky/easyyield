// Fetch a YouTube channel's latest uploads via the public RSS feed (no API key,
// no quota). Cached in D1 (cache_kv) to avoid refetching on every request.

export interface YtVideo {
  id: string;
  title: string;
  published: string;
  thumb: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

async function fetchRss(channelId: string): Promise<YtVideo[]> {
  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EasyYieldBot/1.0)' } }
    );
    if (!res.ok) return [];
    const xml = await res.text();
    const out: YtVideo[] = [];
    for (const entry of xml.split('<entry>').slice(1)) {
      const id = (entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
      if (!id) continue;
      const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
      const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1] || '';
      out.push({
        id,
        title: decodeEntities(title.trim()),
        published,
        thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      });
    }
    return out;
  } catch {
    return [];
  }
}

const CACHE_KEY = 'yt:videos';
const TTL_MS = 60 * 60 * 1000; // 1 hour

/** Returns the channel's videos, cached in D1 for 1h. Falls back to a live
 *  fetch on any cache error and never throws. */
export async function getChannelVideos(db: any, channelId: string): Promise<YtVideo[]> {
  if (db) {
    try {
      const row = await db
        .prepare('SELECT value, expires_at FROM cache_kv WHERE key = ? LIMIT 1')
        .bind(CACHE_KEY)
        .first();
      if (row?.value && (!row.expires_at || Number(row.expires_at) > Date.now())) {
        return JSON.parse(row.value);
      }
    } catch { /* miss → fetch live */ }
  }

  const videos = await fetchRss(channelId);

  if (db && videos.length) {
    try {
      await db
        .prepare('CREATE TABLE IF NOT EXISTS cache_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)')
        .run();
      await db
        .prepare('INSERT INTO cache_kv (key, value, expires_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at')
        .bind(CACHE_KEY, JSON.stringify(videos), Date.now() + TTL_MS)
        .run();
    } catch { /* non-fatal */ }
  }
  return videos;
}
