import type { APIRoute } from 'astro';
import { AuthService } from '../../../../lib/services/auth.js';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const env = (context.locals as any)?.env;
    if (!env?.DB || !env?.CACHE) {
      return Response.json({ error: 'Database not available' }, { status: 500 });
    }

    const sessionToken = context.cookies.get('easyyield_session')?.value;
    if (!sessionToken) return Response.json({ error: 'Not authenticated' }, { status: 401 });

    const authService = new AuthService(env.DB, env.CACHE);
    const authResult = await authService.checkAuthentication(sessionToken);
    if (!authResult.isAuthenticated || authResult.user?.group !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    if (!env?.AI) {
      return Response.json({ error: 'AI binding not available' }, { status: 500 });
    }

    // Only fetch names not yet checked
    const { results: rows } = await env.DB.prepare(
      `SELECT id, first_name FROM subscribers
       WHERE first_name IS NOT NULL AND trim(first_name) != '' AND first_name_valid IS NULL
       LIMIT 200`
    ).all<{ id: string; first_name: string }>();

    if (!rows || rows.length === 0) {
      return Response.json({ ok: true, checked: 0, valid: 0, gibberish: 0, message: 'No unchecked names found' });
    }

    let valid = 0, gibberish = 0;

    for (const row of rows) {
      let isValid = true;
      try {
        const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            {
              role: 'system',
              content: 'You are a validator. Answer only "yes" or "no", nothing else.',
            },
            {
              role: 'user',
              content: `Is "${row.first_name.trim()}" a plausible human first name?`,
            },
          ],
          max_tokens: 5,
        });
        const answer = (response?.response ?? '').toLowerCase().trim();
        isValid = answer.startsWith('yes');
      } catch {
        // If AI fails for a row, leave it unchecked (don't mark it)
        continue;
      }

      await env.DB.prepare(
        `UPDATE subscribers SET first_name_valid = ? WHERE id = ?`
      ).bind(isValid ? 1 : 0, row.id).run();

      if (isValid) valid++; else gibberish++;
    }

    return Response.json({ ok: true, checked: valid + gibberish, valid, gibberish });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('check-names error:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
};
