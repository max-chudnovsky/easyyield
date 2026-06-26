import type { APIRoute } from 'astro';
import { AuthService } from '../../../lib/services/auth.js';
import { RuntimeSettingsService } from '../../../lib/services/runtimeSettings.js';

export const prerender = false;

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

    if (!authResult.isAuthenticated || !authResult.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const settingsService = new RuntimeSettingsService(env.DB);
    const dbResendApiKey = await settingsService.getSetting('resend_api_key');
    const effectiveResendKey = await settingsService.getResendApiKey(env.RESEND_API_KEY);

    return new Response(JSON.stringify({
      resendConfigured: Boolean(effectiveResendKey),
      source: dbResendApiKey ? 'database' : (env.RESEND_API_KEY ? 'environment' : 'none'),
      maskedDbKey: RuntimeSettingsService.maskSecret(dbResendApiKey),
      fromEmail: 'Easy Yield <noreply@easyyield.ca>',
      contactEmail: env.CONTACT_EMAIL || 'info@easyyield.ca',
      currentUserEmail: authResult.user.email,
      canEdit: authResult.user.group === 'admin'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Resend status error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch settings status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

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

    if (authResult.user.group !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { resendApiKey } = await context.request.json();
    const settingsService = new RuntimeSettingsService(env.DB);

    const trimmedKey = typeof resendApiKey === 'string' ? resendApiKey.trim() : '';
    if (!trimmedKey) {
      await settingsService.deleteSetting('resend_api_key');
      return new Response(JSON.stringify({
        success: true,
        message: 'Database Resend key removed. Environment fallback will be used if configured.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!trimmedKey.startsWith('re_') || trimmedKey.length < 16) {
      return new Response(JSON.stringify({ error: 'Invalid Resend API key format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await settingsService.setSetting('resend_api_key', trimmedKey);

    return new Response(JSON.stringify({
      success: true,
      message: 'Resend API key saved to database settings.',
      maskedDbKey: RuntimeSettingsService.maskSecret(trimmedKey)
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Update resend key error:', error);
    return new Response(JSON.stringify({ error: 'Failed to update Resend key' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
