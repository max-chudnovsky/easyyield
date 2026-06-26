import type { APIRoute } from 'astro';

// GET - Get newsletter subscription status for a user
export const GET: APIRoute = async (context) => {
  try {
    const env = (context.locals as any)?.env;
    if (!env?.DB) {
      return new Response(JSON.stringify({ error: 'Database not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const email = context.url.searchParams.get('email');
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user is subscribed
    const subscription = await env.DB.prepare(`
      SELECT
        id, email, user_id, is_verified, is_active, subscribed_at,
        verified_at, unsubscribed_at, source
      FROM subscribers
      WHERE email = ?
    `).bind(email).first();

    const response = {
      email,
      isSubscribed: subscription ? subscription.is_active : false,
      subscription: subscription || null
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // No newsletter on this site (no subscribers table) — degrade gracefully
    // instead of a 500 so the account page just shows "not subscribed".
    console.warn('Newsletter status unavailable:', error);
    return new Response(JSON.stringify({ isSubscribed: false, subscription: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};