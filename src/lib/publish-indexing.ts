import { PublishIndexingService, type PublishIndexingResult } from '@cms/cms-seo';
import { RuntimeSettingsService } from './services/runtimeSettings.js';

const SITE_URL = 'https://easyyield.ca';

export async function requestPublishIndexing(db: D1Database, postUrl: string): Promise<PublishIndexingResult> {
  // GSC Indexing API creds live in the canonical `platform_settings` under the
  // default `google_client_id/secret/refresh_token` keys — these carry the
  // auth/indexing scope (shared Google account, same as touringstar/erikred;
  // the gsc_oauth_* keys are analytics-read only and can't index). The IndexNow
  // key is owned by RuntimeSettingsService in `app_settings` (and served by the
  // dynamic /<key>.txt route), so feed it in as the default to avoid table drift.
  const indexnowKey = await new RuntimeSettingsService(db).getOrCreateIndexNowKey();
  return new PublishIndexingService(db, {
    siteUrl: SITE_URL,
    settingsTable: 'platform_settings',
    defaultIndexnowKey: indexnowKey,
  }).requestPublishIndexing(postUrl);
}
