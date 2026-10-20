const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async text => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
const reply = (data, status = 200, headers = {}) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', ...headers },
});
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256));
}
const cookie = (token, age) => `drink_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
async function userFor(request, db) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)drink_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  return db.prepare(`SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).bind(await digest(token), Date.now()).first();
}
async function createSession(user, db) {
  const token = random(), age = 30 * 24 * 3600;
  await db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await digest(token), user.id, Date.now() + age * 1000).run();
  return reply({ user: { id: user.id, username: user.username } }, 200, { 'Set-Cookie': cookie(token, age) });
}
async function authenticate(request, db, register) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = body?.password;
  if (!/^[a-z0-9_]{3,32}$/.test(username) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return reply({ error: '账号需为3–32位字母、数字或下划线，密码需为8–128位' }, 400);
  }
  const now = Date.now(), window = Math.floor(now / 600000);
  const bucket = await digest(`${request.headers.get('CF-Connecting-IP') || 'local'}:${window}`);
  await db.prepare(`INSERT INTO auth_limits VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1`)
    .bind(bucket, now + 600000).run();
  const limit = await db.prepare('SELECT attempts FROM auth_limits WHERE bucket = ?').bind(bucket).first();
  if (limit.attempts > 20) return reply({ error: '尝试次数过多，请10分钟后再试' }, 429);
  await db.prepare('DELETE FROM auth_limits WHERE expires_at < ?').bind(now).run();
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
  const existing = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (register) {
    if (existing) return reply({ error: '这个账号已被注册' }, 409);
    const salt = random(), id = crypto.randomUUID();
    try {
      await db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').bind(id, username, await passwordHash(password, salt), salt, new Date().toISOString()).run();
    } catch (error) {
      if (String(error).includes('UNIQUE')) return reply({ error: '这个账号已被注册' }, 409);
      throw error;
    }
    return createSession({ id, username }, db);
  }
  const hash = await passwordHash(password, existing?.salt || 'missing-user');
  if (!existing || hash !== existing.password_hash) return reply({ error: '账号或密码不正确' }, 401);
  return createSession(existing, db);
}
async function accountState(request, db, user) {
  if (request.method === 'GET') {
    const row = await db.prepare('SELECT * FROM user_state WHERE user_id = ?').bind(user.id).first();
    return reply({ state: row ? JSON.parse(row.state_json) : null, revision: row?.revision || 0 });
  }
  if (request.method !== 'PUT') return reply({ error: 'Method not allowed' }, 405);
  const body = await request.json().catch(() => null);
  if (!body?.state || !Array.isArray(body.state.records) || !Array.isArray(body.state.brands) ||
      !Number.isInteger(body.revision) || body.revision < 0) return reply({ error: '数据格式不正确' }, 400);
  const stateJson = JSON.stringify(body.state);
  if (encoder.encode(stateJson).length > 900000) return reply({ error: '数据过大，请先导出备份' }, 413);
  const now = new Date().toISOString();
  const result = body.revision === 0
    ? await db.prepare('INSERT OR IGNORE INTO user_state VALUES (?, ?, 1, ?)').bind(user.id, stateJson, now).run()
    : await db.prepare(`UPDATE user_state SET state_json = ?, revision = revision + 1, updated_at = ?
        WHERE user_id = ? AND revision = ?`).bind(stateJson, now, user.id, body.revision).run();
  if (result.meta.changes !== 1) return reply({ error: '另一台设备已更新数据，请先刷新；本次修改仍保留在本机' }, 409);
  return reply({ ok: true, revision: body.revision + 1 });
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.DB) return reply({ error: '数据库尚未绑定 DB' }, 503);
    if (request.method !== 'GET' && request.headers.get('Origin') !== new URL(request.url).origin) {
      return reply({ error: '请求来源不正确' }, 403);
    }
    if (Number(request.headers.get('Content-Length')) > 1000000) return reply({ error: '请求过大' }, 413);
    try {
      if (path === '/api/auth/register' && request.method === 'POST') return await authenticate(request, env.DB, true);
      if (path === '/api/auth/login' && request.method === 'POST') return await authenticate(request, env.DB, false);
      if (path === '/api/auth/logout' && request.method === 'POST') {
        const token = request.headers.get('cookie')?.match(/drink_session=([a-f0-9]{64})/)?.[1];
        if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digest(token)).run();
        return reply({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
      }
      const user = await userFor(request, env.DB);
      if (path === '/api/auth/me' && request.method === 'GET') return reply({ user });
      if (!user) return reply({ error: '请先登录' }, 401);
      if (path === '/api/state') return await accountState(request, env.DB, user);
      return reply({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('API error', error);
      return reply({ error: '数据库暂不可用，请检查账号表是否已创建' }, 503);
    }
  },
};
