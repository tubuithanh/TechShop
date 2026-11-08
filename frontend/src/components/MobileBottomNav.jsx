import { NavLink } from 'react-router-dom';
import { House, Grid, Cart3, Person, Newspaper } from 'react-bootstrap-icons';
import { useCart } from '../store/CartContext';
import { useAuth } from '../store/AuthContext';

// Thanh điều hướng cố định cuối màn hình điện thoại (< 992px): 5 lối tắt hay dùng nhất.
export default function MobileBottomNav() {
  const { totalItems } = useCart();
  const { user } = useAuth();
  const items = [
    { to: '/', label: 'Trang chủ', icon: House, end: true },
    { to: '/products', label: 'Sản phẩm', icon: Grid },
    { to: '/tin-tuc', label: 'Tin tức', icon: Newspaper },
    { to: '/cart', label: 'Giỏ hàng', icon: Cart3, badge: totalItems, cart: true },
    { to: user?.role === 'customer' ? '/account/profile' : '/login', label: user ? 'Tài khoản' : 'Đăng nhập', icon: Person }
  ];
  return (
    <nav className="mobile-bottom-nav d-lg-none" aria-label="Điều hướng nhanh">
      {items.map((it) => (
        <NavLink key={it.label} to={it.to} end={it.end} className="mobile-bottom-link">
          <span className="position-relative" {...(it.cart ? { 'data-cart-target': '' } : {})}>
            <it.icon size={20} />
            {it.badge > 0 && <span className="mobile-bottom-badge">{it.badge > 99 ? '99+' : it.badge}</span>}
          </span>
          <span>{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
