import type { APIRoute } from 'astro';

// POST - Unsubscribe from newsletter
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = (locals as any)?.env;
    if (!env?.DB) {
      return new Response(JSON.stringify({ error: 'Database not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await request.json();
    const { email, token } = data;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Find active subscriber
    const subscriber = await env.DB.prepare(`
      SELECT id FROM subscribers WHERE email = ? AND is_active = TRUE
    `).bind(email).first();

    if (!subscriber) {
      return new Response(JSON.stringify({ error: 'Email not found or already unsubscribed' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate unsubscribe token if not provided
    const unsubscribeToken = token || crypto.randomUUID();

    // Update subscriber to unsubscribed
    const result = await env.DB.prepare(`
      UPDATE subscribers
      SET is_active = FALSE,
          unsubscribed_at = CURRENT_TIMESTAMP,
          unsubscribe_token = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE email = ?
    `).bind(unsubscribeToken, email).run();

    if (!result.success) {
      throw new Error('Failed to unsubscribe');
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Successfully unsubscribed from newsletter'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unsubscribe error:', error);
    return new Response(JSON.stringify({ error: 'Failed to unsubscribe' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// GET - Unsubscribe via URL token
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const env = (locals as any)?.env;
    if (!env?.DB) {
      return new Response('Database not available', { status: 500 });
    }

    const token = url.searchParams.get('token');
    const email = url.searchParams.get('email');

    if (!token && !email) {
      return new Response('Invalid unsubscribe link', { status: 400 });
    }

    let subscriber;
    if (token) {
      subscriber = await env.DB.prepare(`
        SELECT id, email FROM subscribers WHERE unsubscribe_token = ? AND is_active = TRUE
      `).bind(token).first();
    } else if (email) {
      subscriber = await env.DB.prepare(`
        SELECT id, email FROM subscribers WHERE email = ? AND is_active = TRUE
      `).bind(email).first();
    }

    if (!subscriber) {
      return new Response('Invalid unsubscribe link or already unsubscribed', { status: 404 });
    }

    // Update subscriber to unsubscribed
    await env.DB.prepare(`
      UPDATE subscribers
      SET is_active = FALSE,
          unsubscribed_at = CURRENT_TIMESTAMP,
          unsubscribe_token = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(token || crypto.randomUUID(), subscriber.id).run();

    // Return a simple HTML response
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed - Easy Yield</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #333; margin-bottom: 20px; }
          p { color: #666; line-height: 1.5; }
          a { color: #d97706; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Successfully Unsubscribed</h1>
          <p>You have been unsubscribed from our newsletter.</p>
          <p>We're sorry to see you go!</p>
          <p><a href="/">Return to Easy Yield</a></p>
        </div>
      </body>
      </html>
    `, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error) {
    console.error('Unsubscribe error:', error);
    return new Response('Failed to unsubscribe', { status: 500 });
  }
};