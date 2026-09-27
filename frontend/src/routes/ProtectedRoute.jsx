import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/common/Feedback';

/** Requires a signed-in user and, optionally, a permission. */
export default function ProtectedRoute({ children, permission }) {
  const { user, status, can } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingSpinner label="Loading your workspace" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (permission && !can(permission)) {
    return (
      <section className="panel">
        <h2>You do not have access to this page</h2>
        <p className="sub">You are signed in as {user.name} ({user.role}). Ask an administrator if you need access.</p>
      </section>
    );
  }
  return children;
}
