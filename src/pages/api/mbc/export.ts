import { createMbcExport } from '@cms/cms-mbc-sync';
import { sumByPath, sumByDimension, durationStats, sessionStatsByPath } from '../../../lib/analyticsEngine';

export const prerender = false;

export const GET = createMbcExport({
  siteOrigin: 'https://easyyield.ca',
  settingsTable: 'app_settings',
  analytics: { sumByPath, sumByDimension, durationStats, sessionStatsByPath },
});
