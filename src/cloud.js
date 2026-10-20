import { clientKey } from './model.js';

const getClientId = () => {
  let id = localStorage.getItem(clientKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(clientKey, id);
  }
  return id;
};

const clientId = getClientId();

export async function pullState() {
  const response = await fetch(`/api/state?client_id=${encodeURIComponent(clientId)}`);
  if (!response.ok) throw new Error(`Cloud read failed: ${response.status}`);
  const payload = await response.json();
  return payload.state || null;
}

export async function pushState(state) {
  const response = await fetch('/api/state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, state }),
  });
  if (!response.ok) throw new Error(`Cloud write failed: ${response.status}`);
}
