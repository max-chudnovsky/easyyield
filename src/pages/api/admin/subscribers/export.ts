import type { APIRoute } from 'astro';
import { AuthService } from '../../../../lib/services/auth.js';

// GET - Export subscribers as CSV
export const GET: APIRoute = async (context) => {
  try {
    const env = (context.locals as any)?.env;
    if (!env?.DB || !env?.CACHE) {
      return new Response('Database not available', { status: 500 });
    }

    const sessionToken = context.cookies.get('easyyield_session')?.value;
    if (!sessionToken) {
      return new Response('Not authenticated', { status: 401 });
    }

    const authService = new AuthService(env.DB, env.CACHE);
    const authResult = await authService.checkAuthentication(sessionToken);

    if (!authResult.isAuthenticated || !authResult.user || authResult.user.group !== 'admin') {
      return new Response('Admin access required', { status: 403 });
    }

    // Get all subscribers
    const { results: subscribers } = await env.DB.prepare(`
      SELECT
        email, first_name, last_name, source, ip_address,
        is_verified, is_active, subscribed_at, verified_at,
        unsubscribed_at, user_id, country, country_detected_at
      FROM subscribers
      ORDER BY subscribed_at DESC
    `).all();

    // Generate CSV content
    const csvHeaders = [
      'Email',
      'First Name',
      'Last Name',
      'Source',
      'Status',
      'Verified',
      'Subscribed Date',
      'Verified Date',
      'Unsubscribed Date',
      'IP Address',
      'Country',
      'Country Detected Date',
      'Registered User'
    ];

    const csvRows = subscribers.map(subscriber => {
      const status = !subscriber.is_active ? 'Unsubscribed' :
                    subscriber.is_verified ? 'Verified' : 'Pending';

      const formatDate = (dateStr) => dateStr ? new Date(dateStr).toISOString().split('T')[0] : '';

      return [
        subscriber.email,
        subscriber.first_name || '',
        subscriber.last_name || '',
        subscriber.source,
        status,
        subscriber.is_verified ? 'Yes' : 'No',
        formatDate(subscriber.subscribed_at),
        formatDate(subscriber.verified_at),
        formatDate(subscriber.unsubscribed_at),
        subscriber.ip_address || '',
        subscriber.country || '',
        formatDate(subscriber.country_detected_at),
        subscriber.user_id ? 'Yes' : 'No'
      ];
    });

    // Combine headers and rows
    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const filename = `subscribers-${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    console.error('Error exporting subscribers:', error);
    return new Response('Failed to export subscribers', { status: 500 });
  }
};