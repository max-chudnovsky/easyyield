// Re-export shim → @cms/cms-analytics (the shared collection module). The
// implementation moved into the module; this file only preserves Easy Yield's
// existing import surface (recordView/parse*/sumByPath/… and the SITE const)
// so callers (middleware, track-view, admin/analytics, admin/seo, export)
// don't need to change. The Analytics Engine site key is set at runtime via
// the CMS_ANALYTICS_SITE wrangler var (= "easyyield").
export * from '@cms/cms-analytics';

// SITE is still referenced by src/pages/api/admin/{analytics,seo}.ts.
export const SITE = 'easyyield';
