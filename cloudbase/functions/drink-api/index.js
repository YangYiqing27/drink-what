const crypto = require('crypto');
const cloudbase = require('@cloudbase/node-sdk');
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('hex');
const hash = (password, salt) => crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
const fail = (message, status = 400) => ({ ok: false, status, error: message });
const valid = (username, password) => /^[a-z0-9_]{3,32}$/.test(username) && typeof password === 'string' && password.length >= 8 && password.length <= 128;

async function currentUser(token) {
  if (!token) return null;
  const { data } = await db.collection('drink_sessions').where({ tokenHash: sha(token), expiresAt: db.command.gt(Date.now()) }).get();
  if (!data[0]) return null;
  const user = await db.collection('drink_users').doc(data[0].userId).get();
  return user.data?.[0] || null;
}
async function session(userId) {
  const token = random();
  await db.collection('drink_sessions').add({ tokenHash: sha(token), userId, expiresAt: Date.now() + 30 * 86400 * 1000, createdAt: Date.now() });
  return token;
}
exports.main = async event => {
  const { action, payload = {}, token } = event || {};
  try {
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
        const salt = random();
        const created = await db.collection('drink_users').add({ username, salt, passwordHash: hash(password, salt), createdAt: Date.now() });
        const authToken = await session(created.id);
        return { ok: true, data: { user: { id: created.id, username }, token: authToken } };
      }
      if (!existing || hash(password, existing.salt) !== existing.passwordHash) return fail('账号或密码不正确', 401);
      return { ok: true, data: { user: { id: existing._id, username }, token: await session(existing._id) } };
    }
    const user = await currentUser(token);
    if (!user) return fail('请先登录', 401);
    if (action === 'logout') {
      await db.collection('drink_sessions').where({ tokenHash: sha(token) }).remove();
      return { ok: true, data: {} };
    }
    if (action === 'getState') {
      const { data } = await db.collection('drink_state').where({ userId: user._id }).get();
      const item = data[0];
      return { ok: true, data: { state: item?.state || null, revision: item?.revision || 0 } };
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
  } catch (error) {
    console.error(error);
    return fail('服务暂不可用，请稍后重试', 503);
  }
};
