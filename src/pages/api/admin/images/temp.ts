import type { APIRoute } from 'astro';
import { D1CacheService } from '../../../../lib/services/d1CacheService';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const sessionToken = context.cookies.get('easyyield_session')?.value;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  const env = (context.locals as any)?.env;
  if (!env?.DB) {
    return new Response(JSON.stringify({ error: 'Storage not available' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const formData = await context.request.formData();
    const file = formData.get('file') as File;
    const description = (formData.get('description') as string) || '';

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: 'Invalid file type. JPEG, PNG, WebP or GIF only.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    if (file.size > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large. Maximum size is 10MB.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Encode to base64 without sharp — Workers don't support native Node binaries
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);

    // Staged image upload is a DATA cache → D1, not KV.
    await new D1CacheService(env.DB).put(`temp_image_${tempId}`, {
      data: base64,
      contentType: file.type,
      size: file.size,
      originalName: file.name,
      description,
      uploadedAt: new Date().toISOString()
    }, 86400);

    return new Response(JSON.stringify({
      success: true,
      tempId,
      tempUrl: `/api/admin/images/temp/${tempId}`,
      description,
      size: file.size,
      type: file.type,
      originalName: file.name
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Temp image upload error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Upload failed'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const DELETE: APIRoute = async (context) => {
  const sessionToken = context.cookies.get('easyyield_session')?.value;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  const env = (context.locals as any)?.env;
  if (!env?.DB) {
    return new Response(JSON.stringify({ error: 'Storage not available' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { tempId } = await context.request.json() as { tempId: string };
    if (!tempId) {
      return new Response(JSON.stringify({ error: 'No temp ID provided' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    await new D1CacheService(env.DB).delete(`temp_image_${tempId}`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to delete temp image' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
