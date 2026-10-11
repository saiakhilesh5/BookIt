import { useEffect, lazy, Suspense } from 'react';
import { useRoutes, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import { ToastProvider, useToast } from './components/ui/Toast.jsx';
import { Spinner } from './components/ui/Feedback.jsx';
import { useAuth } from './store/auth.js';
import { connectSocket, disconnectSocket, getSocket } from './api/socket.js';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';

import Home from './pages/Home.jsx';
import Events from './pages/Events.jsx';
import EventDetail from './pages/EventDetail.jsx';
import Checkout from './pages/Checkout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import MyBookings from './pages/MyBookings.jsx';
import MyWaitlist from './pages/MyWaitlist.jsx';
import Verify from './pages/Verify.jsx';
import NotFound from './pages/NotFound.jsx';

// The two console pages are the only Recharts consumers — kept out of the public bundle.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

function SocketBridge() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }
    const socket = connectSocket();

    const onConfirmed = (payload) => {
      toast.success(`Booking confirmed — ticket ${payload.ticketCode}`);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    };
    const onExpired = () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    };
    const onPromoted = (payload) => {
      toast.success(`You're in! A seat opened up for "${payload.eventTitle}" — complete payment to keep it.`, { duration: 8000 });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    };

    socket.on('booking:confirmed', onConfirmed);
    socket.on('booking:expired', onExpired);
    socket.on('waitlist:promoted', onPromoted);
    return () => {
      socket.off('booking:confirmed', onConfirmed);
      socket.off('booking:expired', onExpired);
      socket.off('waitlist:promoted', onPromoted);
    };
  }, [user, queryClient, toast]);

  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Shell() {
  const element = useRoutes([
    { path: '/', element: <Home /> },
    { path: '/events', element: <Events /> },
    { path: '/events/:id', element: <EventDetail /> },
    { path: '/checkout/:bookingId', element: <ProtectedRoute><Checkout /></ProtectedRoute> },
    { path: '/login', element: <Login /> },
    { path: '/register', element: <Register /> },
    { path: '/bookings', element: <ProtectedRoute><MyBookings /></ProtectedRoute> },
    { path: '/waitlist', element: <ProtectedRoute><MyWaitlist /></ProtectedRoute> },
    { path: '/verify', element: <Verify /> },
    { path: '/verify/:code', element: <Verify /> },
    { path: '/dashboard', element: <ProtectedRoute roles={['organizer', 'admin']}><Dashboard /></ProtectedRoute> },
    { path: '/admin', element: <ProtectedRoute roles={['admin']}><Admin /></ProtectedRoute> },
    { path: '*', element: <NotFound /> },
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<PageFallback />}>{element}</Suspense>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  const init = useAuth((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <ToastProvider>
      <SocketBridge />
      <ScrollToTop />
      <Shell />
    </ToastProvider>
  );
}
