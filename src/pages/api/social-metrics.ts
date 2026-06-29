import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getSocialMetrics } from '../../lib/social-metrics';

export const prerender = false;

const EMPTY = {
  youtube: { count: null, videos: null, views: null },
  facebook: { count: null, videos: null, views: null },
  instagram: { count: null, videos: null, views: null },
};

// Social metrics JSON for the header cards. The header fetches this client-side,
// so even a 500 here never affects the page. Bindings/secrets come from the
// `cloudflare:workers` env (Astro v6 removed Astro.locals.runtime.env).
export const GET: APIRoute = async () => {
  let data: any = EMPTY;
  try {
    data = await getSocialMetrics(env as any);
  } catch { /* return EMPTY — never break the caller */ }
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
};
