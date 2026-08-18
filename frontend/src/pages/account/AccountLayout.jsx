import { Link, Outlet, useLocation } from 'react-router-dom';

const menu = [
  { path: '/account/profile', label: 'Thông tin tài khoản' },
  { path: '/account/addresses', label: 'Sổ địa chỉ' },
  { path: '/account/wishlist', label: 'Sản phẩm yêu thích' },
  { path: '/account/orders', label: 'Đơn hàng của tôi' },
  { path: '/account/warranties', label: 'Bảo hành' },
  { path: '/account/notifications', label: 'Thông báo' }
];

export default function AccountLayout() {
  const location = useLocation();
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-4 gap-6">
      <aside className="md:col-span-1">
        <nav className="bg-white border rounded-lg divide-y">
          {menu.map((m) => (
            <Link
              key={m.path}
              to={m.path}
              className={`block px-4 py-3 text-sm ${
                location.pathname === m.path ? 'text-red-600 font-medium bg-red-50' : 'text-gray-700'
              }`}
            >
              {m.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="md:col-span-3">
        <Outlet />
      </main>
    </div>
  );
}
