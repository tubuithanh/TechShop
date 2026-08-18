import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../store/AuthContext';
import { useCart } from '../store/CartContext';

export default function Header() {
  const { user, logout } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    navigate(`/products?keyword=${encodeURIComponent(keyword)}`);
  };

  return (
    <header className="bg-red-600 text-white sticky top-0 z-50 shadow">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link to="/" className="text-xl font-bold whitespace-nowrap">
          TechShop
        </Link>

        <form onSubmit={handleSearch} className="flex-1 flex">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            type="text"
            placeholder="Bạn cần tìm gì hôm nay?"
            className="w-full rounded-l px-3 py-2 text-gray-900 outline-none"
          />
          <button type="submit" className="bg-red-800 px-4 rounded-r hover:bg-red-900">
            Tìm
          </button>
        </form>

        <Link to="/compare" className="hidden sm:block hover:underline whitespace-nowrap">
          So sánh
        </Link>
        <Link to="/stores" className="hidden sm:block hover:underline whitespace-nowrap">
          Cửa hàng
        </Link>
        <Link to="/promotions" className="hidden sm:block hover:underline whitespace-nowrap">
          Khuyến mãi
        </Link>
        <Link to="/tin-tuc" className="hidden sm:block hover:underline whitespace-nowrap">
          Tin tức
        </Link>

        <Link to="/cart" className="relative whitespace-nowrap">
          Giỏ hàng
          {totalItems > 0 && (
            <span className="absolute -top-2 -right-3 bg-yellow-400 text-red-700 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </Link>

        {user ? (
          <div className="relative group">
            <button className="whitespace-nowrap">👤 {(user.displayName || user.name || '').split(' ').pop()}</button>
            <div className="absolute right-0 hidden group-hover:block bg-white text-gray-800 rounded shadow-lg w-48 py-2">
              <Link to="/account/profile" className="block px-4 py-2 hover:bg-gray-100">
                Thông tin tài khoản
              </Link>
              <Link to="/account/addresses" className="block px-4 py-2 hover:bg-gray-100">
                Sổ địa chỉ
              </Link>
              <Link to="/account/wishlist" className="block px-4 py-2 hover:bg-gray-100">
                Sản phẩm yêu thích
              </Link>
              <Link to="/account/orders" className="block px-4 py-2 hover:bg-gray-100">
                Đơn hàng của tôi
              </Link>
              <Link to="/account/warranties" className="block px-4 py-2 hover:bg-gray-100">
                Bảo hành
              </Link>
              <Link to="/account/notifications" className="block px-4 py-2 hover:bg-gray-100">
                Thông báo
              </Link>
              {['admin', 'staff'].includes(user.role) && (
                <Link to="/admin" className="block px-4 py-2 hover:bg-gray-100 border-t">
                  Trang quản trị
                </Link>
              )}
              <button
                onClick={async () => {
                  await logout();
                  navigate('/');
                }}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600 border-t"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        ) : (
          <Link to="/login" className="whitespace-nowrap">
            Đăng nhập
          </Link>
        )}
      </div>
    </header>
  );
}
