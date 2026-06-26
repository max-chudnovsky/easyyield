import type { APIRoute } from 'astro';
import { RuntimeSettingsService } from '../lib/services/runtimeSettings.js';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const env = (context.locals as any)?.env;
    if (!env?.DB) {
      return new Response('Not found', { status: 404 });
    }

    const requestKey = context.params.indexnowKey?.trim();
    if (!requestKey) {
      return new Response('Not found', { status: 404 });
    }

    const settings = new RuntimeSettingsService(env.DB);
    const storedKey = await settings.getOrCreateIndexNowKey();

    if (requestKey !== storedKey.trim()) {
      return new Response('Not found', { status: 404 });
    }

    return new Response(storedKey.trim(), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('IndexNow key file error:', error);
    return new Response('Not found', { status: 404 });
  }
};