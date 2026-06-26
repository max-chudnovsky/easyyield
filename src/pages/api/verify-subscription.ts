import type { APIRoute } from 'astro';
import { EmailService } from '@cms/cms-core';
import { sendSubscriberWelcome } from '../../lib/email';
import { RuntimeSettingsService } from '../../lib/services/runtimeSettings.js';

// GET - Verify subscription via email token
export const GET: APIRoute = async ({ url, locals, request }) => {
  try {
    const env = (locals as any)?.env;
    if (!env?.DB) {
      return new Response('Services not available', { status: 500 });
    }

    const settingsService = new RuntimeSettingsService(env.DB);
    const resendApiKey = await settingsService.getResendApiKey(env.RESEND_API_KEY);

    const token = url.searchParams.get('token');
    if (!token) {
      return new Response('Invalid verification link', { status: 400 });
    }

    // Find subscriber by verification token
    const subscriber = await env.DB.prepare(`
      SELECT id, email, is_verified, first_name FROM subscribers
      WHERE verification_token = ? AND is_active = TRUE
    `).bind(token).first();

    if (!subscriber) {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Verification Failed - Easy Yield</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #dc2626; margin-bottom: 20px; }
            p { color: #666; line-height: 1.5; }
            a { color: #d97706; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Verification Failed</h1>
            <p>This verification link is invalid or has already been used.</p>
            <p><a href="/">Return to Easy Yield</a></p>
          </div>
        </body>
        </html>
      `, { status: 404, headers: { 'Content-Type': 'text/html' } });
    }

    if (subscriber.is_verified) {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Already Verified - Easy Yield</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #059669; margin-bottom: 20px; }
            p { color: #666; line-height: 1.5; }
            a { color: #d97706; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Already Verified</h1>
            <p>Your email subscription is already verified and active.</p>
            <p>Thank you for subscribing to our newsletter!</p>
            <p><a href="/">Return to Easy Yield</a></p>
          </div>
        </body>
        </html>
      `, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }

    // Detect country from Cloudflare headers
    const country = request.headers.get('CF-IPCountry') || request.headers.get('cf-ipcountry') || null;
    console.log('Detected country during verification:', country);

    // Update subscriber to verified and add country information
    const result = await env.DB.prepare(`
      UPDATE subscribers
      SET is_verified = TRUE,
          verified_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP,
          country = ?,
          country_detected_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(country, subscriber.id).run();

    if (!result.success) {
      throw new Error('Failed to verify subscription');
    }

    // Mirror verification into the unified `users` table (keep the Subscribers
    // admin in sync). Wrapped — never break verification.
    try {
      await env.DB.prepare(`
        UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now')),
          promotional_email_consent = 1, updated_at = datetime('now')
        WHERE lower(email) = lower(?)
      `).bind(subscriber.email).run();
    } catch (mirrorError) {
      console.error('users mirror (verify) failed:', mirrorError);
    }

    // Send welcome email after successful verification
    try {
      if (resendApiKey) {
        const emailService = new EmailService(resendApiKey, env?.CMS_USERS_EMAIL_FROM || 'Easy Yield <noreply@easyyield.ca>');
        await sendSubscriberWelcome(emailService, subscriber.email, subscriber.first_name);
      }
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail verification if welcome email fails
    }

    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Subscription Verified - Easy Yield</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #059669; margin-bottom: 20px; }
          p { color: #666; line-height: 1.5; margin-bottom: 15px; }
          a { color: #d97706; text-decoration: none; font-weight: 500; }
          a:hover { text-decoration: underline; }
          .success-icon { font-size: 3rem; color: #059669; margin-bottom: 20px; }
          .benefits { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left; }
          .benefits ul { margin: 0; padding-left: 20px; }
          .benefits li { margin: 8px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Subscription Verified!</h1>
          <p>Thank you for confirming your email subscription to the Easy Yield newsletter.</p>

          <div class="benefits">
            <h3 style="margin-top: 0; color: #333;">What to expect:</h3>
            <ul>
              <li>Latest product updates and new arrivals</li>
              <li>Exclusive offers and early access to sales</li>
              <li>Kitchen tips and cooking inspiration</li>
              <li>Behind-the-scenes content</li>
            </ul>
          </div>

          <p>You can unsubscribe at any time using the link in our emails.</p>
          <p><a href="/">Back to Easy Yield</a></p>
        </div>
      </body>
      </html>
    `, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error) {
    console.error('Verification error:', error);
    return new Response('Verification failed', { status: 500 });
  }
};