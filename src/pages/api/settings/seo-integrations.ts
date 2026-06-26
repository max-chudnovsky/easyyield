import type { APIRoute } from 'astro';
import { AuthService } from '../../../lib/services/auth.js';
import { RuntimeSettingsService } from '../../../lib/services/runtimeSettings.js';

export const prerender = false;

async function requireAdmin(context: any): Promise<{ user: any } | Response> {
  const env = context.locals?.env;
  if (!env?.DB || !env?.CACHE) {
    return new Response(JSON.stringify({ error: 'Database not available' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
  const sessionToken = context.cookies.get('easyyield_session')?.value;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }
  const authService = new AuthService(env.DB, env.CACHE);
  const authResult = await authService.checkAuthentication(sessionToken);
  if (!authResult.isAuthenticated || !authResult.user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }
  if (authResult.user.group !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    });
  }
  return { user: authResult.user };
}

export const GET: APIRoute = async (context) => {
  try {
    const result = await requireAdmin(context);
    if (result instanceof Response) return result;

    const env = (context.locals as any)?.env;
    const settings = new RuntimeSettingsService(env.DB);

    const siteUrl           = await settings.getSetting('seo_site_url');
    const gscServiceAccount = await settings.getSetting('gsc_service_account_json');
    const gscProperty       = await settings.getSetting('gsc_property');
    const gscAuthSource     = await settings.getSetting('gsc_auth_source');
    const gscOauthClientId  = await settings.getSetting('gsc_oauth_client_id');
    const gscOauthSecret    = await settings.getSetting('gsc_oauth_client_secret');
    const gscOauthRefresh   = await settings.getSetting('gsc_oauth_refresh_token');
    const indexnowKey       = await settings.getOrCreateIndexNowKey();
    const bingIndexnowUrl   = await settings.getSetting('bing_indexnow_url');
    const psiApiKey         = await settings.getSetting('psi_api_key');

    return new Response(JSON.stringify({
      siteUrl: siteUrl || '',
      gscProperty: gscProperty || '',
      gscAuthSource: gscAuthSource || 'service_account',
      gscServiceAccountSet: Boolean(gscServiceAccount),
      gscServiceAccountMasked: gscServiceAccount
        ? `${gscServiceAccount.slice(0, 40)}…` : null,
      gscOauthClientId: gscOauthClientId || '',
      gscOauthClientSecretSet: Boolean(gscOauthSecret && gscOauthSecret.trim()),
      gscOauthRefreshTokenSet: Boolean(gscOauthRefresh && gscOauthRefresh.trim()),
      indexnowKey,
      indexnowKeyPath: `/${indexnowKey}.txt`,
      bingIndexnowUrl: bingIndexnowUrl || 'https://www.bing.com/indexnow',
      psiApiKeySet: Boolean(psiApiKey && psiApiKey.trim()),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to load SEO integration settings' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const result = await requireAdmin(context);
    if (result instanceof Response) return result;

    const env = (context.locals as any)?.env;
    const settings = new RuntimeSettingsService(env.DB);
    const body = await context.request.json();

    const saves: Promise<void>[] = [];

    if (body.siteUrl !== undefined) {
      saves.push(settings.setSetting('seo_site_url', body.siteUrl.trim()));
    }
    if (body.gscProperty !== undefined) {
      saves.push(settings.setSetting('gsc_property', body.gscProperty.trim()));
    }
    if (body.gscAuthSource !== undefined) {
      const src = String(body.gscAuthSource || '').trim();
      const normalized = src === 'oauth' ? 'oauth' : 'service_account';
      saves.push(settings.setSetting('gsc_auth_source', normalized));
    }
    if (body.gscServiceAccountJson !== undefined && body.gscServiceAccountJson.trim()) {
      // Basic JSON validation
      try { JSON.parse(body.gscServiceAccountJson.trim()); } catch {
        return new Response(JSON.stringify({ error: 'Service Account JSON is not valid JSON' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }
      saves.push(settings.setSetting('gsc_service_account_json', body.gscServiceAccountJson.trim()));
    }
    if (body.gscOauthClientId !== undefined) {
      saves.push(settings.setSetting('gsc_oauth_client_id', String(body.gscOauthClientId || '').trim()));
    }
    if (body.gscOauthClientSecret !== undefined) {
      const trimmedSecret = String(body.gscOauthClientSecret || '').trim();
      if (trimmedSecret) {
        saves.push(settings.setSetting('gsc_oauth_client_secret', trimmedSecret));
      }
    }
    if (body.bingIndexnowUrl !== undefined) {
      saves.push(settings.setSetting('bing_indexnow_url', body.bingIndexnowUrl.trim()));
    }
    if (body.psiApiKey !== undefined) {
      const trimmedPsiKey = String(body.psiApiKey || '').trim();
      if (trimmedPsiKey) {
        saves.push(settings.setSetting('psi_api_key', trimmedPsiKey));
      }
    }

    await Promise.all(saves);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to save SEO integration settings' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
