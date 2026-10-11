import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1',
  withCredentials: true,
});

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// Waiters blocked while a refresh is already in flight share its result.
let refreshPromise = null;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthCall = original?.url?.startsWith('/auth/');
    const is401 = error.response?.status === 401;

    if (is401 && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        refreshPromise ??= api.post('/auth/refresh').finally(() => {
          refreshPromise = null;
        });
        const { data } = await refreshPromise;
        localStorage.setItem('accessToken', data.data.accessToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('accessToken');
        onUnauthorized?.();
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export function extractError(err, fallback = 'Something went wrong') {
  return err?.response?.data?.error?.message || err?.message || fallback;
}

export function extractErrorCode(err) {
  return err?.response?.data?.error?.code;
}

export function newIdempotencyKey() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
