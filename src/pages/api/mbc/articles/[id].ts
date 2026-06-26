import { createMbcArticleDelete, createMbcArticlePatch, type MbcArticlesConfig } from '@cms/cms-mbc-sync';
import { requestPublishIndexing } from '../../../../lib/publish-indexing';

export const prerender = false;

const mbcConfig: MbcArticlesConfig = {
  baseUrl: 'https://easyyield.ca',
  onPublished: async (db, url) => { await requestPublishIndexing(db, url); },
};

export const PATCH = createMbcArticlePatch(mbcConfig);
export const DELETE = createMbcArticleDelete(mbcConfig);
