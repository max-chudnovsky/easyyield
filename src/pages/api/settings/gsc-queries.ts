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

async function getOAuthAccessToken(settings: RuntimeSettingsService): Promise<string> {
  const clientId = (await settings.getSetting('gsc_oauth_client_id')) || '';
  const clientSecret = (await settings.getSetting('gsc_oauth_client_secret')) || '';
  const refreshToken = (await settings.getSetting('gsc_oauth_refresh_token')) || '';

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google OAuth is not connected yet');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokenJson: any = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(`Token refresh failed: ${tokenJson.error || 'unknown_error'}`);
  }

  return tokenJson.access_token;
}

async function getServiceAccountAccessToken(settings: RuntimeSettingsService): Promise<string> {
  const saJson = (await settings.getSetting('gsc_service_account_json')) || '';
  if (!saJson.trim()) {
    throw new Error('GSC service account JSON is not configured');
  }

  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const base64url = (input: string) =>
    Buffer.from(input)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const cryptoMod: any = await import('node:crypto');
  const signer = cryptoMod.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const sig = signer.sign(sa.private_key).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const assertion = `${unsigned}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const tokenJson: any = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(`Service account token mint failed: ${tokenJson.error || 'unknown_error'}`);
  }

  return tokenJson.access_token;
}

export const GET: APIRoute = async (context) => {
  try {
    const adminError = await requireAdmin(context);
    if (adminError) return adminError;

    const env = (context.locals as any)?.env;
    const settings = new RuntimeSettingsService(env.DB);

    const property = ((await settings.getSetting('gsc_property')) || '').trim();
    if (!property) {
      return new Response(JSON.stringify({ error: 'GSC property is not configured' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const source = ((await settings.getSetting('gsc_auth_source')) || 'service_account').trim();

    let accessToken: string;
    if (source === 'oauth') {
      accessToken = await getOAuthAccessToken(settings);
    } else {
      accessToken = await getServiceAccountAccessToken(settings);
    }

    const end = new Date();
    end.setDate(end.getDate() - 3);
    const start = new Date(end);
    start.setDate(start.getDate() - 27);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const searchRes = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: fmt(start),
          endDate: fmt(end),
          dimensions: ['query'],
          rowLimit: 25,
          startRow: 0,
          aggregationType: 'auto',
          dataState: 'final',
        }),
      }
    );

    const searchJson: any = await searchRes.json();
    if (!searchRes.ok) {
      return new Response(JSON.stringify({
        error: searchJson?.error?.message || 'GSC query failed',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rows = (searchJson.rows || []).map((r: any) => ({
      query: r.keys?.[0] || '',
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: r.ctr || 0,
      position: r.position || 0,
    }));

    return new Response(JSON.stringify({
      property,
      authSource: source,
      startDate: fmt(start),
      endDate: fmt(end),
      count: rows.length,
      rows,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('GSC query endpoint error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Failed to fetch GSC queries' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
