import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey } from './client.js';

const keys = {
  events: (params) => ['events', params],
  event: (id) => ['event', id],
  meta: ['events', 'meta'],
  featured: ['events', 'featured'],
  myEvents: ['events', 'mine'],
  bookings: ['bookings'],
  booking: (id) => ['booking', id],
  waitlist: ['waitlist'],
  adminStats: ['admin', 'stats'],
  adminUsers: (params) => ['admin', 'users', params],
  adminPending: ['admin', 'pending'],
  adminLogs: (params) => ['admin', 'logs', params],
  adminMails: ['admin', 'mails'],
  promos: ['promos'],
};

export const useEvents = (params) =>
  useQuery({
    queryKey: keys.events(params),
    queryFn: async () => {
      const { data } = await api.get('/events', { params });
      return data;
    },
    placeholderData: (prev) => prev,
  });

export const useEvent = (id) =>
  useQuery({
    queryKey: keys.event(id),
    queryFn: async () => {
      const { data } = await api.get(`/events/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
  });

export const useEventMeta = () =>
  useQuery({
    queryKey: keys.meta,
    queryFn: async () => {
      const { data } = await api.get('/events/meta');
      return data.data;
    },
    staleTime: 60_000,
  });

export const useFeatured = () =>
  useQuery({
    queryKey: keys.featured,
    queryFn: async () => {
      const { data } = await api.get('/events/featured');
      return data.data;
    },
  });

export const useMyEvents = () =>
  useQuery({
    queryKey: keys.myEvents,
    queryFn: async () => {
      const { data } = await api.get('/events/mine');
      return data.data;
    },
  });

export const useEventStats = (id) =>
  useQuery({
    queryKey: ['event-stats', id],
    queryFn: async () => {
      const { data } = await api.get(`/events/${id}/stats`);
      return data.data;
    },
    enabled: Boolean(id),
  });

// ------------------------- bookings -------------------------

export const useCreateBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, tierId, quantity, promoCode }) => {
      const { data } = await api.post(
        '/bookings',
        { eventId, tierId, quantity, promoCode },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event'] });
      qc.invalidateQueries({ queryKey: keys.bookings });
    },
  });
};

export const useBooking = (id) =>
  useQuery({
    queryKey: keys.booking(id),
    queryFn: async () => {
      const { data } = await api.get(`/bookings/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.status === 'held' ? 15_000 : false),
  });

export const useMyBookings = () =>
  useQuery({
    queryKey: keys.bookings,
    queryFn: async () => {
      const { data } = await api.get('/bookings/me');
      return data.data;
    },
  });

export const usePayBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, card }) => {
      const { data } = await api.post(`/bookings/${bookingId}/pay`, { card });
      return data.data;
    },
    onSuccess: (booking) => {
      qc.setQueryData(keys.booking(booking.id), booking);
      qc.invalidateQueries({ queryKey: keys.bookings });
      qc.invalidateQueries({ queryKey: ['event'] });
    },
  });
};

export const useApplyPromo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, code }) => {
      const { data } = await api.post(`/bookings/${bookingId}/promo`, { code });
      return data.data;
    },
    onSuccess: (booking) => {
      qc.setQueryData(keys.booking(booking.id), booking);
    },
  });
};

export const useCancelBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId) => {
      const { data } = await api.post(`/bookings/${bookingId}/cancel`);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.bookings });
      qc.invalidateQueries({ queryKey: ['booking'] });
      qc.invalidateQueries({ queryKey: ['event'] });
    },
  });
};

// ------------------------- waitlist -------------------------

export const useJoinWaitlist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, tierId, quantity }) => {
      const { data } = await api.post(`/events/${eventId}/waitlist`, { tierId, quantity });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.waitlist });
      qc.invalidateQueries({ queryKey: ['event'] });
    },
  });
};

export const useLeaveWaitlist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, tierId }) => {
      const { data } = await api.delete(`/events/${eventId}/waitlist`, { data: { tierId, quantity: 1 } });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.waitlist });
      qc.invalidateQueries({ queryKey: ['event'] });
    },
  });
};

export const useMyWaitlist = () =>
  useQuery({
    queryKey: keys.waitlist,
    queryFn: async () => {
      const { data } = await api.get('/waitlist/me');
      return data.data;
    },
  });

// ------------------------- organizer -------------------------

export const useCreateEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/events', body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.myEvents }),
  });
};

export const useUpdateEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }) => {
      const { data } = await api.patch(`/events/${id}`, body);
      return data.data;
    },
    onSuccess: (event) => {
      qc.invalidateQueries({ queryKey: keys.myEvents });
      qc.invalidateQueries({ queryKey: keys.event(event.id) });
    },
  });
};

export const useCancelEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { data } = await api.delete(`/events/${id}`);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.myEvents });
      qc.invalidateQueries({ queryKey: ['event'] });
      qc.invalidateQueries({ queryKey: keys.events(undefined) });
    },
  });
};

// ------------------------- admin -------------------------

export const useAdminStats = () =>
  useQuery({
    queryKey: keys.adminStats,
    queryFn: async () => {
      const { data } = await api.get('/admin/stats');
      return data.data;
    },
  });

export const useAdminUsers = (params) =>
  useQuery({
    queryKey: keys.adminUsers(params),
    queryFn: async () => {
      const { data } = await api.get('/admin/users', { params });
      return data;
    },
    placeholderData: (prev) => prev,
  });

export const usePendingEvents = () =>
  useQuery({
    queryKey: keys.adminPending,
    queryFn: async () => {
      const { data } = await api.get('/admin/events/pending');
      return data.data;
    },
  });

export const useAuditLogs = (params) =>
  useQuery({
    queryKey: keys.adminLogs(params),
    queryFn: async () => {
      const { data } = await api.get('/admin/audit-logs', { params });
      return data;
    },
    placeholderData: (prev) => prev,
  });

export const useMailOutbox = () =>
  useQuery({
    queryKey: keys.adminMails,
    queryFn: async () => {
      const { data } = await api.get('/admin/mails');
      return data;
    },
  });

export const usePromos = () =>
  useQuery({
    queryKey: keys.promos,
    queryFn: async () => {
      const { data } = await api.get('/promos');
      return data.data;
    },
  });

export const useCreatePromo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const { data } = await api.post('/promos', body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.promos }),
  });
};

export const useApproveEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { data } = await api.patch(`/admin/events/${id}/approve`);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.adminPending });
      qc.invalidateQueries({ queryKey: keys.adminStats });
    },
  });
};

export const useRejectEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }) => {
      const { data } = await api.patch(`/admin/events/${id}/reject`, { reason });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.adminPending });
      qc.invalidateQueries({ queryKey: keys.adminStats });
    },
  });
};

export const useChangeUserRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }) => {
      const { data } = await api.patch(`/admin/users/${id}/role`, { role });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
};

export const useToggleUserActive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }) => {
      const { data } = await api.patch(`/admin/users/${id}/status`, { isActive });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
};

export const downloadTicket = async (bookingId) => {
  const res = await api.get(`/bookings/${bookingId}/ticket`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookit-ticket-${bookingId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
