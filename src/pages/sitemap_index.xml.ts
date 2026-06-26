import type { APIRoute } from 'astro';

export const prerender = false;

// /sitemap_index.xml (old URL from @astrojs/sitemap, registered in GSC)
// → redirect permanently to the canonical /sitemap.xml endpoint.
export const GET: APIRoute = async () => {
  return new Response(null, {
    status: 301,
    headers: {
      Location: '/sitemap.xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};