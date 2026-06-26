import type { APIRoute } from 'astro';
import { AuthService } from '../../../lib/services/auth.js';
import { EmailService } from '@cms/cms-core';
import { sendSettingsTest } from '../../../lib/email';
import { RuntimeSettingsService } from '../../../lib/services/runtimeSettings.js';

export const prerender = false;

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

    if (!authResult.isAuthenticated || !authResult.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const settingsService = new RuntimeSettingsService(env.DB);
    const resendApiKey = await settingsService.getResendApiKey(env.RESEND_API_KEY);

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Resend integration is not configured' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const emailService = new EmailService(resendApiKey, env?.CMS_USERS_EMAIL_FROM || 'Easy Yield <noreply@easyyield.ca>');
    const sent = await sendSettingsTest(emailService, authResult.user.email);

    if (!sent) {
      return new Response(JSON.stringify({ error: 'Failed to send test email' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true, message: 'Test email sent successfully.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Test email error:', error);
    return new Response(JSON.stringify({ error: 'Failed to send test email' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
