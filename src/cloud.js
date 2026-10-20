async function api(path, body, method = 'POST') {
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
