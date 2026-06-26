export const prerender = false;

export async function get() {
  return new Response(JSON.stringify({ ok: true, method: 'GET' }), { status: 200 });
}

export async function post({ request }) {
  const body = await request.text();
  return new Response(JSON.stringify({ ok: true, method: 'POST', body }), { status: 200 });
}
