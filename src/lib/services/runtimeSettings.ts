// Module-level: the table only needs creating once per worker isolate, not on
// every settings read/write. Without this, `CREATE TABLE IF NOT EXISTS` ran on
// every getSetting/setSetting (~2k no-op executions in D1 query insights).
let appSettingsEnsured = false;

export class RuntimeSettingsService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  private async ensureTable(): Promise<void> {
    if (appSettingsEnsured) return;
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    appSettingsEnsured = true;
  }

  async getSetting(key: string): Promise<string | null> {
    await this.ensureTable();
    const row = await this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .bind(key)
      .first<{ value: string }>();
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.ensureTable();
    await this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).bind(key, value).run();
  }

  async deleteSetting(key: string): Promise<void> {
    await this.ensureTable();
    await this.db.prepare('DELETE FROM app_settings WHERE key = ?').bind(key).run();
  }

  async getOrCreateIndexNowKey(): Promise<string> {
    const existing = await this.getSetting('indexnow_key');
    if (existing && existing.trim()) {
      return existing.trim();
    }

    const generated = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    await this.setSetting('indexnow_key', generated);
    return generated;
  }

  async getResendApiKey(fallbackKey?: string): Promise<string | null> {
    const fromDb = await this.getSetting('resend_api_key');
    if (fromDb && fromDb.trim()) {
      return fromDb.trim();
    }

    if (fallbackKey && String(fallbackKey).trim()) {
      return String(fallbackKey).trim();
    }

    return null;
  }

  static maskSecret(secret: string | null): string | null {
    if (!secret) return null;
    const trimmed = secret.trim();
    if (trimmed.length <= 8) {
      return '*'.repeat(trimmed.length);
    }
    return `${trimmed.slice(0, 4)}${'*'.repeat(Math.max(trimmed.length - 8, 4))}${trimmed.slice(-4)}`;
  }
}
