/**
 * Compatibility shim. The canonical auth implementation now lives in the shared
 * cms-users module (PBKDF2 PasswordCrypto, sessions on the unified users table).
 * Easy Yield's native AuthService was removed; this thin wrapper keeps the ~20
 * surviving native admin/settings/cron routes working unchanged — they only ever
 * call `new AuthService(env.DB, env.CACHE)` + `checkAuthentication(token)` and
 * read `user.group` for admin gating.
 *
 * It delegates to the module AuthService and maps the module's `role` back to
 * the legacy `group` field those routes expect (admin|super_admin -> 'admin').
 * Do NOT add new auth logic here — extend the module instead.
 */
import { AuthService as CmsAuthService } from '@cms/cms-users';

export class AuthService {
  private svc: CmsAuthService;

  constructor(db: D1Database, kv?: KVNamespace) {
    this.svc = new CmsAuthService(db, kv);
  }

  /** Resolve a session token; returns the user with a legacy `group` field. */
  async checkAuthentication(sessionToken: string): Promise<{ isAuthenticated: boolean; user?: any }> {
    const res = await this.svc.checkAuthentication(sessionToken);
    if (!res.isAuthenticated || !res.user) return { isAuthenticated: false };
    const group = res.user.role === 'admin' || res.user.role === 'super_admin' ? 'admin' : 'user';
    return { isAuthenticated: true, user: { ...res.user, group } };
  }

  async logoutUser(sessionToken: string): Promise<boolean> {
    return this.svc.logout(sessionToken);
  }

  async getUserById(userId: string): Promise<any> {
    const user = await this.svc.getUserById(userId);
    if (!user) return null;
    const group = user.role === 'admin' || user.role === 'super_admin' ? 'admin' : 'user';
    return { ...user, group };
  }

  async cleanupExpiredSessions(): Promise<number> {
    return this.svc.cleanupExpiredSessions();
  }
}
