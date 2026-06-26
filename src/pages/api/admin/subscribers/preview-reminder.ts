import type { APIRoute } from 'astro';
import { AuthService } from '../../../../lib/services/auth.js';
import { RuntimeSettingsService } from '../../../../lib/services/runtimeSettings.js';

export const prerender = false;

function buildVerificationReminderEmail(firstName: string, verifyUrl: string, unsubUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Please verify your email</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <tr>
    <td style="background:linear-gradient(135deg,#f59e0b 0%,#ea580c 100%);padding:36px 40px;text-align:center">
      <p style="margin:0 0 6px;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">Easy Yield</p>
      <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;line-height:1.3">Please verify your email</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:36px 40px">
      <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7">Hi ${firstName},</p>
      <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7">Thanks for subscribing to Easy Yield updates! We want to make sure we're only sending new comics and money tips to active inboxes.</p>
      <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7">We deeply respect your privacy and your inbox space. Because we don't believe in holding onto data or sending unwanted emails, our system automatically cleans up unverified email addresses after a few days.</p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.7">To ensure our updates actually make it to you (and don't get lost in the spam folder), could you take two seconds to confirm your address?</p>
      <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px">
        <tr>
          <td style="background:linear-gradient(135deg,#f59e0b 0%,#ea580c 100%);border-radius:8px">
            <a href="${verifyUrl}" style="display:inline-block;padding:15px 36px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.01em">Confirm My Subscription &rarr;</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.7">Once confirmed, you'll instantly lock in access to:</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px">
        <tr><td style="padding:10px 16px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0"><p style="margin:0;color:#374151;font-size:14px;line-height:1.6"><strong style="color:#b45309">New Comics & Vlogs:</strong> Be the first to see each new Easy Yield episode.</p></td></tr>
        <tr><td style="height:8px"></td></tr>
        <tr><td style="padding:10px 16px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0"><p style="margin:0;color:#374151;font-size:14px;line-height:1.6"><strong style="color:#b45309">Canadian Money Tips:</strong> Friendly, practical guidance for TFSAs, RRSPs, FHSAs and more.</p></td></tr>
        <tr><td style="height:8px"></td></tr>
        <tr><td style="padding:10px 16px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0"><p style="margin:0;color:#374151;font-size:14px;line-height:1.6"><strong style="color:#b45309">Subscriber Exclusives:</strong> Early access and member-only content.</p></td></tr>
      </table>
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.7">If you have any questions about how we handle your information, feel free to review our <a href="https://easyyield.ca/privacy" style="color:#d97706;text-decoration:underline">Privacy Policy</a> and <a href="https://easyyield.ca/data-use-policy" style="color:#d97706;text-decoration:underline">Data Use Policy</a>.</p>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 40px 28px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;line-height:1.7">Thank you for staying on the insider list!</p>
      <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.7">You received this because you subscribed to Easy Yield updates.&nbsp;&nbsp;<a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a></p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export const POST: APIRoute = async (context) => {
  try {
    const env = (context.locals as any)?.env;
    if (!env?.DB || !env?.CACHE) return Response.json({ error: 'Database not available' }, { status: 500 });

    const sessionToken = context.cookies.get('easyyield_session')?.value;
    if (!sessionToken) return Response.json({ error: 'Not authenticated' }, { status: 401 });

    const auth = new AuthService(env.DB, env.CACHE);
    const result = await auth.checkAuthentication(sessionToken);
    if (!result.isAuthenticated || result.user?.group !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const settingsService = new RuntimeSettingsService(env.DB);
    const resendKey = await settingsService.getResendApiKey(env.RESEND_API_KEY);
    if (!resendKey) return Response.json({ error: 'Resend API key not configured' }, { status: 500 });

    const { results: admins } = await env.DB.prepare(
      `SELECT email, name FROM users WHERE "group" = 'admin'`
    ).all<{ email: string; name: string | null }>();

    if (!admins?.length) return Response.json({ error: 'No admin users found' }, { status: 400 });

    const emails = admins.map(admin => {
      const name = admin.name?.trim().split(/\s+/)[0] || 'there';
      const unsubUrl = `https://easyyield.ca/api/unsubscribe?email=${encodeURIComponent(admin.email)}`;
      const previewBanner = `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:12px auto"><tr><td style="padding:10px 16px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;font-size:12px;color:#92400e;text-align:center">This is a preview sent to admins only. The verify button is not functional.</td></tr></table>`;
      return {
        from: 'Easy Yield <noreply@easyyield.ca>',
        to: [admin.email],
        subject: '[PREVIEW] Please verify your email',
        html: buildVerificationReminderEmail(name, '#preview-disabled', unsubUrl) + previewBanner,
      };
    });

    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emails),
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Resend error: ${err}` }, { status: 500 });
    }

    return Response.json({ ok: true, sent: admins.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
};
