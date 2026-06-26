import type { APIRoute } from 'astro';
import { EmailService } from '@cms/cms-core';
import { sendSubscriptionVerification } from '../../lib/email';
import { RuntimeSettingsService } from '../../lib/services/runtimeSettings.js';

// POST - Subscribe to newsletter
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  try {
    const env = (locals as any)?.env;
    if (!env?.DB) {
      return new Response(JSON.stringify({ error: 'Services not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const settingsService = new RuntimeSettingsService(env.DB);
    const resendApiKey = await settingsService.getResendApiKey(env.RESEND_API_KEY);

    const data = await request.json();
    const { email, source, firstName, lastName, userId } = data;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!source || !['signup', 'footer', 'admin'].includes(source)) {
      return new Response(JSON.stringify({ error: 'Valid source is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Look up if email belongs to an existing user
    let existingUser = null;
    if (!userId) {
      existingUser = await env.DB.prepare(`
        SELECT id, name FROM users WHERE email = ?
      `).bind(email).first();
    }

    // Check if email already exists in subscribers
    const existingSubscriber = await env.DB.prepare(`
      SELECT id, is_active, user_id, unsubscribed_at FROM subscribers WHERE email = ?
    `).bind(email).first();

    if (existingSubscriber) {
      if (existingSubscriber.is_active) {
        // Already subscribed - return thank you message
        return new Response(JSON.stringify({
          success: true,
          message: 'Thank you! This email is already subscribed to our newsletter.',
          alreadySubscribed: true
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        // Reactivate subscription and link to user if found
        const linkedUserId = userId || existingUser?.id || existingSubscriber.user_id;

        await env.DB.prepare(`
          UPDATE subscribers
          SET is_active = TRUE,
              unsubscribed_at = NULL,
              updated_at = CURRENT_TIMESTAMP,
              source = ?,
              user_id = ?,
              country = COALESCE(country, ?),
              country_detected_at = CASE WHEN country IS NULL AND ? IS NOT NULL THEN CURRENT_TIMESTAMP ELSE country_detected_at END
          WHERE email = ?
        `).bind(source, linkedUserId, country, country, email).run();

        return new Response(JSON.stringify({
          success: true,
          message: 'Welcome back! Your subscription has been reactivated.'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Generate unique ID and verification token
    const subscriberId = crypto.randomUUID();
    const verificationToken = crypto.randomUUID();

    // Get request metadata
    const userAgent = request.headers.get('user-agent') || '';
    const referrer = request.headers.get('referer') || '';

    // Detect country from Cloudflare headers
    const country = request.headers.get('CF-IPCountry') || request.headers.get('cf-ipcountry') || null;
    console.log('Detected country during subscription:', country);

    // Determine user ID for linking (explicit userId, existing user, or null)
    const linkedUserId = userId || existingUser?.id || null;

    // Create new subscription
    const result = await env.DB.prepare(`
      INSERT INTO subscribers (
        id, email, user_id, source, ip_address, user_agent, referrer_url,
        first_name, last_name, verification_token, is_verified,
        country, country_detected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      subscriberId,
      email,
      linkedUserId,
      source,
      clientAddress || null,
      userAgent,
      referrer,
      firstName || existingUser?.name?.split(' ')[0] || null, // Use first name from user if available
      lastName || (existingUser?.name?.split(' ').slice(1).join(' ')) || null, // Use last name from user if available
      verificationToken,
      source === 'admin' ? true : false, // Admin subscriptions are auto-verified
      country,
      country ? new Date().toISOString() : null
    ).run();

    if (!result.success) {
      throw new Error('Failed to create subscription');
    }

    // Mirror into the unified cms-users `users` table (email-only subscriber =
    // users row, password_hash NULL + promotional consent) so the unified
    // Subscribers admin stays in sync. Wrapped — never break the subscribe flow.
    try {
      const mirrorName = [
        firstName || existingUser?.name?.split(' ')[0],
        lastName || existingUser?.name?.split(' ').slice(1).join(' '),
      ].filter(Boolean).join(' ') || null;
      await env.DB.prepare(`
        INSERT INTO users (id, email, name, password_hash, role, status, language_code,
          promotional_email_consent, transactional_email_consent, unsubscribe_token, created_at, updated_at)
        VALUES (?, ?, ?, NULL, 'user', 'active', 'en', 1, 0, ?, datetime('now'), datetime('now'))
        ON CONFLICT(email) DO UPDATE SET promotional_email_consent = 1,
          name = COALESCE(users.name, excluded.name), updated_at = datetime('now')
      `).bind(crypto.randomUUID(), email, mirrorName, crypto.randomUUID()).run();
    } catch (mirrorError) {
      console.error('users mirror (subscribe) failed:', mirrorError);
    }

    // Send verification email (if not admin)
    let emailSent = false;
    if (source !== 'admin') {
      try {
        if (!resendApiKey) {
          throw new Error('Resend key is not configured');
        }
        const emailService = new EmailService(resendApiKey, env?.CMS_USERS_EMAIL_FROM || 'Easy Yield <noreply@easyyield.ca>');
        emailSent = await sendSubscriptionVerification(emailService, email, verificationToken);

        if (emailSent) {
          // Update verification sent timestamp
          await env.DB.prepare(`
            UPDATE subscribers
            SET verification_sent_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(subscriberId).run();
        }
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Don't fail subscription if email sending fails
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: source === 'admin' ? 'Subscription created successfully' :
               emailSent ? 'Please check your email to verify your subscription' :
               'Subscription created, but verification email could not be sent. Please contact support.',
      subscriberId: subscriberId,
      requiresVerification: source !== 'admin',
      emailSent: source === 'admin' ? null : emailSent
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Subscription error:', error);
    return new Response(JSON.stringify({ error: 'Failed to create subscription' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};