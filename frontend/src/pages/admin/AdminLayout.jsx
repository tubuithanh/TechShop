import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Dropdown, Offcanvas } from 'react-bootstrap';
import {
  Speedometer2,
  BoxSeam,
  Boxes,
  ReceiptCutoff,
  Shop,
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
  KeyFill,
  GeoAltFill,
  Images,
  Truck,
  Bicycle,
  List,
  LayoutSidebarInset,
  Search,
  BoxArrowRight,
  ChevronRight
} from 'react-bootstrap-icons';
import { useAuth } from '../../store/AuthContext';
import { useSettings } from '../../store/SettingsContext';
import { hasPagePermission } from '../../utils/permissions';
import { orderService } from '../../services/orderService';
import { chatService } from '../../services/chatService';
import { applyColorMode } from '../../utils/colorMode';
import './admin.css';

// Menu chia nhóm. Mỗi mục:
//  - perm: true  -> lọc theo nhóm quyền (utils/permissions.js)
//  - admin: true -> chỉ admin thấy (trang admin-only tuyệt đối, đã chặn thêm ở route + backend)
//  - badge: khóa số đếm hiển thị cạnh mục (đơn chờ xử lý, chat đang chờ)
const SECTIONS = [
  {
    title: 'Bán hàng',
    items: [
      { path: '/admin', label: 'Tổng quan', icon: Speedometer2, perm: true },
      { path: '/admin/orders', label: 'Đơn hàng', icon: ReceiptCutoff, perm: true, badge: 'orders' },
      { path: '/admin/pos', label: 'Bán tại quầy (POS)', icon: Shop, perm: true },
      { path: '/admin/deliveries', label: 'Phân công giao hàng', icon: Truck, perm: true },
      { path: '/admin/my-deliveries', label: 'Đơn tôi cần giao', icon: Bicycle, perm: true, staffOnly: true }
    ]
  },
  {
    title: 'Sản phẩm',
    items: [
      { path: '/admin/products', label: 'Sản phẩm', icon: BoxSeam, perm: true },
      { path: '/admin/inventory', label: 'Tồn kho chi nhánh', icon: Boxes, perm: true },
      { path: '/admin/vouchers', label: 'Khuyến mãi', icon: TagsFill, perm: true },
      { path: '/admin/reviews', label: 'Đánh giá', icon: Star, perm: true }
    ]
  },
  {
    title: 'Khách hàng',
    items: [
      { path: '/admin/customers', label: 'Khách hàng', icon: People, perm: true },
      { path: '/admin/warranties', label: 'Bảo hành', icon: ShieldCheck, perm: true },
      { path: '/admin/chat', label: 'Chat hỗ trợ', icon: ChatDots, perm: true, badge: 'chat' }
    ]
  },
  {
    title: 'Nội dung',
    items: [
      { path: '/admin/articles', label: 'Tin tức', icon: Newspaper, perm: true },
      { path: '/admin/slides', label: 'Slide trang chủ', icon: Images, admin: true }
    ]
  },
  {
    title: 'Hệ thống',
    items: [
      { path: '/admin/staff', label: 'Nhân viên', icon: PersonBadge, admin: true },
      { path: '/admin/permission-groups', label: 'Nhóm quyền', icon: KeyFill, admin: true },
      { path: '/admin/locations', label: 'Tỉnh thành & phường xã', icon: GeoAltFill, admin: true },
      { path: '/admin/audit-logs', label: 'Nhật ký thao tác', icon: ClockHistory, admin: true },
      { path: '/admin/settings', label: 'Cấu hình hệ thống', icon: Gear, admin: true }
    ]
  }
];

const COLLAPSE_KEY = 'admin.sidebarCollapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

function canSee(user, item) {
  const isAdmin = user?.role === 'admin';
  if (item.admin) return isAdmin;
  // "Đơn tôi cần giao" chỉ dành cho nhân viên giao hàng - quản trị viên không được phân công giao hàng
  if (item.staffOnly && isAdmin) return false;
  return hasPagePermission(user, item.path);
}

const isActive = (pathname, path) => (path === '/admin' ? pathname === '/admin' : pathname === path || pathname.startsWith(`${path}/`));

// Số đếm trên menu: đơn chờ xác nhận + hội thoại chat đang chờ. Làm mới mỗi 60s và khi đổi trang.
function useMenuBadges(user, pathname) {
  const [badges, setBadges] = useState({});
  const canOrders = hasPagePermission(user, '/admin/orders');
  const canChat = hasPagePermission(user, '/admin/chat');
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next = {};
      await Promise.all([
        canOrders &&
          orderService
            .getAllOrdersAdmin({ status: 'pending', limit: 1 })
            .then((r) => (next.orders = r.total || 0))
            .catch(() => {}),
        canChat &&
          chatService
            .getConversations('waiting', 1)
            .then((r) => (next.chat = r.counts?.waiting ?? r.total ?? 0))
            .catch(() => {})
      ]);
      if (alive) setBadges(next);
    };
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [canOrders, canChat, pathname]);
  return badges;
}

function SidebarNav({ sections, pathname, collapsed, badges, onNavigate }) {
  return (
    <nav className="admin-nav" aria-label="Menu quản trị">
      {sections.map((sec) => (
        <div key={sec.title} className="admin-nav-section">
          {!collapsed && <div className="admin-nav-title">{sec.title}</div>}
          {collapsed && <div className="admin-nav-divider" />}
          {sec.items.map((m) => {
            const active = isActive(pathname, m.path);
            const count = m.badge ? badges[m.badge] : 0;
            return (
              <Link
                key={m.path}
                to={m.path}
                onClick={onNavigate}
                className={`admin-nav-link${active ? ' active' : ''}`}
                title={collapsed ? m.label : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <span className="admin-nav-icon">
                  <m.icon size={17} />
                  {collapsed && count > 0 && <span className="admin-nav-dot" />}
                </span>
                {!collapsed && <span className="flex-grow-1 text-truncate">{m.label}</span>}
                {!collapsed && count > 0 && <span className="admin-nav-count">{count > 99 ? '99+' : count}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand({ settings, collapsed }) {
  return (
    <Link to="/admin" className="admin-brand">
      {settings.logoUrl ? (
        <img src={settings.logoUrl} alt="" className="admin-brand-logo" />
      ) : (
        <span className="admin-brand-mark">{(settings.siteName || 'T')[0]}</span>
      )}
      {!collapsed && (
        <span className="lh-sm">
          <span className="d-block fw-bold text-truncate">{settings.siteName || 'TechShop'}</span>
          <span className="d-block admin-brand-sub">Trang quản trị</span>
        </span>
      )}
    </Link>
  );
}

// Ô tìm nhanh trang quản trị: gõ tên trang -> Enter / bấm để chuyển. Phím tắt Ctrl+K
// (không dùng "/" vì các trang danh sách đã dùng "/" để nhảy tới ô tìm kiếm của trang).
function QuickSearch({ items }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const ref = useRef(null);
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const results = q.trim() ? items.filter((m) => norm(`${m.section} ${m.label}`).includes(norm(q.trim()))).slice(0, 8) : [];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (m) => {
    navigate(m.path);
    setQ('');
    setOpen(false);
    ref.current?.blur();
  };

  return (
    <div className="admin-search">
      <Search className="admin-search-icon" size={14} />
      <input
        ref={ref}
        value={q}
        placeholder="Tìm trang quản trị…"
        aria-label="Tìm trang quản trị"
        onChange={(e) => {
          setQ(e.target.value);
          setIdx(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setIdx((i) => Math.max(i - 1, 0));
          else if (e.key === 'Enter' && results[idx]) go(results[idx]);
          else if (e.key === 'Escape') ref.current?.blur();
        }}
      />
      <kbd className="admin-search-kbd d-none d-md-inline">Ctrl K</kbd>
      {open && results.length > 0 && (
        <div className="admin-search-results shadow">
          {results.map((m, i) => (
            <button
              key={m.path}
              type="button"
              className={`admin-search-item${i === idx ? ' active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(m)}
              onMouseEnter={() => setIdx(i)}
            >
              <m.icon size={15} />
              <span className="flex-grow-1">{m.label}</span>
              <span className="small text-muted">{m.section}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sections = useMemo(
    () => SECTIONS.map((s) => ({ ...s, items: s.items.filter((m) => canSee(user, m)) })).filter((s) => s.items.length),
    [user]
  );
  const flatItems = useMemo(() => sections.flatMap((s) => s.items.map((m) => ({ ...m, section: s.title }))), [sections]);
  const current = flatItems.find((m) => isActive(pathname, m.path));
  const badges = useMenuBadges(user, pathname);

  useEffect(() => setMobileOpen(false), [pathname]);

  // Trang quản trị luôn dùng giao diện sáng (kể cả modal/menu render ra ngoài khung) - rời trang quản trị thì
  // trả lại chế độ sáng/tối khách đã chọn ở trang bán hàng
  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', 'light');
    return () => applyColorMode();
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* trình duyệt chặn localStorage - chỉ không ghi nhớ */
      }
      return !c;
    });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const roleLabel = user?.role === 'admin' ? 'Quản trị viên' : user?.groupIds?.[0]?.name || 'Nhân viên';

  return (
    <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}`} data-bs-theme="light">
      {/* Sidebar desktop */}
      <aside className="admin-sidebar d-none d-lg-flex">
        <Brand settings={settings} collapsed={collapsed} />
        <SidebarNav sections={sections} pathname={pathname} collapsed={collapsed} badges={badges} />
        <Link to="/" className="admin-nav-link admin-nav-home" title={collapsed ? 'Về trang bán hàng' : undefined}>
          <span className="admin-nav-icon">
            <HouseDoor size={17} />
          </span>
          {!collapsed && <span>Về trang bán hàng</span>}
        </Link>
      </aside>

      {/* Sidebar mobile (trượt từ trái) */}
      <Offcanvas show={mobileOpen} onHide={() => setMobileOpen(false)} className="admin-sidebar admin-offcanvas" aria-label="Menu quản trị">
        <div className="d-flex align-items-center justify-content-between pe-2">
          <Brand settings={settings} />
          <button type="button" className="btn-close btn-close-white" aria-label="Đóng" onClick={() => setMobileOpen(false)} />
        </div>
        <SidebarNav sections={sections} pathname={pathname} badges={badges} onNavigate={() => setMobileOpen(false)} />
        <Link to="/" className="admin-nav-link admin-nav-home">
          <span className="admin-nav-icon">
            <HouseDoor size={17} />
          </span>
          <span>Về trang bán hàng</span>
        </Link>
      </Offcanvas>

      <div className="admin-body">
        <header className="admin-topbar">
          <button type="button" className="admin-icon-btn d-lg-none" aria-label="Mở menu" onClick={() => setMobileOpen(true)}>
            <List size={20} />
          </button>
          <button
            type="button"
            className="admin-icon-btn d-none d-lg-inline-flex"
            aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            onClick={toggleCollapsed}
          >
            <LayoutSidebarInset size={18} />
          </button>

          <div className="admin-breadcrumb d-none d-md-flex">
            <span className="text-muted">{current?.section || 'Quản trị'}</span>
            <ChevronRight size={11} className="text-muted" />
            <span className="fw-semibold">{current?.label || 'Trang quản trị'}</span>
          </div>

          <div className="ms-auto d-flex align-items-center gap-2">
            <QuickSearch items={flatItems} />
            <Dropdown align="end">
              <Dropdown.Toggle as="button" type="button" className="admin-user-btn">
                {user?.avatar ? (
                  <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="admin-user-initial">{(user?.name || user?.displayName || '?')[0]?.toUpperCase()}</span>
                )}
                <span className="d-none d-md-block text-start lh-sm">
                  <span className="d-block small fw-semibold text-truncate" style={{ maxWidth: 140 }}>
                    {user?.name || user?.displayName}
                  </span>
                  <span className="d-block admin-user-role">{roleLabel}</span>
                </span>
              </Dropdown.Toggle>
              <Dropdown.Menu className="shadow border-0">
                <Dropdown.Header>
                  <div className="fw-semibold text-body">{user?.name || user?.displayName}</div>
                  <div className="small">{user?.email}</div>
                </Dropdown.Header>
                <Dropdown.Divider />
                <Dropdown.Item as={Link} to="/">
                  <HouseDoor className="me-2" /> Về trang bán hàng
                </Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item onClick={handleLogout} className="text-danger">
                  <BoxArrowRight className="me-2" /> Đăng xuất
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </header>

        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
