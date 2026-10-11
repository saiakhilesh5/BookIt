import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  const token = localStorage.getItem('accessToken');
  if (token) s.auth = { token };
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}

export function subscribeToEvent(eventId, { onAvailability } = {}) {
  const s = connectSocket();
  s.emit('event:subscribe', { eventId });
  if (onAvailability) {
    s.on('availability', onAvailability);
  }
  return () => {
    s.emit('event:unsubscribe', { eventId });
    if (onAvailability) s.off('availability', onAvailability);
  };
}
