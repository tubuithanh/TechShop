import { Link, Outlet, useLocation } from 'react-router-dom';

const menu = [
  { path: '/admin', label: 'Tổng quan (Dashboard)' },
  { path: '/admin/products', label: 'Quản lý sản phẩm' },
  { path: '/admin/inventory', label: 'Quản lý tồn kho (đa chi nhánh)' },
  { path: '/admin/orders', label: 'Quản lý đơn hàng' },
  { path: '/admin/warranties', label: 'Quản lý bảo hành' },
  { path: '/admin/customers', label: 'Quản lý khách hàng' },
  { path: '/admin/vouchers', label: 'Quản lý khuyến mãi' },
  { path: '/admin/reviews', label: 'Quản lý đánh giá' },
  { path: '/admin/articles', label: 'Quản lý tin tức (CMS)' },
  { path: '/admin/chat', label: 'Chat với khách hàng' },
  { path: '/admin/audit-logs', label: 'Nhật ký thao tác' }
];

export default function AdminLayout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 bg-gray-900 text-white p-4">
        <h2 className="font-bold mb-6">⚙️ Trang quản trị</h2>
        <nav className="space-y-1">
          {menu.map((m) => (
            <Link
              key={m.path}
              to={m.path}
              className={`block px-3 py-2 rounded text-sm ${
                location.pathname === m.path ? 'bg-red-600' : 'hover:bg-gray-800'
              }`}
            >
              {m.label}
            </Link>
          ))}
          <Link to="/" className="block px-3 py-2 rounded text-sm hover:bg-gray-800 mt-4 text-gray-400">
            ← Về trang chủ
          </Link>
        </nav>
      </aside>
      <main className="flex-1 bg-gray-50 p-6">
        <Outlet />
      </main>
    </div>
  );
}
