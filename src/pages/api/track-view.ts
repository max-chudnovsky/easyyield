import type { APIRoute } from 'astro';
import { recordView, parseDevice, parseBrowser, parseOS } from '../../lib/analyticsEngine';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const env = (context.locals as any)?.env;
  const ctx = (context.locals as any)?.cfContext;

  try {
    const { productId } = await context.request.json() as { productId: string };
    if (!productId) return new Response('ok', { status: 200 });

    const trackPath = `/product?id=${productId}`;
    let sessionId = context.cookies.get('easyyield_analytics')?.value;
    const isNewSession = !sessionId;
    if (!sessionId) sessionId = crypto.randomUUID();

    const cf = (context.request as any).cf;
    const country = cf?.country || null;
    const ua = context.request.headers.get('User-Agent') || '';
    const referrer = context.request.headers.get('Referer') || null;

    recordView(env, ctx, {
      sessionId,
      isNewSession,
      country,
      device: parseDevice(ua),
      browser: parseBrowser(ua),
      os: parseOS(ua),
      referrer: referrer ? new URL(referrer).hostname : null,
      path: trackPath,
      type: 'product',
      referenceId: productId,
    });

    if (env?.DB && ctx?.waitUntil) {
      ctx.waitUntil(env.DB.prepare(`
        INSERT INTO page_views (path, type, reference_id, total_views, last_viewed_at, first_viewed_at)
        VALUES (?, 'product', ?, 1, datetime('now'), datetime('now'))
        ON CONFLICT(path) DO UPDATE SET total_views = total_views + 1, last_viewed_at = datetime('now')
      `).bind(trackPath, productId).run().catch(() => {}));
    }
  } catch { /* ignore */ }

  return new Response('ok', { status: 200 });
};
