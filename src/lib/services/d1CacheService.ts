/**
 * D1-backed cache helper — the home for ALL non-session caching in Easy Yield.
 *
 * Cloudflare's KV free tier shares a 1,000-writes/day cap across every
 * namespace on the account. Data/API caches (products, categories, blog,
 * Keepa/Amazon prices, the product cache-bust marker, staged image uploads)
 * used to live on KV and spiked the account over that cap. They now live in
 * D1 instead. KV is reserved exclusively for login sessions (cms-users).
 *
 * Backing table (auto-created on first use):
 *   cache_kv(key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER)
 * `expires_at` is unix-ms; NULL means "never expires". Expired rows are
 * treated as misses and lazily deleted on read.
 *
 * Fully defensive: any D1 error degrades to a cache miss / no-op and is
 * swallowed — a cache fault must never break the underlying read/write.
 */

const ENSURE_SQL = `CREATE TABLE IF NOT EXISTS cache_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER
)`;

export class D1CacheService {
  private ensured = false;

  /**
   * @param db        the project D1 binding (env.DB)
   * @param defaultTTL default TTL in seconds for put() when none is given
   */
  constructor(private db: D1Database, private defaultTTL = 300) {}

  /** Lazily create the backing table once per instance. */
  private async ensureTable(): Promise<void> {
    if (this.ensured) return;
    try {
      await this.db.prepare(ENSURE_SQL).run();
      this.ensured = true;
    } catch (e) {
      console.error('D1Cache ensureTable:', e);
      // Leave `ensured` false so a later op can retry, but don't throw.
    }
  }

  /** Read + JSON-parse a cached value. Returns null on miss/expiry/error. */
  async get<T>(key: string): Promise<T | null> {
    try {
      await this.ensureTable();
      const row = await this.db
        .prepare('SELECT value, expires_at FROM cache_kv WHERE key = ?')
        .bind(key)
        .first<{ value: string; expires_at: number | null }>();
      if (!row) return null;
      if (row.expires_at != null && row.expires_at <= Date.now()) {
        // Expired — lazily evict and report a miss.
        await this.delete(key);
        return null;
      }
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return null;
      }
    } catch (e) {
      console.error(`D1Cache get ${key}:`, e);
      return null;
    }
  }

  /** JSON-stringify + upsert a value with an optional TTL (seconds). */
  async put<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    try {
      await this.ensureTable();
      const ttl = ttlSeconds ?? this.defaultTTL;
      const expiresAt = ttl && ttl > 0 ? Date.now() + ttl * 1000 : null;
      await this.db
        .prepare(
          `INSERT INTO cache_kv (key, value, expires_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
        )
        .bind(key, JSON.stringify(data), expiresAt)
        .run();
    } catch (e) {
      console.error(`D1Cache put ${key}:`, e);
    }
  }

  /** Delete a single key. No-op on error. */
  async delete(key: string): Promise<void> {
    try {
      await this.ensureTable();
      await this.db.prepare('DELETE FROM cache_kv WHERE key = ?').bind(key).run();
    } catch (e) {
      console.error(`D1Cache delete ${key}:`, e);
    }
  }

  /** Delete every key beginning with `prefix`. No-op on error. */
  async deleteWithPrefix(prefix: string): Promise<void> {
    try {
      await this.ensureTable();
      await this.db
        .prepare("DELETE FROM cache_kv WHERE key LIKE ? ESCAPE '\\'")
        .bind(escapeLike(prefix) + '%')
        .run();
    } catch (e) {
      console.error(`D1Cache deleteWithPrefix ${prefix}:`, e);
    }
  }

  /** Cache-aside helper: return cached value or compute, store, and return it. */
  async getOrSet<T>(key: string, fallbackFn: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const data = await fallbackFn();
    await this.put(key, data, ttlSeconds);
    return data;
  }

  static generateKey(namespace: string, identifier: string | number, ...params: string[]): string {
    return `${namespace}:${identifier}${params.length ? ':' + params.join(':') : ''}`;
  }
}

/** Escape LIKE wildcards so a prefix is matched literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

/**
 * Adapter that makes a D1CacheService quack like a Cloudflare KVNamespace.
 *
 * The shared cms-* modules (ProductService, BlogService, etc.) accept an
 * optional `KVNamespace` for their internal data caching. We must not edit the
 * shared submodule, so instead of handing them `env.CACHE` (real KV) we hand
 * them this adapter — the shared cache then lands in D1 transparently. Only the
 * subset of the KV API those modules actually use is implemented:
 *   get(key, 'json'|'text'?), put(key, string, {expirationTtl}), delete(key),
 *   list({prefix}).
 */
export function d1KvNamespace(db: D1Database): KVNamespace {
  const cache = new D1CacheService(db);
  const ns: any = {
    async get(key: string, typeOrOpts?: any): Promise<any> {
      const type =
        typeof typeOrOpts === 'string' ? typeOrOpts : typeOrOpts?.type;
      const raw = await cache.get<unknown>(key);
      if (raw === null) return null;
      // D1CacheService stores JSON; callers asking for 'json' get the object,
      // everyone else (default/text) gets the re-serialized string.
      if (type === 'json') return raw;
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
      // Shared callers always pass an already-stringified value. Re-parse so the
      // D1 layer (which JSON-stringifies) round-trips cleanly; fall back to the
      // raw string if it isn't valid JSON.
      let data: unknown = value;
      try {
        data = JSON.parse(value);
      } catch {
        /* keep raw string */
      }
      await cache.put(key, data, opts?.expirationTtl);
    },
    async delete(key: string): Promise<void> {
      await cache.delete(key);
    },
    async list(opts?: { prefix?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean }> {
      try {
        const prefix = opts?.prefix ?? '';
        const rows = await db
          .prepare("SELECT key FROM cache_kv WHERE key LIKE ? ESCAPE '\\'")
          .bind(escapeLike(prefix) + '%')
          .all<{ key: string }>();
        return {
          keys: (rows.results ?? []).map((r) => ({ name: r.key })),
          list_complete: true,
        };
      } catch (e) {
        console.error('D1Cache(ns) list:', e);
        return { keys: [], list_complete: true };
      }
    },
  };
  return ns as KVNamespace;
}
