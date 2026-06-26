import type { APIRoute } from 'astro';

export const GET: APIRoute = async (context) => {
  try {
    const env = (context.locals as any)?.env;

    if (!env?.DB) {
      return new Response(JSON.stringify({
        status: 'degraded',
        db: 'unavailable',
        timestamp: new Date().toISOString()
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await env.DB.prepare('SELECT 1 as ok').first();

    return new Response(JSON.stringify({
      status: 'ok',
      db: 'ok',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return new Response(JSON.stringify({
      status: 'error',
      db: 'error',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
