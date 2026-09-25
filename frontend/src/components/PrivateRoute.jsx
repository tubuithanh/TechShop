import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { hasPagePermission } from '../utils/permissions';

// Bảo vệ route yêu cầu đăng nhập, có thể giới hạn theo vai trò (roles) và/hoặc theo quyền chi tiết
// (permissionPath - khớp với 1 key trong utils/permissions.js). "permissionPath" chỉ có tác dụng với
// role='staff' (admin luôn qua được, customer bị chặn ở bước roles phía trên rồi).
export default function PrivateRoute({ children, roles, permissionPath }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="text-center py-5">Đang tải...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  // Điều hướng về trang chủ (không phải /admin) khi thiếu quyền - nếu redirect về /admin và chính
  // /admin (Dashboard) cũng nằm trong permissionPath bị chặn, sẽ tạo vòng lặp redirect vô hạn.
  if (permissionPath && !hasPagePermission(user, permissionPath)) return <Navigate to="/" replace />;

  return children;
}
