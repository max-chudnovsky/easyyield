export async function GET() {
  try {
    // Redirect to the logo image as favicon
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/images/easyyield-logo.png',
        'Content-Type': 'image/png'
      }
    });
  } catch (error) {
    console.error('Favicon error:', error);
    return new Response('Favicon not found', { status: 404 });
  }
}
