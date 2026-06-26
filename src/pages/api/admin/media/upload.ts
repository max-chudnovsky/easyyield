import type { APIRoute } from "astro";

export const prerender = false;

/**
 * POST /api/admin/media/upload
 * Accepts base64-encoded image or a URL to fetch, stores to R2 IMAGES bucket.
 * Used by myblogcenter VM to push generated blog images.
 *
 * Body (JSON):
 *   { imageBase64: string, mimeType: string, path: string }
 *   OR
 *   { imageUrl: string, path: string }
 *
 * path: desired key prefix, e.g. "blog-1234567890-my-article-slug"
 * Returns: { key: string, servingUrl: string }
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const env = (locals as any)?.env;

  const token = request.headers.get("x-admin-token") || "";
  const syncToken = String(env?.MBC_SYNC_TOKEN || "").trim();
  if (!token || !syncToken || token !== syncToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const images = env?.IMAGES as R2Bucket | undefined;
  if (!images) {
    return Response.json({ error: "R2 binding unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let rawPath = String(body.path || "").trim().replace(/^\/+|\/+$/g, "");
  if (!rawPath) {
    return Response.json({ error: "path is required" }, { status: 400 });
  }

  // Normalize "blog-TIMESTAMP-slug" to "blog/TIMESTAMP-slug"
  // so the /api/images/[...path] serving endpoint can handle it
  if (rawPath.startsWith("blog-")) {
    rawPath = "blog/" + rawPath.slice(5);
  }

  let imageData: ArrayBuffer;
  let mimeType: string;

  if (body.imageBase64) {
    const b64 = String(body.imageBase64).replace(/^data:[^;]+;base64,/, "");
    mimeType = String(body.mimeType || "image/webp");
    try {
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      imageData = bytes.buffer;
    } catch {
      return Response.json({ error: "Invalid base64 image data" }, { status: 400 });
    }
  } else if (body.imageUrl) {
    const fetchResp = await fetch(String(body.imageUrl)).catch(() => null);
    if (!fetchResp?.ok) {
      return Response.json({ error: "Failed to fetch image from URL" }, { status: 400 });
    }
    mimeType = fetchResp.headers.get("content-type") || "image/webp";
    imageData = await fetchResp.arrayBuffer();
  } else {
    return Response.json({ error: "Provide either imageBase64 or imageUrl" }, { status: 400 });
  }

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("gif") ? "gif" : "webp";
  const key = `${rawPath}.${ext}`;

  await images.put(key, imageData, {
    httpMetadata: { contentType: mimeType },
  });

  return Response.json({
    key,
    servingUrl: `/api/images/${key}`,
  });
};
