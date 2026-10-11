import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth.js';
import { Spinner } from '../components/ui/Feedback.jsx';

export function ProtectedRoute({ children, roles }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <div className="min-h-[60vh]"><Spinner /></div>;
  if (status === 'guest') return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
