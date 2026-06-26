import { createSitemapEndpoint } from '@cms/cms-seo';

export const prerender = false;

export const GET = createSitemapEndpoint({
  baseUrl: 'https://easyyield.ca',
  staticEntries: [
    { loc: '/',          priority: '1.0' },
    { loc: '/blog',      priority: '0.9' },
    { loc: '/about',     priority: '0.5' },
    { loc: '/contact',   priority: '0.5' },
    { loc: '/privacy',   priority: '0.3' },
    { loc: '/data-use-policy', priority: '0.3' },
  ],
});
