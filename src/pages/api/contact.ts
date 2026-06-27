import { sendContactForm, sendContactAck } from '../../lib/email';

export async function POST(context: any) {
  const { request } = context;
  const env = (context.locals as any)?.env;
  try {
    const formData = await request.json();

    // Validate required fields
    const { firstName, lastName, email, subject, message, recaptchaToken } = formData;

    if (!firstName || !lastName || !email || !subject || !message || !recaptchaToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'All fields are required including CAPTCHA verification'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid email format'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        }
      );
    }

    // Verify reCAPTCHA v3 token
    const recaptchaSecretKey = env?.RECAPTCHA_SECRET_KEY || process.env.RECAPTCHA_SECRET_KEY;
    if (!recaptchaSecretKey) {
      throw new Error('reCAPTCHA secret key not configured');
    }

    const recaptchaVerifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(recaptchaSecretKey)}&response=${encodeURIComponent(recaptchaToken)}`
    });

    const recaptchaResult = await recaptchaVerifyResponse.json();

    // Check if the token is valid and score is acceptable
    if (!recaptchaResult.success || recaptchaResult.score < 0.5) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'CAPTCHA verification failed. Please try again.'
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        }
      );
    }

    // Send contact form email
    const emailSent = await sendContactForm(env, {
      firstName,
      lastName,
      email,
      subject,
      message,
    });

    if (!emailSent) {
      throw new Error('Failed to send email');
    }

    // Send welcome email to user (optional)
    try {
      await sendContactAck(env, email, `${firstName} ${lastName}`);
    } catch (welcomeError) {
      console.warn('Welcome email failed to send:', welcomeError);
      // Don't fail the request if welcome email fails
    }

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Contact form submission error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to send message. Please try again later.'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
