import type { APIRoute } from 'astro';

export const prerender = false;

// Old @astrojs/sitemap output (registered in GSC) → 301 to the canonical /sitemap.xml.
export const GET: APIRoute = async () =>
  new Response(null, {
    status: 301,
    headers: { Location: '/sitemap.xml', 'Cache-Control': 'public, max-age=3600' },
  });
