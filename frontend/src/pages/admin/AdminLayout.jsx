import { Link, Outlet, useLocation } from 'react-router-dom';
import { Nav } from 'react-bootstrap';
import {
  Speedometer2,
  BoxSeam,
  Boxes,
  ReceiptCutoff,
  ShieldCheck,
  People,
  TagsFill,
  Star,
  Newspaper,
  ChatDots,
  ClockHistory,
  HouseDoor,
  Gear,
  PersonBadge,
  KeyFill
} from 'react-bootstrap-icons';
import { useAuth } from '../../store/AuthContext';

const menu = [
  { path: '/admin', label: 'Tổng quan (Dashboard)', icon: Speedometer2 },
  { path: '/admin/products', label: 'Quản lý sản phẩm', icon: BoxSeam },
  { path: '/admin/inventory', label: 'Quản lý tồn kho (đa chi nhánh)', icon: Boxes },
  { path: '/admin/orders', label: 'Quản lý đơn hàng', icon: ReceiptCutoff },
  { path: '/admin/warranties', label: 'Quản lý bảo hành', icon: ShieldCheck },
  { path: '/admin/customers', label: 'Quản lý khách hàng', icon: People },
  { path: '/admin/vouchers', label: 'Quản lý khuyến mãi', icon: TagsFill },
  { path: '/admin/reviews', label: 'Quản lý đánh giá', icon: Star },
  { path: '/admin/articles', label: 'Quản lý tin tức (CMS)', icon: Newspaper },
  { path: '/admin/chat', label: 'Chat với khách hàng', icon: ChatDots },
  { path: '/admin/audit-logs', label: 'Nhật ký thao tác', icon: ClockHistory },
  { path: '/admin/settings', label: 'Cấu hình hệ thống', icon: Gear }
];

// Chỉ admin thấy được - quản lý tài khoản nhân viên/nhóm quyền là thao tác cấu trúc nhạy cảm
// (đã chặn thêm ở tầng route bằng PrivateRoute roles={['admin']}, đây chỉ là ẩn bớt ở giao diện).
const adminOnlyMenu = [
  { path: '/admin/staff', label: 'Quản lý nhân viên', icon: PersonBadge },
  { path: '/admin/permission-groups', label: 'Nhóm quyền', icon: KeyFill }
];

export default function AdminLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const fullMenu = user?.role === 'admin' ? [...menu, ...adminOnlyMenu] : menu;
  return (
    <div className="d-flex min-vh-100">
      <aside className="bg-dark text-white p-3" style={{ width: '14rem', flexShrink: 0 }}>
        <h2 className="fw-bold fs-6 mb-4 d-flex align-items-center gap-2">
          <Speedometer2 size={18} /> Trang quản trị
        </h2>
        <Nav className="flex-column gap-1">
          {fullMenu.map((m) => (
            <Nav.Link
              key={m.path}
              as={Link}
              to={m.path}
              className={`rounded-3 small d-flex align-items-center gap-2 ${
                location.pathname === m.path ? 'bg-primary text-white' : 'text-white-50'
              }`}
            >
              <m.icon size={16} className="flex-shrink-0" />
              {m.label}
            </Nav.Link>
          ))}
          <Nav.Link as={Link} to="/" className="rounded-3 small text-muted mt-3 d-flex align-items-center gap-2">
            <HouseDoor size={16} /> Về trang chủ
          </Nav.Link>
        </Nav>
      </aside>
      <main className="flex-grow-1 bg-light p-4">
        <Outlet />
      </main>
    </div>
  );
}
