import { createMbcArticleProducts } from '@cms/cms-mbc-sync';

export const prerender = false;

// Receives VM-precomputed product matches → writes to this site's D1
// (article_products). Matching runs on the VM; nothing stored at MBC.
export const POST = createMbcArticleProducts();
