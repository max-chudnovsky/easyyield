import type { APIRoute } from 'astro';

export const GET: APIRoute = async (context) => {
  const { path } = context.params;

  if (!path) {
    return new Response('Not found', { status: 404 });
  }

  const env = (context.locals as any)?.env;
  if (!env?.IMAGES) {
    return new Response('R2 storage not available', { status: 500 });
  }

  try {
    // Support three modes:
    // 1. /api/images/blog/slug/name.jpg -> blog/slug/name.jpg
    // 2. /api/images/products/id/file.jpg -> products/id/file.jpg
    // 3. /api/images/slider/id/file.jpg -> slider/id/file.jpg

    console.log('Image API request path:', path);

    if (!path.startsWith('blog/') && !path.startsWith('products/') && !path.startsWith('slider/') && !path.startsWith('site/')) {
      console.log('Invalid path rejected:', path);
      return new Response('Invalid path - only blog/, products/, slider/, and site/ are supported', {
        status: 400,
        headers: {
          'X-Debug-Path': path,
          'X-Debug-Error': 'Invalid path prefix'
        }
      });
    }

    // Get the file from R2
    const object = await env.IMAGES.get(path);

    if (!object) {
      return new Response('Image not found', {
        status: 404,
        headers: {
          'X-Debug-Path': path,
          'X-Debug-Found': 'false',
        }
      });
    }

    // Get the content type from metadata or infer from file extension
    let contentType = object.httpMetadata?.contentType;
    if (!contentType) {
      if (path.toLowerCase().endsWith('.gif')) {
        contentType = 'image/gif';
      } else if (path.toLowerCase().endsWith('.png')) {
        contentType = 'image/png';
      } else if (path.toLowerCase().endsWith('.webp')) {
        contentType = 'image/webp';
      } else {
        contentType = 'image/jpeg';
      }
    }

    // Set cache headers for images
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000', // 1 year
      'ETag': object.etag,
      'X-Debug-Path': path,
      'X-Debug-Found': 'true',
    });

    // Check if client has cached version
    const ifNoneMatch = context.request.headers.get('If-None-Match');
    if (ifNoneMatch === object.etag) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(object.body, { headers });

  } catch (error) {
    console.error('Error serving image:', error);
    return new Response('Internal server error', { status: 500 });
  }
};