import { defineMiddleware } from 'astro/middleware';
import { recordView, parseDevice, parseBrowser, parseOS } from './lib/analyticsEngine';
import { AuthService } from '@cms/cms-users';

const SKIP_PREFIXES = ['/api/', '/admin/', '/_astro/', '/images/', '/js/'];
const SKIP_EXTS = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.css', '.js', '.woff', '.woff2', '.map'];

async function writeLegacyPageView(db: any, path: string, type: string, referenceId: string | null) {
  // Keep legacy page_views table updated too (for SEO page)
  await db.prepare(`
    INSERT INTO page_views (path, type, reference_id, total_views, last_viewed_at, first_viewed_at)
    VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
    ON CONFLICT(path) DO UPDATE SET total_views = total_views + 1, last_viewed_at = datetime('now')
  `).bind(path, type, referenceId).run().catch(() => {});
}

export const onRequest = defineMiddleware(async (context, next) => {
  try {
    const { env: cfEnv } = await import('cloudflare:workers');
    if (cfEnv) (context.locals as any).env = cfEnv;
  } catch {
    // Non-Workers runtime (local tooling) can run without Cloudflare bindings.
  }

  const env = (context.locals as any)?.env;
  const ctx = (context.locals as any)?.cfContext;

  // Resolve the admin session into locals.user (with role) so module admin
  // screens (cms-blog/cms-users) can gate on it. Additive —
  // Easy Yield's own per-route auth is unaffected. Fail-soft.
  try {
    const token = context.cookies.get('easyyield_session')?.value;
    if (token && env?.DB) {
      const { user } = await new AuthService(env.DB, (env as any).CACHE).checkAuthentication(token);
      if (user) (context.locals as any).user = user;
    }
  } catch { /* never break the request */ }

  const response = await next();

  // HTML documents are SSR + personalized (auth state) and embed per-build inline
  // styles — never let the browser serve a stale cached page. Static assets
  // (/_astro, /images, css/js with ?v=) keep their own long cache untouched.
  try {
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('text/html') && !response.headers.has('Cache-Control')) {
      response.headers.set('Cache-Control', 'no-cache, must-revalidate');
    }
  } catch {}

  // Noindex for admin, auth, utility, and other non-public routes.
  try {
    const pnRaw = new URL(context.request.url).pathname;
    const NOINDEX_PREFIXES = ['/admin', '/login', '/register', '/forgot-password', '/reset-password', '/account', '/settings'];
    if (NOINDEX_PREFIXES.some(prefix => pnRaw === prefix || pnRaw.startsWith(prefix + '/'))) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
  } catch {}

  // CSP headers
  try {
    const pn = new URL(context.request.url).pathname;
    const csp = pn === '/contact'
      ? "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://www.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; connect-src 'self' https://challenges.cloudflare.com https://www.google.com; frame-src 'self' https://challenges.cloudflare.com https://www.google.com"
      : "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com; frame-src 'self' https://challenges.cloudflare.com";
    response.headers.set('Content-Security-Policy', csp);
  } catch {}

  // Analytics tracking
  if (env) {
    try {
      const url = new URL(context.request.url);
      const pathname = url.pathname;

      const shouldTrack =
        !SKIP_PREFIXES.some(p => pathname.startsWith(p)) &&
        !SKIP_EXTS.some(e => pathname.endsWith(e)) &&
        !context.cookies.get('easyyield_session')?.value;

      if (shouldTrack) {
        // Session cookie
        let sessionId = context.cookies.get('easyyield_analytics')?.value;
        const isNewSession = !sessionId;
        if (isNewSession) {
          sessionId = crypto.randomUUID();
          response.headers.append('Set-Cookie',
            `easyyield_analytics=${sessionId}; Path=/; Max-Age=1800; SameSite=Lax`);
        }

        // Request metadata
        const cf = (context.request as any).cf;
        const country = cf?.country || null;
        const ua = context.request.headers.get('User-Agent') || '';
        const referrer = context.request.headers.get('Referer') || null;

        // Classify path
        let type = 'page';
        let referenceId: string | null = null;
        let trackPath = pathname;

        if (pathname === '/book' || pathname.startsWith('/book/') || pathname === '/product' || pathname.startsWith('/product/')) {
          type = 'product';
          const id = url.searchParams.get('id') || pathname.replace('/book/', '').replace('/product/', '').replace(/^\//, '');
          referenceId = id || null;
          // Keep the canonical tracked path stable so engagement keys don't split.
          trackPath = referenceId ? `/product?id=${referenceId}` : pathname;
        } else if (pathname.startsWith('/blog/') && pathname.length > 6) {
          type = 'blog';
          referenceId = pathname.replace('/blog/', '').split('/')[0] || null;
        }

        recordView(env, ctx, {
          sessionId: sessionId!,
          isNewSession,
          country,
          device: parseDevice(ua),
          browser: parseBrowser(ua),
          os: parseOS(ua),
          referrer: referrer ? new URL(referrer).hostname : null,
          path: trackPath,
          type,
          referenceId
        });

        if (env?.DB && ctx?.waitUntil) {
          ctx.waitUntil(writeLegacyPageView(env.DB, trackPath, type, referenceId));
        }
      }
    } catch { /* never break the request */ }
  }

  return response;
});
