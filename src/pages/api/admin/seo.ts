import type { APIRoute } from 'astro';
import { AuthService } from '../../../lib/services/auth.js';
import { SITE, queryAE } from '../../../lib/analyticsEngine';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const env = (context.locals as any)?.env;
  if (!env?.DB || !env?.CACHE) {
    return new Response(JSON.stringify({ error: 'Database not available' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const sessionToken = context.cookies.get('easyyield_session')?.value;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  const auth = new AuthService(env.DB, env.CACHE);
  const { isAuthenticated, user } = await auth.checkAuthentication(sessionToken);
  if (!isAuthenticated || user?.group !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Ensure legacy table exists for backward compatibility
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS page_views (' +
      'path TEXT PRIMARY KEY,' +
      'type TEXT NOT NULL DEFAULT \'page\',' +
      'reference_id TEXT,' +
      'total_views INTEGER NOT NULL DEFAULT 0,' +
      'last_viewed_at TEXT NOT NULL DEFAULT (datetime(\'now\')),' +
      'first_viewed_at TEXT NOT NULL DEFAULT (datetime(\'now\'))' +
      ')'
    ).run();

    const byType = async (type: string) => {
      const rows = await queryAE(env, `SELECT blob3 AS path, blob5 AS reference_id, SUM(double1) AS total_views, MIN(timestamp) AS first_viewed_at, MAX(timestamp) AS last_viewed_at FROM site_pageviews WHERE blob1='view' AND blob2='${SITE}' AND blob4='${type}' GROUP BY blob3, blob5 ORDER BY total_views DESC`);
      return rows.map((r: any) => ({
        path: String(r.path || ''),
        reference_id: r.reference_id ? String(r.reference_id) : null,
        total_views: Number(r.total_views) || 0,
        first_viewed_at: String(r.first_viewed_at || ''),
        last_viewed_at: String(r.last_viewed_at || ''),
      }));
    };

    const [pages, productViews, blogViews] = await Promise.all([
      byType('page'),
      byType('product'),
      byType('blog'),
    ]);

    // Products (join with products table for title + status)
    const productIds = productViews.map((r) => r.reference_id).filter(Boolean) as string[];
    const productsResult = productIds.length
      ? await env.DB.prepare(`SELECT id, title, active, sku FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`).bind(...productIds).all()
      : { results: [] };
    const productMap = new Map((productsResult.results || []).map((r: any) => [String(r.id), r]));
    const productsRows = productViews.map((r) => {
      const p = productMap.get(r.reference_id || '') as any;
      return {
        path: r.path, total_views: r.total_views, last_viewed_at: r.last_viewed_at, first_viewed_at: r.first_viewed_at,
        title: p?.title ?? null, active: p?.active ?? null, sku: p?.sku ?? null, product_id: r.reference_id,
      };
    });

    // Blog posts (join with articles for title)
    const blogSlugs = blogViews.map((r) => r.reference_id).filter(Boolean) as string[];
    const articlesResult = blogSlugs.length
      ? await env.DB.prepare(`SELECT t.slug, t.title, a.published_at FROM article_translations t JOIN articles a ON a.id = t.article_id WHERE t.slug IN (${blogSlugs.map(() => '?').join(',')}) AND t.lang_code = 'en'`).bind(...blogSlugs).all()
      : { results: [] };
    const articleMap = new Map((articlesResult.results || []).map((r: any) => [String(r.slug), r]));
    const blogRows = blogViews.map((r) => {
      const a = articleMap.get(r.reference_id || '') as any;
      return {
        path: r.path, total_views: r.total_views, last_viewed_at: r.last_viewed_at, first_viewed_at: r.first_viewed_at,
        title: a?.title ?? null, slug: a?.slug ?? r.reference_id, published_at: a?.published_at ?? null,
      };
    });

    return new Response(JSON.stringify({
      pages,
      products: productsRows,
      blog: blogRows,
      filters: {
        ownIpExcluded: true,
        includeOwnIp: false
      },
      totals: {
        pages: pages.reduce((s, r) => s + r.total_views, 0),
        products: productsRows.reduce((s, r) => s + r.total_views, 0),
        blog: blogRows.reduce((s, r) => s + r.total_views, 0),
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('SEO stats error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to load SEO stats',
      details: error instanceof Error ? error.message : String(error)
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const DELETE: APIRoute = async (context) => {
  const env = (context.locals as any)?.env;
  const sessionToken = context.cookies.get('easyyield_session')?.value;
  if (!sessionToken || !env?.DB) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }
  const auth = new AuthService(env.DB, env.CACHE);
  const { isAuthenticated, user } = await auth.checkAuthentication(sessionToken);
  if (!isAuthenticated || user?.group !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { type } = await context.request.json() as { type?: string };
  await env.DB.prepare(
    type ? 'DELETE FROM page_views WHERE type = ?' : 'DELETE FROM page_views'
  ).bind(...(type ? [type] : [])).run();

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
};
