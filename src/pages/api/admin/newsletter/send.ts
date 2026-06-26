import type { APIRoute } from 'astro';
import { AuthService } from '../../../../lib/services/auth.js';
import { RuntimeSettingsService } from '../../../../lib/services/runtimeSettings.js';

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

    const { subject, html, test } = await context.request.json() as { subject: string; html: string; test?: boolean };
    if (!subject?.trim() || !html?.trim()) {
      return Response.json({ error: 'Subject and body are required' }, { status: 400 });
    }

    const settingsService = new RuntimeSettingsService(env.DB);
    const resendApiKey = await settingsService.getResendApiKey(env.RESEND_API_KEY);
    if (!resendApiKey) {
      return Response.json({ error: 'Resend API key not configured. Add it in Settings.' }, { status: 500 });
    }

    // Test mode: send only to admin users
    if (test) {
      const { results: admins } = await env.DB.prepare(
        `SELECT email, name FROM users WHERE "group" = 'admin' ORDER BY created_at ASC`
      ).all<{ email: string; name: string | null }>();

      if (!admins || admins.length === 0) {
        return Response.json({ error: 'No admin users found' }, { status: 400 });
      }

      const testSubject = `[TEST] ${subject.trim()}`;
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(admins.map(admin => {
          const nameParts = admin.name?.trim().split(/\s+/) ?? [];
          const fakeSub = {
            email: admin.email,
            first_name: nameParts[0] ?? null,
            last_name: nameParts.slice(1).join(' ') || null,
            first_name_valid: 1,
          };
          const personalizedHtml = applyTemplates(html.trim(), fakeSub)
            + `<div style="margin-top:40px;padding:24px 16px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af;line-height:1.6;">
              You're receiving this email because you subscribed to updates from <strong style="color:#9ca3af;">Easy Yield</strong>.<br>
              If you no longer wish to receive these emails, <span style="color:#6b7280;text-decoration:underline;">unsubscribe here</span>.
            </div>`
            + `<div style="margin-top:16px;padding:12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;font-size:12px;color:#92400e;">This is a test email — unsubscribe link is disabled.</div>`;
          return {
            from: 'Easy Yield <noreply@easyyield.ca>',
            to: [admin.email],
            subject: applyTemplates(testSubject, fakeSub),
            html: personalizedHtml,
          };
        })),
      });
      if (!res.ok) {
        const err = await res.text();
        return Response.json({ error: `Resend error: ${err}` }, { status: 500 });
      }
      return Response.json({ ok: true, test: true, sent: admins.length });
    }

    // Fetch all active verified subscribers
    const { results: subscribers } = await env.DB.prepare(
      `SELECT id, email, first_name, last_name, first_name_valid FROM subscribers WHERE is_verified = 1 AND is_active = 1 ORDER BY subscribed_at ASC`
    ).all<{ id: string; email: string; first_name: string | null; last_name: string | null; first_name_valid: number | null }>();

    if (!subscribers || subscribers.length === 0) {
      return Response.json({ error: 'No active verified subscribers found' }, { status: 400 });
    }

    function applyTemplates(text: string, sub: { email: string; first_name: string | null; last_name: string | null; first_name_valid: number | null }): string {
      // Use first_name only if AI confirmed it's valid (first_name_valid = 1); unchecked (null) names are used as-is
      const useName = sub.first_name_valid === 0 ? null : sub.first_name;
      return text
        .replace(/\{\{first_name\}\}/gi, useName?.trim() || 'there')
        .replace(/\{\{last_name\}\}/gi,  sub.last_name?.trim() || '')
        .replace(/\{\{email\}\}/gi,      sub.email);
    }

    function unsubscribeFooter(email: string): string {
      const unsubUrl = `https://easyyield.ca/api/unsubscribe?email=${encodeURIComponent(email)}`;
      return `<div style="margin-top:40px;padding:24px 16px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af;line-height:1.6;">
        You're receiving this email because you subscribed to updates from <strong style="color:#9ca3af;">Easy Yield</strong>.<br>
        If you no longer wish to receive these emails,
        <a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline;">unsubscribe here</a>.
      </div>`;
    }

    // Resend batch API supports up to 100 emails per call
    const BATCH = 100;
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < subscribers.length; i += BATCH) {
      const chunk = subscribers.slice(i, i + BATCH);
      const batch = chunk.map(sub => {
        const personalizedHtml = applyTemplates(html, sub) + unsubscribeFooter(sub.email);
        return {
          from: 'Easy Yield <noreply@easyyield.ca>',
          to: [sub.email],
          subject: applyTemplates(subject.trim(), sub),
          html: personalizedHtml,
        };
      });

      try {
        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batch),
        });

        if (res.ok) {
          sent += chunk.length;
        } else {
          const err = await res.text();
          console.error('Resend batch error:', err);
          failed += chunk.length;
        }
      } catch (e) {
        console.error('Resend batch exception:', e);
        failed += chunk.length;
      }
    }

    return Response.json({ ok: true, sent, failed, total: subscribers.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Newsletter send error:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
};
