import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';
import cmsBlog from '@cms/cms-blog/integration';
import cmsUsers from '@cms/cms-users/integration';
import cmsAnalytics from '@cms/cms-analytics/integration';

export default defineConfig({
  site: 'https://easyyield.ca',

  prefetch: {
    defaultStrategy: 'viewport',
  },

  // Build as server output for Cloudflare Workers.
  output: 'server',

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        // Wrap the shared AdminShell in velesco's existing public page layout
        // (head + Header + Footer) — reuse, not a replica.
        '@cms/cms-ui/site-layout': fileURLToPath(new URL('./src/components/ui/PageLayout.astro', import.meta.url)),
        // Public blog pages (/blog, /blog/[slug]) are now served by cms-blog;
        // this layout supplies velesco's Header/Footer chrome around them.
        '@cms/cms-blog/site-blog-layout': fileURLToPath(new URL('./src/layouts/BlogSiteLayout.astro', import.meta.url)),
        // cms-users public pages (/account, /login, /register, /forgot-password,
        // /reset-password, /confirm-deletion) wrapped in velesco's Header/Footer.
        '@cms/cms-users/site-layout': fileURLToPath(new URL('./src/layouts/BlogSiteLayout.astro', import.meta.url)),
      },
    },
    ssr: {
      external: [
        'crypto',
        'events',
        'util',
        'url',
        'net',
        'dns',
        'fs',
        'os',
        'child_process',
        'http',
        'https',
        'zlib',
        'stream',
        'path',
        'tls',
        'buffer',
        'assert',
        'querystring',
        'http2',
        'process'
      ]
    }
  },

  image: {
    responsiveStyles: true,
    layout: 'constrained',
  // No remotePatterns to avoid network fetches during build in this environment
  },

  integrations: [
    // @astrojs/sitemap removed: the SSR /sitemap.xml endpoint (static + blog + product URLs)
    // is the single canonical sitemap. Old /sitemap-index.xml & /sitemap-0.xml paths 301 to it.
    // All blog code (public pages, comments/posts/admin/cron API, components)
    // now lives in cms-blog. velesco enables the injected routes here and keeps
    // zero native blog files. Per-site config (brand/canonical/langs/shortcode/
    // cookie/sender/AI seeds) is read at request time from wrangler.toml [vars]
    // (CMS_BLOG_*). Public pages render inside velesco's Header/Footer via the
    // @cms/cms-blog/site-blog-layout alias above.
    cmsBlog({
      publicPages: true,   // /blog, /blog/[slug], /blog/category/[slug]
      comments: true,      // /api/blog/comments
      postsApi: true,      // /api/blog/posts (used by the search tag matrix)
      adminPages: true,    // /admin/blog + admin API + finalize-images
      autoTagCron: true,   // /api/cron/auto-tag-blog-posts
    }),
    // cms-users is now the home for ALL auth. The module serves /api/auth/*,
    // /api/account*, login/register/forgot/reset/account pages + the LoginPopup,
    // plus /admin/users(+subscribers) and /api/users(+[id]).
    //
    // Per-site runtime config is read from wrangler.toml [vars] at request time
    // (see config.ts): CMS_USERS_SESSION_COOKIE = "velesco_session" preserves
    // the existing session cookie so logged-in users stay logged in; the KV
    // helper also auto-detects velesco's VELESCO binding. Brand/sender/reset
    // path come from the other CMS_USERS_* vars.
    //
    // subscribeApi:false — velesco keeps its native /api/subscribe + /unsubscribe.
    // Also kept native (velesco `subscribers` table / product-specific, not yet
    // reconciled with the module's unified users model): /api/admin/subscribers/*,
    // /api/admin/users, /api/verify-subscription, /api/account/orders-count.
    // bootstrapApi defaults off (velesco has existing users).
    cmsUsers({ subscribeApi: false, googleOAuthApi: true }),
    // Page-view analytics + GSC via @cms/cms-analytics (velesco's src/lib files
    // are thin re-export shims). Injects /api/analytics/event + the token-gated
    // /api/seo/gsc-stats (VM read) + /api/cron/gsc-sync (VM ingest). GSC creds +
    // seo_analytics_api_key read from app_settings (CMS_ANALYTICS_SETTINGS_TABLE).
    // beaconRoute off — velesco keeps its existing /js/analytics.js client beacon.
    cmsAnalytics({ beaconRoute: false }),
  ],


  adapter: cloudflare({ imageService: 'compile' }),
});
