import type { APIRoute } from 'astro';
import { AuthService } from '../../../lib/services/auth.js';
import { RuntimeSettingsService } from '../../../lib/services/runtimeSettings.js';

export const prerender = false;

async function requireAdmin(context: any): Promise<Response | null> {
  const env = context.locals?.env;
  if (!env?.DB || !env?.CACHE) {
    return new Response(JSON.stringify({ error: 'Database not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessionToken = context.cookies.get('easyyield_session')?.value;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authService = new AuthService(env.DB, env.CACHE);
  const authResult = await authService.checkAuthentication(sessionToken);
  if (!authResult.isAuthenticated || !authResult.user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (authResult.user.group !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return null;
}

export const GET: APIRoute = async (context) => {
  try {
    const adminError = await requireAdmin(context);
    if (adminError) {
      const origin = new URL(context.request.url).origin;
      return new Response(null, {
        status: 302,
        headers: { Location: `${origin}/settings?gsc_oauth=error&reason=not_authenticated` },
      });
    }

    const env = (context.locals as any)?.env;
    const settings = new RuntimeSettingsService(env.DB);

    const clientId = (await settings.getSetting('gsc_oauth_client_id')) || '';
    const clientSecret = (await settings.getSetting('gsc_oauth_client_secret')) || '';

    if (!clientId || !clientSecret) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${new URL(context.request.url).origin}/settings?gsc_oauth=error&reason=missing_oauth_client_config` },
      });
    }

    const baseUrl = new URL(context.request.url).origin;
    const redirectUri = `${baseUrl}/api/settings/gsc-oauth-callback`;
    const state = crypto.randomUUID();

    await settings.setSetting('gsc_oauth_state', state);

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/webmasters.readonly');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('state', state);

    return new Response(null, {
      status: 302,
      headers: { Location: authUrl.toString() },
    });
  } catch (error) {
    console.error('GSC OAuth start error:', error);
    const origin = new URL(context.request.url).origin;
    return new Response(null, {
      status: 302,
      headers: { Location: `${origin}/settings?gsc_oauth=error&reason=start_failed` },
    });
  }
};
