import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';

// Bảo vệ route yêu cầu đăng nhập, có thể giới hạn theo vai trò (roles)
export default function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="text-center py-5">Đang tải...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}
