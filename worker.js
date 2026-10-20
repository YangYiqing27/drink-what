const validClientId = value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

async function apiState(request, env) {
  if (!env.DB) return Response.json({ error: 'D1 binding DB is not configured' }, { status: 503 });
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const clientId = url.searchParams.get('client_id');
    if (!validClientId(clientId)) return Response.json({ error: 'Invalid client_id' }, { status: 400 });
    const row = await env.DB.prepare('SELECT state_json, updated_at FROM app_state WHERE client_id = ?').bind(clientId).first();
    return Response.json({ state: row ? JSON.parse(row.state_json) : null, updatedAt: row?.updated_at || null });
  }
  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (!body || !validClientId(body.client_id) || !body.state || typeof body.state !== 'object') {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }
    const stateJson = JSON.stringify(body.state);
    if (stateJson.length > 900_000) return Response.json({ error: 'State is too large' }, { status: 413 });
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO app_state (client_id, state_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(client_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
    `).bind(body.client_id, stateJson, updatedAt).run();
    return Response.json({ ok: true, updatedAt });
  }
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/state') return apiState(request, env);
    return env.ASSETS.fetch(request);
  },
};
