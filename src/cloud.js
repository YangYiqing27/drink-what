const cloudbaseMode = import.meta.env.VITE_BACKEND === 'cloudbase';
const cloudbaseEnv = import.meta.env.VITE_CLOUDBASE_ENV_ID;
const tokenKey = 'drink-what-cloudbase-token';
let cloudbaseApp;

async function cloudbaseApi(action, payload = {}) {
  if (!cloudbaseEnv) throw new Error('尚未配置 CloudBase 环境 ID');
  if (!cloudbaseApp) {
    const { default: cloudbase } = await import('@cloudbase/js-sdk');
    cloudbaseApp = cloudbase.init({ env: cloudbaseEnv });
  }
  const result = await cloudbaseApp.callFunction({
    name: 'drink-api',
    data: { action, payload, token: localStorage.getItem(tokenKey) || '' },
  });
  const body = result.result;
  if (!body?.ok) {
    const error = new Error(body?.error || '服务暂不可用');
    error.status = body?.status || 503;
    throw error;
  }
  return body.data;
}
async function api(path, body, method = 'POST') {
  if (cloudbaseMode) {
    const action = ({
      '/api/auth/me': 'me', '/api/auth/register': 'register', '/api/auth/login': 'login',
      '/api/auth/logout': 'logout', '/api/state': method === 'GET' ? 'getState' : 'putState',
    })[path];
    const result = await cloudbaseApi(action, body || {});
    if (['register', 'login'].includes(action)) localStorage.setItem(tokenKey, result.token);
    if (action === 'logout') localStorage.removeItem(tokenKey);
    return result;
  }
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ error: '服务暂不可用' }));
  if (!response.ok) {
    const error = new Error(payload.error || `请求失败：${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}
export const currentUser = () => api('/api/auth/me');
export const authenticate = (mode, username, password) => api(`/api/auth/${mode}`, { username, password });
export const logout = () => api('/api/auth/logout', {});
export const pullState = () => api('/api/state');
export const pushState = (state, revision) => api('/api/state', { state, revision }, 'PUT');
