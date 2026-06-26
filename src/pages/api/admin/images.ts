import type { APIRoute } from 'astro';

export const POST: APIRoute = async (context) => {
  const sessionToken = context.cookies.get('easyyield_session')?.value;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const env = (context.locals as any)?.env;
  if (!env?.IMAGES) {
    return new Response(JSON.stringify({ error: 'R2 storage not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const formData = await context.request.formData();
    const file = formData.get('file') as File;
    const description = formData.get('description') as string || '';

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large. Maximum size is 10MB.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `products/${timestamp}-${randomId}.${extension}`;

    // Convert file to ArrayBuffer for R2 upload (required for known length)
    const fileArrayBuffer = await file.arrayBuffer();

    // Upload to R2
    await env.IMAGES.put(filename, fileArrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        contentDisposition: `inline; filename="${file.name}"`,
      },
      customMetadata: {
        description: description,
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    });

    // Return the worker URL for accessing the image
    const publicUrl = `/api/images/${filename}`;

    return new Response(JSON.stringify({
      success: true,
      url: publicUrl,
      filename: filename,
      description: description,
      size: file.size,
      type: file.type
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Image upload error:', error);
    return new Response(JSON.stringify({ error: 'Failed to upload image' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async (context) => {
  const sessionToken = context.cookies.get('easyyield_session')?.value;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const env = (context.locals as any)?.env;
  if (!env?.IMAGES) {
    return new Response(JSON.stringify({ error: 'R2 storage not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await context.request.json();
    const filename = data.filename;

    if (!filename) {
      return new Response(JSON.stringify({ error: 'No filename provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Delete from R2
    await env.IMAGES.delete(filename);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Image delete error:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete image' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};