import type { APIRoute } from 'astro';
import { EmailService } from '@cms/cms-core';
import { sendSubscriptionVerification } from '../../lib/email';
import { RuntimeSettingsService } from '../../lib/services/runtimeSettings.js';

// POST - Resend verification email for subscription
export const POST: APIRoute = async ({ request, locals }) => {
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

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Email integration is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await request.json();
    const { email } = data;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Find unverified subscription
    const subscription = await env.DB.prepare(`
      SELECT id, email, verification_token, is_verified, is_active
      FROM subscribers
      WHERE email = ? AND is_active = TRUE
    `).bind(email).first();

    if (!subscription) {
      return new Response(JSON.stringify({ error: 'Active subscription not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (subscription.is_verified) {
      return new Response(JSON.stringify({ error: 'Email is already verified' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate new verification token if needed
    let verificationToken = subscription.verification_token;
    if (!verificationToken) {
      verificationToken = crypto.randomUUID();
      await env.DB.prepare(`
        UPDATE subscribers
        SET verification_token = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(verificationToken, subscription.id).run();
    }

    // Send verification email
    try {
      const emailService = new EmailService(resendApiKey, env?.CMS_USERS_EMAIL_FROM || 'Easy Yield <noreply@easyyield.ca>');
      const emailSent = await sendSubscriptionVerification(emailService, email, verificationToken);

      if (emailSent) {
        // Update verification sent timestamp
        await env.DB.prepare(`
          UPDATE subscribers
          SET verification_sent_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(subscription.id).run();

        return new Response(JSON.stringify({
          success: true,
          message: 'Verification email sent successfully'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        throw new Error('Failed to send email');
      }
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      return new Response(JSON.stringify({ error: 'Failed to send verification email' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Resend verification error:', error);
    return new Response(JSON.stringify({ error: 'Failed to resend verification email' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};