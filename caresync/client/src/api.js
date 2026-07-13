// ============================================================
// Central fetch helper for talking to the CareSync backend.
// Reads VITE_API_BASE from the environment (see .env.example).
// ============================================================

const configuredBase = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '');
const fallbackBase = 'https://caresync-kyj0.onrender.com';
export const API_BASE = configuredBase || (import.meta.env.DEV ? 'http://localhost:4000' : fallbackBase);

async function request(path, options = {}) {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const res = await fetch(url, options);
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

// ---- Child (JWT bearer) helpers ----
export function childHeaders() {
  const token = localStorage.getItem('caresync_token');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export const childApi = {
  register: (name, email, password) =>
    request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),

  generateJoinCode: () =>
    request('/api/pairing/generate-code', {
      method: 'POST',
      headers: childHeaders(),
    }),

  getStatus: (parentId) =>
    request(`/api/status/${parentId}`, { headers: childHeaders() }),

  unlock: (parentId) =>
    request(`/api/unlock/${parentId}`, { method: 'POST', headers: childHeaders() }),

  createTask: (payload) =>
    request('/api/tasks', {
      method: 'POST',
      headers: childHeaders(),
      body: JSON.stringify(payload),
    }),

  listTasks: (parentId) =>
    request(`/api/tasks?parentId=${parentId}`, { headers: childHeaders() }),
};

// ---- Parent (device token) helpers ----
export function parentHeaders() {
  const token = localStorage.getItem('caresync_device_token');
  return {
    'Content-Type': 'application/json',
    'x-device-token': token,
  };
}

export const parentApi = {
  redeemCode: (joinCode, parentName) =>
    request('/api/pairing/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinCode, parentName }),
    }),

  getTodayTasks: () =>
    request('/api/tasks/today', { headers: parentHeaders() }),

  toggleTask: (taskId, action) =>
    request(`/api/tasks/${taskId}/toggle`, {
      method: 'POST',
      headers: parentHeaders(),
      body: JSON.stringify({ action }),
    }),

  heartbeat: () =>
    request('/api/heartbeat', { method: 'POST', headers: parentHeaders() }),
};
