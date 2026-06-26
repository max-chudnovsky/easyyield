import type { APIRoute } from 'astro';
import { AuthService } from '../../../../lib/services/auth.js';

// GET - List all subscribers with filtering and pagination
export const GET: APIRoute = async (context) => {
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

    // Get query parameters
    const searchParams = context.url.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const search = searchParams.get('search') || '';
    const source = searchParams.get('source') || '';
    const status = searchParams.get('status') || '';

    // Build WHERE clause
    let whereConditions = [];
    let params = [];

    if (search) {
      whereConditions.push('(email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (source) {
      whereConditions.push('source = ?');
      params.push(source);
    }

    if (status) {
      if (status === 'verified') {
        whereConditions.push('is_verified = 1 AND is_active = 1');
      } else if (status === 'unverified') {
        whereConditions.push('is_verified = 0 AND is_active = 1');
      } else if (status === 'inactive') {
        whereConditions.push('is_active = 0');
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM subscribers ${whereClause}`;
    const countResult = await env.DB.prepare(countQuery).bind(...params).first();
    const totalCount = countResult?.total || 0;

    // Get subscribers with pagination
    const offset = (page - 1) * limit;
    const subscribersQuery = `
      SELECT
        id, email, user_id, first_name, last_name, source, ip_address,
        is_verified, is_active, subscribed_at, verified_at, unsubscribed_at,
        verification_sent_at, country, country_detected_at
      FROM subscribers
      ${whereClause}
      ORDER BY subscribed_at DESC
      LIMIT ? OFFSET ?
    `;

    const { results: subscribers } = await env.DB.prepare(subscribersQuery)
      .bind(...params, limit, offset)
      .all();

    // Get statistics
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_verified = 1 AND is_active = 1 THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN is_verified = 0 AND is_active = 1 THEN 1 ELSE 0 END) as unverified,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as unsubscribed,
        COUNT(CASE WHEN source = 'signup' THEN 1 END) as from_signup,
        COUNT(CASE WHEN source = 'footer' THEN 1 END) as from_footer,
        COUNT(CASE WHEN source = 'admin' THEN 1 END) as from_admin
      FROM subscribers
    `;

    const stats = await env.DB.prepare(statsQuery).first();

    return new Response(JSON.stringify({
      success: true,
      subscribers: subscribers || [],
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      },
      stats: stats || {}
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching subscribers:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch subscribers' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};