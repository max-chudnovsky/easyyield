import type { APIRoute } from 'astro';
import { AuthService } from '../../../lib/services/auth.js';

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

    const data = await context.request.json();
    const { email, userId } = data;

    if (!email && !userId) {
      return new Response(JSON.stringify({ error: 'Email or userId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Clear user caches
    const cacheKeys = [];

    if (email) {
      cacheKeys.push(`user:email:${email.toLowerCase()}`);
      cacheKeys.push(`user:${email.toLowerCase()}`);
    }

    if (userId) {
      cacheKeys.push(`user:id:${userId}`);
    }

    // Clear caches using KV directly
    const clearPromises = cacheKeys.map(key => env.CACHE.delete(key));
    await Promise.all(clearPromises);

    return new Response(JSON.stringify({
      success: true,
      message: `Cleared cache for ${cacheKeys.length} keys`,
      clearedKeys: cacheKeys
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Clear cache error:', error);
    return new Response(JSON.stringify({ error: 'Failed to clear cache' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};