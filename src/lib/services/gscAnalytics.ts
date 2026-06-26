// Re-export shim → @cms/cms-analytics (the shared collection module). The GSC
// ingest implementation moved into the module (ensureGscAnalyticsTables,
// ingestGscAnalytics). This file preserves the existing import path used by
// src/pages/api/admin/seo-gsc.ts. The settings table (app_settings for Easy Yield)
// is passed by the module's injected routes via CMS_ANALYTICS_SETTINGS_TABLE.
export * from '@cms/cms-analytics';
