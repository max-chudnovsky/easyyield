import type { APIRoute } from 'astro';
import { AuthService } from '../../../lib/services/auth.js';

export const GET: APIRoute = async (context) => {
  try {
    const env = (context.locals as any)?.env;

    if (!env?.DB || !env?.CACHE) {
      return new Response(JSON.stringify({ success: false, error: 'Database not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const sessionToken = context.cookies.get('easyyield_session')?.value;
    if (!sessionToken) {
      return new Response(JSON.stringify({ success: false, error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const authService = new AuthService(env.DB, env.CACHE);
    const authResult = await authService.checkAuthentication(sessionToken);

    if (!authResult.isAuthenticated || !authResult.user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let count = 0;
    try {
      const row = await env.DB
        .prepare('SELECT COUNT(*) AS count FROM orders WHERE user_id = ?')
        .bind(authResult.user.id)
        .first<any>();
      count = Number(row?.count || 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('no such table')) {
        throw error;
      }
      // If orders table does not exist yet, treat as zero orders.
      count = 0;
    }

    return new Response(JSON.stringify({ success: true, count, hasOrders: count > 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Orders count API error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Failed to fetch orders count' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
