// Easy Yield's single transactional-email module — the replicable-to-milkplays
// pattern. All sends go through cms-core's Workers-native `EmailService`
// (fetch → api.resend.com, never throws, returns `{ success }`). There is no
// plaintext `text` field: cms-core sends HTML only.
//
// HTML/subjects here are copied VERBATIM from the two legacy Easy Yield email
// implementations (src/services/emailService.ts + src/lib/services/emailService.ts)
// so subscribers/contacts receive byte-for-byte the same emails. Faithfulness
// over reuse — we deliberately do NOT swap in cms-core's shared templates,
// which render different markup.
import { EmailService } from '@cms/cms-core';

/** Build a cms-core EmailService from the Worker env bindings. */
export function getEmailService(env: any): EmailService {
  return new EmailService(
    env?.RESEND_API_KEY || '',
    env?.CMS_USERS_EMAIL_FROM || 'Easy Yield <noreply@easyyield.ca>'
  );
}

// A sender may receive either the raw env (and build a service) or an
// already-constructed EmailService (callers that resolved a runtime key).
type EnvOrService = any;

function resolveService(envOrService: EnvOrService): EmailService {
  return envOrService instanceof EmailService ? envOrService : getEmailService(envOrService);
}

// ── Newsletter subscription verification ────────────────────────────────────
function verificationHtml(verificationUrl: string): string {
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirm Your Subscription</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="https://easyyield.ca/images/easyyield-logo.png" alt="Easy Yield" style="height: 50px;">
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin: 20px 0;">
          <h1 style="color: #d97706; margin-bottom: 20px;">Confirm Your Subscription</h1>

          <p>Thank you for subscribing to the Easy Yield newsletter! We're excited to have you join our community.</p>

          <p>To complete your subscription and start receiving our updates, please click the button below:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}"
               style="background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
                      color: white;
                      padding: 15px 30px;
                      text-decoration: none;
                      border-radius: 8px;
                      font-weight: bold;
                      display: inline-block;
                      box-shadow: 0 4px 15px rgba(217, 119, 6, 0.3);">
              Confirm Subscription
            </a>
          </div>

          <p style="color: #666; font-size: 14px;">If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p style="color: #666; font-size: 14px; word-break: break-all;">${verificationUrl}</p>
        </div>

        <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">What to expect:</h3>
          <ul style="color: #666;">
            <li>New Easy Yield comics and vlogs</li>
            <li>Clear, friendly Canadian personal-finance tips</li>
            <li>TFSA, RRSP, FHSA, saving and investing explainers</li>
            <li>Subscriber-exclusive content and early access</li>
          </ul>
        </div>

        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #666; font-size: 14px;">
          <p>If you didn't subscribe to our newsletter, you can safely ignore this email.</p>
          <p>© ${new Date().getFullYear()} Easy Yield. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;
}

export async function sendSubscriptionVerification(
  envOrService: EnvOrService,
  email: string,
  verificationToken: string
): Promise<boolean> {
  const verificationUrl = `https://easyyield.ca/api/verify-subscription?token=${verificationToken}`;
  const result = await resolveService(envOrService).send({
    to: email,
    subject: 'Confirm your Easy Yield newsletter subscription',
    html: verificationHtml(verificationUrl),
  });
  return result.success;
}

// ── Subscriber welcome (post-verification) ──────────────────────────────────
function subscriberWelcomeHtml(firstName?: string): string {
  const greeting = firstName ? `Hi ${firstName}` : 'Hello';

  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Easy Yield!</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <img src="https://easyyield.ca/images/easyyield-logo.png" alt="Easy Yield" style="height: 50px;">
        </div>

        <div style="background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%); color: white; padding: 30px; border-radius: 10px; margin: 20px 0; text-align: center;">
          <h1 style="margin: 0 0 15px 0;">Welcome to the Easy Yield Newsletter!</h1>
          <p style="margin: 0; font-size: 18px; opacity: 0.9;">${greeting}, you're now part of the Easy Yield community!</p>
        </div>

        <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin: 20px 0;">
          <h2 style="color: #333; margin-top: 0;">Your money journey just got easier!</h2>

          <p>Your subscription is now active, and you'll receive:</p>

          <div style="display: grid; gap: 15px; margin: 20px 0;">
            <div style="display: flex; align-items: center;">
              <span style="background: #0f766e; color: white; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 15px; font-weight: bold;">💬</span>
              <span>New Easy Yield comics and vlogs</span>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="background: #0f766e; color: white; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 15px; font-weight: bold;">🍁</span>
              <span>Clear, friendly Canadian personal-finance tips</span>
            </div>
            <div style="display: flex; align-items: center;">
              <span style="background: #0f766e; color: white; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 15px; font-weight: bold;">📈</span>
              <span>TFSA, RRSP, FHSA, saving and investing explainers</span>
            </div>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://www.youtube.com/channel/UCJ6fa6JxMw3hA15TVvC2EWg"
               style="background: linear-gradient(135deg, #0f766e 0%, #10b981 100%);
                      color: white;
                      padding: 15px 30px;
                      text-decoration: none;
                      border-radius: 8px;
                      font-weight: bold;
                      display: inline-block;
                      box-shadow: 0 4px 15px rgba(15, 118, 110, 0.3);">
              Watch on YouTube
            </a>
          </div>
        </div>

        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #666; font-size: 14px;">
          <p>Follow Easy Yield on YouTube for new comics and videos!</p>
          <div style="margin: 15px 0;">
            <a href="https://www.youtube.com/channel/UCJ6fa6JxMw3hA15TVvC2EWg" style="color: #0f766e; text-decoration: none; margin: 0 10px;">YouTube</a>
          </div>
          <p>© ${new Date().getFullYear()} Easy Yield. All rights reserved.</p>
          <p><a href="https://easyyield.ca/api/unsubscribe?email={email}" style="color: #999; font-size: 12px;">Unsubscribe</a></p>
        </div>
      </body>
      </html>
    `;
}

export async function sendSubscriberWelcome(
  envOrService: EnvOrService,
  email: string,
  firstName?: string
): Promise<boolean> {
  const result = await resolveService(envOrService).send({
    to: email,
    subject: 'Welcome to the Easy Yield newsletter!',
    html: subscriberWelcomeHtml(firstName),
  });
  return result.success;
}

// ── Contact form (to support) ───────────────────────────────────────────────
export async function sendContactForm(
  envOrService: EnvOrService,
  formData: {
    firstName: string;
    lastName: string;
    email: string;
    subject: string;
    message: string;
  }
): Promise<boolean> {
  const { firstName, lastName, email, subject, message } = formData;

  const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ea580c;">New Contact Form Submission</h2>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Name:</strong> ${firstName} ${lastName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <div style="background: white; padding: 15px; border-radius: 4px; border-left: 4px solid #ea580c;">
            ${message.replace(/\n/g, '<br>')}
          </div>
        </div>
        <p style="color: #666; font-size: 12px;">
          This message was sent from the Easy Yield contact form.
        </p>
      </div>
    `;

  const env = envOrService instanceof EmailService ? undefined : envOrService;
  const result = await resolveService(envOrService).send({
    to: env?.CONTACT_EMAIL || 'info@easyyield.ca',
    subject: `Contact Form: ${subject}`,
    html,
  });
  return result.success;
}

// ── Contact acknowledgement (to the user who submitted the form) ────────────
export async function sendContactAck(
  envOrService: EnvOrService,
  email: string,
  name: string
): Promise<boolean> {
  const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #ea580c; text-align: center;">Message Received — Easy Yield</h1>
        <div style="text-align: center; margin: 30px 0;">
          <img src="https://easyyield.ca/images/easyyield-logo.png" alt="Easy Yield" style="max-width: 200px;">
        </div>
        <p>Dear ${name},</p>
        <p>Thank you for reaching out! Your message has been received and Erik will get back to you within 2–3 business days.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://easyyield.ca" style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Visit Easy Yield
          </a>
        </div>
        <p>Best regards,<br>Easy Yield</p>
      </div>
    `;

  const result = await resolveService(envOrService).send({
    to: email,
    subject: 'Easy Yield — We\'ve Received Your Message',
    html,
  });
  return result.success;
}

// ── Settings test email ─────────────────────────────────────────────────────
export async function sendSettingsTest(
  envOrService: EnvOrService,
  email: string
): Promise<boolean> {
  const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #d97706;">Resend integration is working</h1>
            <p>This is a test email sent from your Easy Yield Settings page.</p>
            <p>Time: ${new Date().toISOString()}</p>
          </div>
        `;

  const result = await resolveService(envOrService).send({
    to: email,
    subject: 'Easy Yield settings test email',
    html,
  });
  return result.success;
}
