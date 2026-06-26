import { PublishIndexingService, type PublishIndexingResult } from '@cms/cms-seo';

const SITE_URL = 'https://easyyield.ca';

export async function requestPublishIndexing(db: D1Database, postUrl: string): Promise<PublishIndexingResult> {
  return new PublishIndexingService(db, {
    siteUrl: SITE_URL,
    settingsTable: 'app_settings',
    settingKeys: {
      siteUrl: 'seo_site_url',
      googleClientId: 'gsc_oauth_client_id',
      googleClientSecret: 'gsc_oauth_client_secret',
      googleRefreshToken: 'gsc_oauth_refresh_token',
    },
  }).requestPublishIndexing(postUrl);
}
