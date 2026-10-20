const allowedClientId = value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

export async function onRequestGet({ request, env }) {
  if (!env.DB) return Response.json({ error: 'D1 binding DB is not configured' }, { status: 503 });
  const clientId = new URL(request.url).searchParams.get('client_id');
  if (!allowedClientId(clientId)) return Response.json({ error: 'Invalid client_id' }, { status: 400 });
  const row = await env.DB.prepare('SELECT state_json, updated_at FROM app_state WHERE client_id = ?').bind(clientId).first();
  return Response.json({ state: row ? JSON.parse(row.state_json) : null, updatedAt: row?.updated_at || null });
}

export async function onRequestPut({ request, env }) {
  if (!env.DB) return Response.json({ error: 'D1 binding DB is not configured' }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (!body || !allowedClientId(body.client_id) || !body.state || typeof body.state !== 'object') {
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
