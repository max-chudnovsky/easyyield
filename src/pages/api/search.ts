import type { APIRoute } from 'astro';
import { BlogService, R2ImageUtils } from '@cms/cms-blog';
import { d1KvNamespace } from '../../lib/services/d1CacheService.js';

export interface SearchResult {
  type: 'blog';
  id: string;
  title: string;
  excerpt?: string;
  url: string;
  image?: string;
  category?: string;
  published_at?: string;
}

// GET - Search blog posts (Easy Yield is blog-only).
export const GET: APIRoute = async (context) => {
  try {
    const env = (context.locals as any)?.env;
    if (!env?.DB) {
      return new Response(JSON.stringify({ error: 'Database not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = context.url;
    const query = url.searchParams.get('q')?.trim();
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 20);

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({
        results: [],
        query: query || '',
        total: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const searchPattern = `%${query}%`;
    const titlePattern = `%${query}%`;

    // Search blog posts
    const blogQuery = `
      SELECT a.id, t.title, t.description AS excerpt, t.slug, a.featured_image_path, a.published_at
      FROM articles a
      JOIN article_translations t ON t.article_id = a.id AND t.lang_code = 'en'
      WHERE a.status = 'published'
        AND (t.title LIKE ? OR t.markdown_content LIKE ? OR t.description LIKE ?)
      ORDER BY
        CASE WHEN t.title LIKE ? THEN 1 ELSE 2 END,
        a.published_at DESC
      LIMIT ?
    `;

    const { results: blogResults } = await env.DB.prepare(blogQuery)
      .bind(searchPattern, searchPattern, searchPattern, titlePattern, limit)
      .all();

    const results: SearchResult[] = [];

    for (const post of blogResults as any[]) {
      results.push({
        type: 'blog',
        id: post.id,
        title: post.title,
        excerpt: post.excerpt || undefined,
        url: `/blog/${post.slug}`,
        image: post.featured_image_path ? R2ImageUtils.getImageUrl(post.featured_image_path) : undefined,
        category: undefined,
        published_at: post.published_at
      });
    }

    return new Response(JSON.stringify({
      results: results.slice(0, limit),
      query,
      total: results.length
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300' // 5 minutes cache
      }
    });

  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({
      error: 'Search failed',
      results: [],
      query: '',
      total: 0
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
