export function onRequest(context: any, next: any) {
  return next().then((response: Response) => {
    try {
      const url = new URL(context.request.url);
      const isContactPage = url.pathname === '/contact';

      let csp;
      if (isContactPage) {
        // CSP for contact page with reCAPTCHA support
        csp = "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://www.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; connect-src 'self' https://challenges.cloudflare.com https://www.google.com; frame-src 'self' https://challenges.cloudflare.com https://www.google.com";
      } else {
        // Default CSP for all other pages
        csp = "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://cdnjs.cloudflare.com https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; connect-src 'self' https://challenges.cloudflare.com; frame-src 'self' https://challenges.cloudflare.com";
      }

      response.headers.set('Content-Security-Policy', csp);
    } catch (e) {
      console.warn('Failed to set CSP header in middleware', e);
    }
    return response;
  });
}
