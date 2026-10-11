import { create } from 'zustand';
import { api, setUnauthorizedHandler } from '../api/client.js';

export const useAuth = create((set) => ({
  user: null,
  status: 'loading', // loading | authed | guest

  init: async () => {
    try {
      if (localStorage.getItem('accessToken')) {
        const { data } = await api.get('/auth/me');
        set({ user: data.data.user, status: 'authed' });
      } else {
        // Try silent refresh via cookie
        const { data } = await api.post('/auth/refresh');
        localStorage.setItem('accessToken', data.data.accessToken);
        const me = await api.get('/auth/me');
        set({ user: me.data.data.user, status: 'authed' });
      }
    } catch {
      localStorage.removeItem('accessToken');
      set({ user: null, status: 'guest' });
    }
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.data.accessToken);
    set({ user: data.data.user, status: 'authed' });
    return data.data.user;
  },

  register: async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    localStorage.setItem('accessToken', data.data.accessToken);
    set({ user: data.data.user, status: 'authed' });
    return data.data.user;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* token may already be gone */
    }
    localStorage.removeItem('accessToken');
    set({ user: null, status: 'guest' });
  },
}));

setUnauthorizedHandler(() => {
  localStorage.removeItem('accessToken');
  useAuth.setState({ user: null, status: 'guest' });
});
