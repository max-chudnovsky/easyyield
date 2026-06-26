import type { APIRoute } from 'astro';
import { RuntimeSettingsService } from '../../../lib/services/runtimeSettings.js';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const env = (context.locals as any)?.env;
    if (!env?.DB) {
      return new Response('Database not available', { status: 500 });
    }

    const url = new URL(context.request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    const settingsPageUrl = `${url.protocol}//${url.host}/settings`;

    if (error) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${settingsPageUrl}?gsc_oauth=error&reason=${encodeURIComponent(error)}` },
      });
    }

    if (!code || !state) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${settingsPageUrl}?gsc_oauth=error&reason=missing_code_or_state` },
      });
    }

    const settings = new RuntimeSettingsService(env.DB);
    const expectedState = await settings.getSetting('gsc_oauth_state');
    if (!expectedState || expectedState !== state) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${settingsPageUrl}?gsc_oauth=error&reason=invalid_state` },
      });
    }

    const clientId = (await settings.getSetting('gsc_oauth_client_id')) || '';
    const clientSecret = (await settings.getSetting('gsc_oauth_client_secret')) || '';

    if (!clientId || !clientSecret) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${settingsPageUrl}?gsc_oauth=error&reason=missing_client_config` },
      });
    }

    const baseUrl = `${url.protocol}//${url.host}`;
    const redirectUri = `${baseUrl}/api/settings/gsc-oauth-callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Google token exchange failed:', tokenJson);
      return new Response(null, {
        status: 302,
        headers: { Location: `${settingsPageUrl}?gsc_oauth=error&reason=${encodeURIComponent(tokenJson.error || 'token_exchange_failed')}` },
      });
    }

    if (!tokenJson.refresh_token) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${settingsPageUrl}?gsc_oauth=error&reason=no_refresh_token` },
      });
    }

    await settings.setSetting('gsc_oauth_refresh_token', tokenJson.refresh_token);
    await settings.deleteSetting('gsc_oauth_state');

    return new Response(null, {
      status: 302,
      headers: { Location: `${settingsPageUrl}?gsc_oauth=connected` },
    });
  } catch (error) {
    console.error('GSC OAuth callback error:', error);
    const url = new URL(context.request.url);
    const settingsPageUrl = `${url.protocol}//${url.host}/settings`;
    return new Response(null, {
      status: 302,
      headers: { Location: `${settingsPageUrl}?gsc_oauth=error&reason=callback_failed` },
    });
  }
};
