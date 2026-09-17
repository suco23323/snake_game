import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth-context';

export function ProtectedRoute({ children }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="page-loading">
        <div className="loading-spinner" />
        <p>正在检查登录状态...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
