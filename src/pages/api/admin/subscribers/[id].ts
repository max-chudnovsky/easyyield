import type { APIRoute } from 'astro';
import { AuthService } from '../../../../lib/services/auth.js';

// DELETE - Delete subscriber
export const DELETE: APIRoute = async (context) => {
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

    // Check if subscriber exists
    const subscriber = await env.DB.prepare(`
      SELECT id FROM subscribers WHERE id = ?
    `).bind(id).first();

    if (!subscriber) {
      return new Response(JSON.stringify({ error: 'Subscriber not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Delete subscriber
    const result = await env.DB.prepare(`
      DELETE FROM subscribers WHERE id = ?
    `).bind(id).run();

    if (!result.success) {
      throw new Error('Failed to delete subscriber');
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Subscriber deleted successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error deleting subscriber:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete subscriber' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};