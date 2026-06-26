import type { APIRoute } from 'astro';
import { D1CacheService } from '../../../../lib/services/d1CacheService';

export const POST: APIRoute = async (context) => {
  const sessionToken = context.cookies.get('easyyield_session')?.value;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const env = (context.locals as any)?.env;
  if (!env?.IMAGES || !env?.DB) {
    return new Response(JSON.stringify({ error: 'Storage not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const d1Cache = new D1CacheService(env.DB);

  try {
    const data = await context.request.json();
    const productId = data.productId as string;

    // Handle both old format (tempIds array) and new format (tempImages array)
    let tempImages: Array<{tempId: string, description?: string, featured?: boolean}>;

    if (data.tempImages && Array.isArray(data.tempImages)) {
      // New format
      tempImages = data.tempImages;
    } else if (data.tempIds && Array.isArray(data.tempIds)) {
      // Old format - convert to new format
      tempImages = data.tempIds.map((tempId: string) => ({
        tempId,
        description: '',
        featured: false
      }));
    } else {
      return new Response(JSON.stringify({ error: 'Invalid temp images or product ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!productId) {
      return new Response(JSON.stringify({ error: 'Product ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const finalizedImages = [];

    for (const tempImageData of tempImages) {
      const tempId = tempImageData.tempId;
      try {
        // Get temp image data from the D1 data cache.
        const tempData = await d1Cache.get<any>(`temp_image_${tempId}`);

        if (!tempData) {
          console.warn(`Temp image ${tempId} not found, skipping`);
          continue;
        }

        // Decode base64 → binary
        const binaryString = atob(tempData.data);
        const imgBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          imgBytes[i] = binaryString.charCodeAt(i);
        }

        const contentType = tempData.contentType || 'image/jpeg';
        const extMap: Record<string, string> = {
          'image/jpeg': 'jpg', 'image/png': 'png',
          'image/webp': 'webp', 'image/gif': 'gif'
        };
        const ext = extMap[contentType] || 'jpg';
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).slice(2, 11);
        const filename = `products/${productId}/${timestamp}-${randomId}.${ext}`;

        await env.IMAGES.put(filename, imgBytes, {
          httpMetadata: {
            contentType,
            contentDisposition: `inline; filename="${tempData.originalName}"`
          },
          customMetadata: {
            description: tempImageData.description || tempData.description || '',
            originalName: tempData.originalName,
            size: String(tempData.size),
            uploadedAt: new Date().toISOString(),
            productId,
            tempId,
            featured: String(tempImageData.featured || false)
          }
        });

        finalizedImages.push({
          url: `/api/images/${filename}`,
          filename,
          description: tempImageData.description || tempData.description || '',
          size: tempData.size,
          type: contentType,
          originalName: tempData.originalName,
          featured: tempImageData.featured || false
        });

        // Clean up temp image from the D1 data cache.
        await d1Cache.delete(`temp_image_${tempId}`);

      } catch (error) {
        console.error(`Failed to finalize temp image ${tempId}:`, error);
        // Continue with other images even if one fails
      }
    }

    return new Response(JSON.stringify({
      success: true,
      finalizedImages: finalizedImages,
      count: finalizedImages.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Image finalization error:', error);
    return new Response(JSON.stringify({ error: 'Failed to finalize images' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};