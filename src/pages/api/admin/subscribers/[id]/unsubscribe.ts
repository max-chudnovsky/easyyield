import type { APIRoute } from 'astro';
import { AuthService } from '../../../../../lib/services/auth.js';

// POST - Unsubscribe user (admin action)
export const POST: APIRoute = async (context) => {
  try {
    const env = (context.locals as any)?.env;
    if (!env?.DB || !env?.CACHE) {
      return new Response(JSON.stringify({ error: 'Database not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const sessionToken = context.cookies.get('easyyield_session')?.value;
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const authService = new AuthService(env.DB, env.CACHE);
    const authResult = await authService.checkAuthentication(sessionToken);

    if (!authResult.isAuthenticated || !authResult.user || authResult.user.group !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { id } = context.params;

    // Check if subscriber exists and is active
    const subscriber = await env.DB.prepare(`
      SELECT id, email FROM subscribers WHERE id = ? AND is_active = TRUE
    `).bind(id).first();

    if (!subscriber) {
      return new Response(JSON.stringify({ error: 'Active subscriber not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate unsubscribe token
    const unsubscribeToken = crypto.randomUUID();

    // Update subscriber to unsubscribed
    const result = await env.DB.prepare(`
      UPDATE subscribers
      SET is_active = FALSE,
          unsubscribed_at = CURRENT_TIMESTAMP,
          unsubscribe_token = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(unsubscribeToken, id).run();

    if (!result.success) {
      throw new Error('Failed to unsubscribe user');
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'User unsubscribed successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error unsubscribing user:', error);
    return new Response(JSON.stringify({ error: 'Failed to unsubscribe user' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};