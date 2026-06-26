import type { APIRoute } from 'astro';
import { D1CacheService } from '../../../../../lib/services/d1CacheService';

export const GET: APIRoute = async (context) => {
  const sessionToken = context.cookies.get('easyyield_session')?.value;
  if (!sessionToken) {
    return new Response('Not authenticated', { status: 401 });
  }

  const { tempId } = context.params;

  const env = (context.locals as any)?.env;
  if (!env?.DB) {
    console.error('Storage not available');
    return new Response('Storage not available', { status: 500 });
  }

  try {
    console.log('Attempting to serve temp image:', tempId);

    // Get temp image data from the D1 data cache.
    const tempData = await new D1CacheService(env.DB).get<{
      data: string; contentType: string; originalName: string;
    }>(`temp_image_${tempId}`);

    if (!tempData) {
      console.error('Temp image not found:', `temp_image_${tempId}`);
      return new Response('Temp image not found or expired', { status: 404 });
    }
    console.log('Temp data found, content type:', tempData.contentType, 'size:', tempData.data.length);

    // Convert base64 back to binary
    const base64Data = tempData.data;
    console.log('Base64 data length:', base64Data.length);

    // The base64 string is already complete from the upload process
    // We just need to decode it back to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    console.log('Successfully converted base64 to binary, bytes length:', bytes.length);

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': tempData.contentType,
        'Cache-Control': 'public, max-age=3600',
        'Content-Disposition': `inline; filename="${tempData.originalName}"`
      }
    });

  } catch (error) {
    console.error('Temp image serve error:', error);
    return new Response(`Failed to serve temp image: ${error.message}`, { status: 500 });
  }
};