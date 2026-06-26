import { createMbcArticlesPost } from '@cms/cms-mbc-sync';
import { requestPublishIndexing } from '../../../lib/publish-indexing';

export const prerender = false;

export const POST = createMbcArticlesPost({
  baseUrl: 'https://easyyield.ca',
  onPublished: async (db, url) => { await requestPublishIndexing(db, url); },
});
