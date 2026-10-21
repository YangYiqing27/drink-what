const http = require('http');
const crypto = require('crypto');
const cloudbase = require('@cloudbase/js-sdk');

const app = cloudbase.init({
  env: process.env.CLOUDBASE_ENV_ID,
  accessKey: process.env.CLOUDBASE_APIKEY,
});
const db = app.database();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('hex');
const hash = (password, salt) => crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
const valid = (username, password) => /^[a-z0-9_]{3,32}$/.test(username) && typeof password === 'string' && password.length >= 8 && password.length <= 128;
const originAllowed = origin => !origin || (process.env.ALLOWED_ORIGIN || '').split(',').map(value => value.trim()).includes(origin);
const respond = (res, body, status = 200, origin = '') => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  });
  res.end(JSON.stringify(body));
};
const fail = (message, status = 400) => ({ ok: false, status, error: message });

async function currentUser(token) {
  if (!token) return null;
  const { data } = await db.collection('drink_sessions').where({
    tokenHash: sha(token), expiresAt: db.command.gt(Date.now()),
  }).get();
  if (!data[0]) return null;
  const user = await db.collection('drink_users').doc(data[0].userId).get();
  return user.data?.[0] || null;
}
async function createSession(userId) {
  const token = random();
  await db.collection('drink_sessions').add({
    tokenHash: sha(token), userId, expiresAt: Date.now() + 30 * 86400 * 1000, createdAt: Date.now(),
  });
  return token;
}
async function handle({ action, payload = {} }, token) {
  if (action === 'me') {
    const user = await currentUser(token);
    return { ok: true, data: { user: user ? { id: user._id, username: user.username } : null } };
  }
  if (action === 'register' || action === 'login') {
    const username = String(payload.username || '').trim().toLowerCase(), password = payload.password;
    if (!valid(username, password)) return fail('账号需为3–32位字母、数字或下划线，密码需为8–128位');
    const { data } = await db.collection('drink_users').where({ username }).get();
    const existing = data[0];
    if (action === 'register') {
      if (existing) return fail('这个账号已被注册', 409);
      const salt = random(), created = await db.collection('drink_users').add({
        username, salt, passwordHash: hash(password, salt), createdAt: Date.now(),
      });
      return { ok: true, data: { user: { id: created.id, username }, token: await createSession(created.id) } };
    }
    if (!existing || hash(password, existing.salt) !== existing.passwordHash) return fail('账号或密码不正确', 401);
    return { ok: true, data: { user: { id: existing._id, username }, token: await createSession(existing._id) } };
  }
  const user = await currentUser(token);
  if (!user) return fail('请先登录', 401);
  if (action === 'logout') {
    await db.collection('drink_sessions').where({ tokenHash: sha(token) }).remove();
    return { ok: true, data: {} };
  }
  if (action === 'getState') {
    const { data } = await db.collection('drink_state').where({ userId: user._id }).get();
    return { ok: true, data: { state: data[0]?.state || null, revision: data[0]?.revision || 0 } };
  }
  if (action === 'putState') {
    const { state, revision } = payload;
    if (!state || !Array.isArray(state.records) || !Array.isArray(state.brands) || !Number.isInteger(revision)) return fail('数据格式不正确');
    if (Buffer.byteLength(JSON.stringify(state)) > 900000) return fail('数据过大，请先导出备份', 413);
    const { data } = await db.collection('drink_state').where({ userId: user._id }).get();
    const item = data[0], next = revision + 1;
    if (!item && revision === 0) await db.collection('drink_state').add({ userId: user._id, state, revision: next, updatedAt: Date.now() });
    else if (!item || item.revision !== revision) return fail('另一台设备已更新数据，请先刷新；本次修改仍保留在本机', 409);
    else await db.collection('drink_state').doc(item._id).update({ state, revision: next, updatedAt: Date.now() });
    return { ok: true, data: { revision: next } };
  }
  return fail('未知请求', 404);
}
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  if (!originAllowed(origin)) return respond(res, fail('请求来源不允许', 403), 403, '');
  if (req.method === 'OPTIONS') return respond(res, {}, 204, origin);
  if (req.method !== 'POST') return respond(res, fail('仅支持 POST', 405), 405, origin);
  try {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 1000000) throw new Error('请求过大'); }
    const body = JSON.parse(raw || '{}');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const result = await handle(body, token);
    respond(res, result, result.status || 200, origin);
  } catch (error) {
    console.error(error);
    respond(res, fail(error.message === '请求过大' ? error.message : '服务暂不可用，请稍后重试', error.message === '请求过大' ? 413 : 503), error.message === '请求过大' ? 413 : 503, origin);
  }
});
server.listen(9000, '0.0.0.0');
